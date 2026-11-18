import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCanonicalMenuStoragePath,
  MAX_MENU_IMAGE_BYTES,
  MenuStorageAuthError,
  validateTenantDeletePath,
} from './auth.ts';

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
