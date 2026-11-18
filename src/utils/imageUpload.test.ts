import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTenantStoragePath,
  computeScaledDimensions,
  generateDraftEntityId,
  isValidImageUrl,
  isValidTenantStoragePath,
  MAX_RAW_IMAGE_BYTES,
  resolveMenuImageKind,
  sanitizeOptionalImagePath,
  sanitizeOptionalImageUrl,
  validateImageFileMeta,
} from './imageUpload.ts';

test('validateImageFileMeta accepts JPG, PNG and WebP under 8MB and rejects invalid files', () => {
  assert.equal(
    validateImageFileMeta({ type: 'image/jpeg', size: 1024 * 500 }).valid,
    true,
  );
  assert.equal(
    validateImageFileMeta({ type: 'image/png', size: 1024 * 1024 }).valid,
    true,
  );
  assert.equal(
    validateImageFileMeta({ type: 'image/webp', size: 2048 }).valid,
    true,
  );

  const gif = validateImageFileMeta({ type: 'image/gif', size: 1024 });
  assert.equal(gif.valid, false);

  const svg = validateImageFileMeta({ type: 'image/svg+xml', size: 1024 });
  assert.equal(svg.valid, false);

  const tooBig = validateImageFileMeta({
    type: 'image/jpeg',
    size: MAX_RAW_IMAGE_BYTES + 1,
  });
  assert.equal(tooBig.valid, false);
});

test('computeScaledDimensions scales down preserving aspect ratio without upscaling', () => {
  assert.deepEqual(computeScaledDimensions(1600, 1200, 800, 800), {
    width: 800,
    height: 600,
  });
  assert.deepEqual(computeScaledDimensions(2880, 1080, 1440, 720), {
    width: 1440,
    height: 540,
  });
  assert.deepEqual(computeScaledDimensions(400, 300, 800, 800), {
    width: 400,
    height: 300,
  });
});

test('buildTenantStoragePath & isValidTenantStoragePath enforce canonical hierarchy and cross-tenant isolation', () => {
  const mgwProductPath = buildTenantStoragePath(
    'mgw_lanches',
    'products',
    'X-Salada Especial',
    'webp',
    1700000000000,
    'abc123',
    'prod_xsalada_1',
  );
  const gfBannerPath = buildTenantStoragePath(
    'gf_lanches',
    'branding',
    'banner',
    'webp',
    1700000000000,
    'xyz789',
  );
  const mgwLogoPath = buildTenantStoragePath(
    'mgw_lanches',
    'branding',
    'logo',
    'webp',
    1700000000000,
    'logo12',
  );

  assert.equal(
    mgwProductPath,
    'tenants/mgw_lanches/products/prod_xsalada_1/x-salada_especial_1700000000000_abc123.webp',
  );
  assert.equal(
    gfBannerPath,
    'tenants/gf_lanches/branding/banner/banner_1700000000000_xyz789.webp',
  );
  assert.equal(
    mgwLogoPath,
    'tenants/mgw_lanches/branding/logo/logo_1700000000000_logo12.webp',
  );

  assert.equal(isValidTenantStoragePath(mgwProductPath, 'mgw_lanches'), true);
  assert.equal(isValidTenantStoragePath(mgwProductPath, 'gf_lanches'), false);

  assert.equal(isValidTenantStoragePath(gfBannerPath, 'gf_lanches'), true);
  assert.equal(isValidTenantStoragePath(gfBannerPath, 'mgw_lanches'), false);

  assert.equal(isValidTenantStoragePath(mgwLogoPath, 'mgw_lanches'), true);
  assert.equal(isValidTenantStoragePath(mgwLogoPath, 'gf_lanches'), false);

  // Supports future tenant slug format safely while still isolating tenants
  const tenant3Path = buildTenantStoragePath(
    'terceiro_lanche',
    'combos',
    'Combo 3',
    'webp',
    1700000000000,
    'c3',
    'combo_3',
  );
  assert.equal(isValidTenantStoragePath(tenant3Path, 'terceiro_lanche'), true);
  assert.equal(isValidTenantStoragePath(tenant3Path, 'mgw_lanches'), false);

  // Reject invalid tenant slugs, traversal, encoded slashes, query/hash
  assert.throws(() =>
    buildTenantStoragePath('Invalid Tenant!', 'products', 'x', 'webp'),
  );
  assert.equal(
    isValidTenantStoragePath('tenants/mgw_lanches/../gf_lanches/products/p1/a.webp', 'mgw_lanches'),
    false,
  );
  assert.equal(
    isValidTenantStoragePath('tenants/mgw_lanches/products/p1%2Fa.webp', 'mgw_lanches'),
    false,
  );
  assert.equal(
    isValidTenantStoragePath('tenants/mgw_lanches/products/p1/a.webp?token=1', 'mgw_lanches'),
    false,
  );
});

test('resolveMenuImageKind and generateDraftEntityId produce valid canonical values', () => {
  assert.equal(resolveMenuImageKind('branding', 'logo'), 'logo');
  assert.equal(resolveMenuImageKind('branding', 'banner'), 'banner');
  assert.equal(resolveMenuImageKind('products', 'X-Salada'), 'product');
  assert.equal(resolveMenuImageKind('combos', 'Combo 1'), 'combo');

  const prodId = generateDraftEntityId('prod');
  const comboId = generateDraftEntityId('combo');
  assert.match(prodId, /^prod_[a-z0-9]+_[a-z0-9]+$/);
  assert.match(comboId, /^combo_[a-z0-9]+_[a-z0-9]+$/);
});

test('isValidImageUrl & sanitizers strictly block Base64 data URIs and cross-tenant paths', () => {
  const supabaseUrl =
    'https://rlinibriiwbkdqjrfapd.supabase.co/storage/v1/object/public/mgw-cardapios/tenants/mgw_lanches/branding/logo/1700000000000_abc123.webp';
  assert.equal(isValidImageUrl(supabaseUrl), true);
  assert.equal(sanitizeOptionalImageUrl(supabaseUrl), supabaseUrl);

  assert.equal(
    isValidImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA'),
    false,
  );
  assert.equal(
    sanitizeOptionalImageUrl('data:image/webp;base64,AAAA'),
    '',
  );
  assert.equal(isValidImageUrl('http://example.com/foto.jpg'), false);
  assert.equal(isValidImageUrl('javascript:alert(1)'), false);

  assert.equal(
    sanitizeOptionalImagePath('tenants/gf_lanches/products/p1/item.webp', 'mgw_lanches'),
    '',
  );
  assert.equal(
    sanitizeOptionalImagePath('tenants/mgw_lanches/products/p1/item.webp', 'mgw_lanches'),
    'tenants/mgw_lanches/products/p1/item.webp',
  );
});
