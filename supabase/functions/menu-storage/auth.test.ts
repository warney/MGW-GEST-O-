import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCanonicalMenuStoragePath,
  MAX_MENU_IMAGE_BYTES,
  MenuStorageAuthError,
  parseTenantMembershipRegistry,
  resolveAuthorizedTenantForIdentity,
  validateFirebaseClaims,
  validateTenantDeletePath,
} from './auth.ts';

const NOW = 1_800_000_000;

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://securetoken.google.com/intelligent-crossing-bmbw7',
    aud: 'intelligent-crossing-bmbw7',
    sub: 'firebase-uid-123',
    email: 'warney.fernandes22@gmail.com',
    email_verified: true,
    iat: NOW - 60,
    auth_time: NOW - 120,
    exp: NOW + 3500,
    firebase: { sign_in_provider: 'google.com' },
    ...overrides,
  };
}

test('validateFirebaseClaims accepts valid Firebase ID Token claims and rejects expired/wrong-aud/unverified tokens', () => {
  const ok = validateFirebaseClaims(
    makeValidPayload(),
    'intelligent-crossing-bmbw7',
    NOW,
  );
  assert.equal(ok.email, 'warney.fernandes22@gmail.com');
  assert.equal(ok.uid, 'firebase-uid-123');

  assert.throws(
    () =>
      validateFirebaseClaims(
        makeValidPayload({ exp: NOW - 1 }),
        'intelligent-crossing-bmbw7',
        NOW,
      ),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 401,
  );

  assert.throws(
    () =>
      validateFirebaseClaims(
        makeValidPayload({ aud: 'outro-projeto' }),
        'intelligent-crossing-bmbw7',
        NOW,
      ),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 401,
  );

  assert.throws(
    () =>
      validateFirebaseClaims(
        makeValidPayload({ iss: 'https://evil.example.com' }),
        'intelligent-crossing-bmbw7',
        NOW,
      ),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 401,
  );

  assert.throws(
    () =>
      validateFirebaseClaims(
        makeValidPayload({ email_verified: false }),
        'intelligent-crossing-bmbw7',
        NOW,
      ),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 401,
  );
});

test('resolveAuthorizedTenantForIdentity prevents cross-tenant spoofing across mgw_lanches, gf_lanches, and custom registries', () => {
  const mgwUser = validateFirebaseClaims(
    makeValidPayload({ email: 'warney.fernandes22@gmail.com' }),
    'intelligent-crossing-bmbw7',
    NOW,
  );
  const gfUser = validateFirebaseClaims(
    makeValidPayload({ email: 'gf3163666@gmail.com' }),
    'intelligent-crossing-bmbw7',
    NOW,
  );
  const stranger = validateFirebaseClaims(
    makeValidPayload({ email: 'intruso@gmail.com' }),
    'intelligent-crossing-bmbw7',
    NOW,
  );

  assert.equal(
    resolveAuthorizedTenantForIdentity({
      identity: mgwUser,
      requestedTenantId: 'mgw_lanches',
    }),
    'mgw_lanches',
  );

  // MGW tentando enviar tenantId gf_lanches -> 403
  assert.throws(
    () =>
      resolveAuthorizedTenantForIdentity({
        identity: mgwUser,
        requestedTenantId: 'gf_lanches',
      }),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403,
  );

  // GF tentando enviar tenantId mgw_lanches -> 403
  assert.throws(
    () =>
      resolveAuthorizedTenantForIdentity({
        identity: gfUser,
        requestedTenantId: 'mgw_lanches',
      }),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403,
  );

  // Terceiro usuário sem vínculo -> 403
  assert.throws(
    () =>
      resolveAuthorizedTenantForIdentity({
        identity: stranger,
        requestedTenantId: 'mgw_lanches',
      }),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403,
  );

  // Suporte dinâmico a um 3º estabelecimento via TENANT_MEMBERS_JSON mantendo isolamento
  const customRegistry = parseTenantMembershipRegistry(
    JSON.stringify({
      'warney.fernandes22@gmail.com': ['mgw_lanches'],
      'gf3163666@gmail.com': ['gf_lanches'],
      'terceiro@lanches.com': ['terceira_loja'],
    }),
  );
  const thirdUser = validateFirebaseClaims(
    makeValidPayload({ email: 'terceiro@lanches.com' }),
    'intelligent-crossing-bmbw7',
    NOW,
  );
  assert.equal(
    resolveAuthorizedTenantForIdentity({
      identity: thirdUser,
      requestedTenantId: 'terceira_loja',
      membershipRegistry: customRegistry,
    }),
    'terceira_loja',
  );
  assert.throws(
    () =>
      resolveAuthorizedTenantForIdentity({
        identity: thirdUser,
        requestedTenantId: 'mgw_lanches',
        membershipRegistry: customRegistry,
      }),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403,
  );
});

