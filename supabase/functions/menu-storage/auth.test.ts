import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMenuImagePermission,
  buildCanonicalMenuStoragePath,
  buildCorsHeaders,
  inferMenuImageKindFromPath,
  MAX_MENU_IMAGE_BYTES,
  MenuStorageAuthError,
  normalizeTenantId,
  resolveCorsOrigin,
  validateTenantDeletePath,
} from './auth.ts';

test('normalizeTenantId accepts uppercase/whitespace UUIDs and rejects invalid values', () => {
  const upperUuid = '  A1B2C3D4-E5F6-4789-ABCD-0123456789EF  ';
  const normalized = normalizeTenantId(upperUuid);
  assert.equal(normalized, 'a1b2C3d4-e5f6-4789-abcd-0123456789ef'.toLowerCase());

  const target = buildCanonicalMenuStoragePath({
    authorizedTenantId: normalized,
    kind: 'logo',
    contentType: 'image/webp',
    fileSize: 1024,
    nowMs: 1700000000123,
    uniqueId: 'norm01',
  });
  assert.equal(
    target.path,
    'tenants/a1b2c3d4-e5f6-4789-abcd-0123456789ef/branding/logo/1700000000123_norm01.webp',
  );
  assert.equal(
    validateTenantDeletePath({
      authorizedTenantId: normalized,
      rawPath: target.path,
    }),
    target.path,
  );

  assert.throws(
    () => normalizeTenantId('../other-tenant'),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 400 && e.code === 'invalid_tenant_id',
  );
  assert.throws(
    () => normalizeTenantId(null),
    (e: unknown) => e instanceof MenuStorageAuthError && e.status === 400,
  );
});

test('CORS helper supports env allowlist and controlled fallback when unset', () => {
  assert.equal(resolveCorsOrigin('http://localhost:3000', undefined), '*');
  assert.equal(resolveCorsOrigin('https://preview.run.app', ''), '*');

  const configuredEnv = 'https://app.mgwgestao.com.br, http://localhost:3000';
  assert.equal(
    resolveCorsOrigin('https://app.mgwgestao.com.br', configuredEnv),
    'https://app.mgwgestao.com.br',
  );
  assert.equal(
    resolveCorsOrigin('http://localhost:3000', configuredEnv),
    'http://localhost:3000',
  );
  assert.equal(
    resolveCorsOrigin('https://evil.example.com', configuredEnv),
    null,
  );

  const allowedHeaders = buildCorsHeaders({
    requestOrigin: 'https://app.mgwgestao.com.br',
    allowedOriginsEnv: configuredEnv,
  });
  assert.equal(allowedHeaders['Access-Control-Allow-Origin'], 'https://app.mgwgestao.com.br');
  assert.equal(allowedHeaders.Vary, 'Origin');

  const blockedHeaders = buildCorsHeaders({
    requestOrigin: 'https://evil.example.com',
    allowedOriginsEnv: configuredEnv,
  });
  assert.equal(blockedHeaders['Access-Control-Allow-Origin'], undefined);
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

test('image permissions enforce owner/admin branding and manager catalog access', () => {
  assert.doesNotThrow(() => assertMenuImagePermission('owner', 'logo'));
  assert.doesNotThrow(() => assertMenuImagePermission('admin', 'banner'));
  assert.doesNotThrow(() => assertMenuImagePermission('manager', 'product'));
  assert.doesNotThrow(() => assertMenuImagePermission('manager', 'combo'));
  assert.throws(() => assertMenuImagePermission('staff', 'product'), (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403);
  assert.throws(() => assertMenuImagePermission('manager', 'logo'), (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403);
  assert.throws(() => assertMenuImagePermission('staff', 'banner'), (e: unknown) => e instanceof MenuStorageAuthError && e.status === 403);
});

test('delete path resolves its category before role authorization', () => {
  assert.equal(inferMenuImageKindFromPath('tenants/mgw_lanches/branding/logo/1700000000000_a.webp'), 'logo');
  assert.equal(inferMenuImageKindFromPath('tenants/mgw_lanches/branding/banner/1700000000000_a.webp'), 'banner');
  assert.equal(inferMenuImageKindFromPath('tenants/mgw_lanches/products/prod_1/1700000000000_a.webp'), 'product');
  assert.equal(inferMenuImageKindFromPath('tenants/mgw_lanches/combos/combo_1/1700000000000_a.webp'), 'combo');
});