test('buildCanonicalMenuStoragePath enforces exact folder hierarchy, 2MB cap, and MIME whitelist', () => {
  const logo = buildCanonicalMenuStoragePath({
    authorizedTenantId: 'mgw_lanches',
    kind: 'logo',
    contentType: 'image/webp',
    fileSize: 45_000,
    nowMs: 1700000000000,
    uniqueId: 'abc123',
  });
  assert.equal(
    logo.path,
    'tenants/mgw_lanches/branding/logo/1700000000000_abc123.webp',
  );

  const banner = buildCanonicalMenuStoragePath({
    authorizedTenantId: 'gf_lanches',
    kind: 'banner',
    contentType: 'image/jpeg',
    fileSize: 320_000,
    nowMs: 1700000000001,
    uniqueId: 'def456',
  });
  assert.equal(
    banner.path,
    'tenants/gf_lanches/branding/banner/1700000000001_def456.jpg',
  );

  const prod = buildCanonicalMenuStoragePath({
    authorizedTenantId: 'mgw_lanches',
    kind: 'product',
    entityId: 'prod_xsalada',
    contentType: 'image/webp',
    fileSize: 120_000,
    nowMs: 1700000000002,
    uniqueId: 'ghi789',
  });
  assert.equal(
    prod.path,
    'tenants/mgw_lanches/products/prod_xsalada/1700000000002_ghi789.webp',
  );

  // Bloqueia traversal em entityId, >2MB e SVG
  assert.throws(() =>
    buildCanonicalMenuStoragePath({
      authorizedTenantId: 'mgw_lanches',
      kind: 'product',
      entityId: '../gf_lanches',
      contentType: 'image/webp',
      fileSize: 1000,
    }),
  );
  assert.throws(() =>
    buildCanonicalMenuStoragePath({
      authorizedTenantId: 'mgw_lanches',
      kind: 'logo',
      contentType: 'image/webp',
      fileSize: MAX_MENU_IMAGE_BYTES + 1,
    }),
  );
  assert.throws(() =>
    buildCanonicalMenuStoragePath({
      authorizedTenantId: 'mgw_lanches',
      kind: 'logo',
      contentType: 'image/svg+xml',
      fileSize: 1000,
    }),
  );
});

test('validateTenantDeletePath blocks cross-tenant deletion and path traversal', () => {
  assert.equal(
    validateTenantDeletePath({
      authorizedTenantId: 'mgw_lanches',
      rawPath: 'tenants/mgw_lanches/branding/logo/1700000000000_abc.webp',
    }),
    'tenants/mgw_lanches/branding/logo/1700000000000_abc.webp',
  );

  assert.throws(
    () =>
      validateTenantDeletePath({
        authorizedTenantId: 'mgw_lanches',
        rawPath: 'tenants/gf_lanches/branding/logo/1700000000000_abc.webp',
      }),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403,
  );

  assert.throws(
    () =>
      validateTenantDeletePath({
        authorizedTenantId: 'mgw_lanches',
        rawPath: 'tenants/mgw_lanches/../gf_lanches/products/x/a.webp',
      }),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403,
  );
});
