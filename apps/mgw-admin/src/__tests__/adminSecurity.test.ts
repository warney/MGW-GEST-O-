import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  canAccessModule,
  canManagePlatformAdmins,
  canManageSubscriptions,
  canMutateTenantsOrPlans,
  canReplySupportTickets,
  formatCurrencyCents,
  formatRoleLabel,
} from '../services/rbac';
import {
  isPendingMigrationError,
  PendingMigrationError,
} from '../services/adminApi';
import {
  buildClientRegistrationHistory,
  filterAndSortClients,
  filterEstablishments,
  resolveClientAccountStatus,
} from '../services/directoryFilters';
import type { ClientRecord, EstablishmentRecord } from '../types/admin';

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

const MIGRATION_4_1_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/migrations/20261122171122_etapa4_1_platform_admin_security_and_audit.sql',
);
const MIGRATION_PHASE1_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/migrations/20261126120000_mgw_admin_phase1_stability_and_rpcs.sql',
);
const MIGRATION_PHASE3_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/migrations/20261126140000_mgw_admin_phase3_operations_finance_and_audit.sql',
);
const MIGRATION_PHASE4_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/migrations/20261126150000_mgw_admin_phase4_public_runtime_status.sql',
);
const BOOTSTRAP_SEED_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/seeds/002_platform_admin_bootstrap.sql',
);

const migrationSql = fs.readFileSync(MIGRATION_4_1_PATH, 'utf8');
const migrationPhase1Sql = fs.readFileSync(MIGRATION_PHASE1_PATH, 'utf8');
const migrationPhase3Sql = fs.readFileSync(MIGRATION_PHASE3_PATH, 'utf8');
const migrationPhase4Sql = fs.readFileSync(MIGRATION_PHASE4_PATH, 'utf8');
const bootstrapSql = fs.readFileSync(BOOTSTRAP_SEED_PATH, 'utf8');

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

test('RBAC matrix enforces strict platform role boundaries', () => {
  assert.equal(canAccessModule('super_admin', 'admins'), true);
  assert.equal(canAccessModule('super_admin', 'finance'), true);
  assert.equal(canAccessModule('support', 'admins'), false);
  assert.equal(canAccessModule('support', 'finance'), false);
  assert.equal(canAccessModule('support', 'support'), true);
  assert.equal(canAccessModule('finance', 'finance'), true);
  assert.equal(canAccessModule('finance', 'admins'), false);

  assert.equal(canMutateTenantsOrPlans('super_admin'), true);
  assert.equal(canMutateTenantsOrPlans('support'), false);
  assert.equal(canMutateTenantsOrPlans('finance'), false);

  assert.equal(canManageSubscriptions('super_admin'), true);
  assert.equal(canManageSubscriptions('finance'), true);
  assert.equal(canManageSubscriptions('support'), false);

  assert.equal(canReplySupportTickets('super_admin'), true);
  assert.equal(canReplySupportTickets('support'), true);
  assert.equal(canReplySupportTickets('finance'), false);

  assert.equal(canManagePlatformAdmins('super_admin'), true);
  assert.equal(canManagePlatformAdmins('support'), false);
});

test('Zero Firebase, zero direct table queries, and zero hardcoded secrets in apps/mgw-admin', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.devDependencies ?? {}),
  };
  for (const depName of Object.keys(allDeps)) {
    assert.equal(depName.toLowerCase().includes('firebase'), false, `Unexpected Firebase dep: ${depName}`);
  }

  const sourceFiles = walkFiles(path.join(APP_ROOT, 'src'));
  for (const filePath of sourceFiles) {
    if (filePath.endsWith('adminSecurity.test.ts')) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      /firebase/i.test(content),
      false,
      `Forbidden Firebase reference in ${path.relative(APP_ROOT, filePath)}`,
    );
    assert.equal(
      /SERVICE_ROLE_KEY/i.test(content),
      false,
      `Forbidden service_role reference in ${path.relative(APP_ROOT, filePath)}`,
    );
    assert.equal(
      /eyJhbGciOiJIUzI1NiIs/.test(content),
      false,
      `Hardcoded JWT detected in ${path.relative(APP_ROOT, filePath)}`,
    );
    assert.equal(
      /supabase\.from\(/.test(content),
      false,
      `Direct table query bypass detected in ${path.relative(APP_ROOT, filePath)}; use audited RPCs only`,
    );
  }
});

test('PendingMigrationError detection accurately identifies missing remote RPCs', () => {
  assert.equal(isPendingMigrationError(new PendingMigrationError('pendente')), true);
  assert.equal(
    isPendingMigrationError(new Error('Could not find the function public.admin_list_clients')),
    true,
  );
  assert.equal(isPendingMigrationError(new Error('PGRST202: missing rpc')), true);
  assert.equal(isPendingMigrationError(new Error('Invalid login credentials')), false);
});

test('Clients directory filters, account status, and registration history behave accurately', () => {
  const baseClients: ClientRecord[] = [
    {
      user_id: 'u-1',
      email: 'alice@loja.com',
      full_name: 'Alice Proprietária',
      email_confirmed_at: '2026-11-10T12:00:00Z',
      last_sign_in_at: '2026-11-21T14:00:00Z',
      created_at: '2026-11-10T11:55:00Z',
      banned_until: null,
      default_tenant_id: 't-1',
      is_platform_admin: false,
      memberships: [
        {
          memberId: 'm-1',
          tenantId: 't-1',
          tenantName: 'Lanche A',
          tenantSlug: 'lanche-a',
          tenantStatus: 'active',
          role: 'owner',
          memberActive: true,
          isFounder: false,
          subscriptionStatus: 'trialing',
          planCode: 'trial',
        },
      ],
    },
    {
      user_id: 'u-2',
      email: 'bruno@equipe.com',
      full_name: 'Bruno Gerente',
      email_confirmed_at: null,
      last_sign_in_at: null,
      created_at: '2026-11-20T09:00:00Z',
      banned_until: null,
      default_tenant_id: 't-1',
      is_platform_admin: false,
      memberships: [
        {
          memberId: 'm-2',
          tenantId: 't-1',
          tenantName: 'Lanche A',
          tenantSlug: 'lanche-a',
          tenantStatus: 'active',
          role: 'manager',
          memberActive: false,
          isFounder: false,
          subscriptionStatus: 'trialing',
          planCode: 'trial',
        },
      ],
    },
  ];

  assert.equal(
    filterAndSortClients(baseClients, {
      accountFilter: 'verified',
      roleFilter: 'owner',
      sortBy: 'newest',
    }).length,
    1,
  );
  assert.equal(
    filterAndSortClients(baseClients, {
      accountFilter: 'has_suspended',
      roleFilter: 'team',
      sortBy: 'newest',
    })[0]?.user_id,
    'u-2',
  );
  assert.equal(resolveClientAccountStatus(baseClients[0]).status, 'active');
  assert.equal(resolveClientAccountStatus(baseClients[1]).status, 'pending');
  assert.equal(buildClientRegistrationHistory(baseClients[0]).length, 3);
});

test('Establishments filters evaluate subscription, digital menu, and onboarding state', () => {
  const sampleTenants: EstablishmentRecord[] = [
    {
      id: 't-1',
      slug: 'mgw_lanches',
      name: 'MGW Lanches',
      status: 'active',
      is_founder_account: true,
      billing_exempt: true,
      onboarding_completed: true,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
      owner_email: 'owner@mgw.com',
      timezone: 'America/Manaus',
      plan_code: 'founder_exempt',
      plan_amount_cents: 0,
      subscription_status: 'exempt',
      trial_ends_at: null,
      current_period_end: null,
      grace_until: null,
      retention_status: 'none',
      retention_ends_at: null,
      digital_menu_active: true,
      digital_menu_slug: 'mgw_lanches',
      active_members_count: 2,
      products_count: 15,
      sales_count: 120,
      online_orders_count: 18,
      last_sale_at: '2026-11-21T20:00:00Z',
    },
    {
      id: 't-2',
      slug: 'teste-burger',
      name: 'Teste Burger',
      status: 'active',
      is_founder_account: false,
      billing_exempt: false,
      onboarding_completed: false,
      created_at: '2026-11-21T10:00:00Z',
      updated_at: '2026-11-21T10:00:00Z',
      owner_email: 'novo@burger.com',
      timezone: 'America/Manaus',
      plan_code: 'trial',
      plan_amount_cents: 0,
      subscription_status: 'trialing',
      trial_ends_at: '2026-11-24T10:00:00Z',
      current_period_end: '2026-11-24T10:00:00Z',
      grace_until: null,
      retention_status: 'none',
      retention_ends_at: null,
      digital_menu_active: false,
      digital_menu_slug: 'teste-burger',
      active_members_count: 1,
      products_count: 0,
      sales_count: 0,
      online_orders_count: 0,
      last_sale_at: null,
    },
  ];

  assert.equal(
    filterEstablishments(sampleTenants, {
      subscriptionFilter: 'exempt',
      menuFilter: 'published',
      onboardingFilter: 'completed',
    }).length,
    1,
  );
  assert.equal(
    filterEstablishments(sampleTenants, {
      subscriptionFilter: 'trialing',
      menuFilter: 'unpublished',
      onboardingFilter: 'pending',
    })[0]?.id,
    't-2',
  );
});

test('Migration 20261122000001 enforces Zero Trust, MFA AAL2, immutability, and last super_admin protection', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.platform_admins/i);
  assert.match(migrationSql, /role IN \('super_admin', 'support', 'finance'\)/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.platform_audit_logs/i);
  assert.match(migrationSql, /BEFORE UPDATE OR DELETE ON public\.platform_audit_logs/i);
  assert.match(migrationSql, /ultimo super_admin ativo/i);
  assert.match(migrationSql, /is_platform_mfa_aal2\(\)/i);
  assert.match(migrationSql, /auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/);
  assert.match(migrationSql, /u\.email_confirmed_at IS NOT NULL/);

  // Must remain strictly additive and never drop existing operational tenant policies
  assert.equal(/DROP POLICY IF EXISTS sales_/i.test(migrationSql), false);
  assert.equal(/DROP POLICY IF EXISTS tenants_/i.test(migrationSql), false);
  assert.equal(/DROP POLICY IF EXISTS products_/i.test(migrationSql), false);
  assert.equal(/DROP POLICY IF EXISTS online_orders_/i.test(migrationSql), false);
});

test('Bootstrap seed template uses manual placeholder and never invents fake emails or UUIDs', () => {
  assert.match(bootstrapSql, /<SEU_EMAIL_REAL_CONFIRMADO>/);
  assert.match(bootstrapSql, /u\.email_confirmed_at IS NOT NULL/);
  assert.equal(/00000000-0000-0000-0000/.test(bootstrapSql), false);
});

test('Formatters output valid pt-BR currency and role labels', () => {
  assert.match(formatCurrencyCents(4990), /R\$\s*49,90/);
  assert.equal(formatRoleLabel('super_admin'), 'Super Admin');
  assert.equal(formatRoleLabel('support'), 'Suporte');
  assert.equal(formatRoleLabel('finance'), 'Financeiro');
});

test('Phase 1 migration adds audited member & subscription expiry RPCs with MFA AAL2 and founder protection', () => {
  assert.match(migrationPhase1Sql, /CREATE OR REPLACE FUNCTION public\.admin_list_establishment_members/i);
  assert.match(migrationPhase1Sql, /CREATE OR REPLACE FUNCTION public\.admin_set_subscription_expiry/i);
  assert.match(migrationPhase1Sql, /assert_platform_admin\(ARRAY\['super_admin', 'finance'\], true\)/i);
  assert.match(migrationPhase1Sql, /is_founder_account/i);
  assert.match(migrationPhase1Sql, /write_platform_audit_log\(/i);
  assert.match(migrationPhase1Sql, /REVOKE ALL ON FUNCTION public\.admin_list_establishment_members\(uuid\) FROM PUBLIC, anon/i);
  assert.match(
    migrationPhase1Sql,
    /REVOKE ALL ON FUNCTION public\.admin_set_subscription_expiry\(uuid, text, integer, text, timestamptz, text\) FROM PUBLIC, anon/i,
  );
  // Constraint chk_subscriptions_status allows 'authorized', never 'active'
  assert.equal(/'active'\s*,?\s*--/.test(migrationPhase1Sql), false);
  assert.match(migrationPhase1Sql, /'authorized'/);
});

test('Phase 1 UI hygiene: zero browser native dialogs, zero legacy dark surfaces, zero CSS utility overrides, and canonical menu route', () => {
  const indexCss = fs.readFileSync(path.join(APP_ROOT, 'src/index.css'), 'utf8');
  assert.equal(/@layer utilities/.test(indexCss), false, 'index.css must not use @layer utilities !important hacks');

  const sourceFiles = walkFiles(path.join(APP_ROOT, 'src'));
  for (const filePath of sourceFiles) {
    if (filePath.endsWith('adminSecurity.test.ts')) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(APP_ROOT, filePath);
    assert.equal(/window\.(prompt|alert|confirm)\(/.test(content), false, `Native browser dialog found in ${rel}`);
    assert.equal(/bg-\[#(12151C|0B0D11)\]/i.test(content), false, `Legacy dark background found in ${rel}`);
  }

  const establishmentsView = fs.readFileSync(
    path.join(APP_ROOT, 'src/views/EstablishmentsView.tsx'),
    'utf8',
  );
  assert.equal(/\?menu=/.test(establishmentsView), false, 'Legacy /?menu= link should be replaced by /cardapio/');
  assert.match(establishmentsView, /\/cardapio\/\$\{/);
});

test('Phase 2 brand & design system: official logo asset present, typography updated, and navigation modules grouped cleanly', () => {
  assert.equal(fs.existsSync(path.join(APP_ROOT, 'public/brand/mgw-logo.png')), true);

  const indexHtml = fs.readFileSync(path.join(APP_ROOT, 'index.html'), 'utf8');
  const indexCss = fs.readFileSync(path.join(APP_ROOT, 'src/index.css'), 'utf8');
  assert.match(indexHtml, /Plus\+Jakarta\+Sans/);
  assert.match(indexHtml, /JetBrains\+Mono/);
  assert.match(indexCss, /Plus Jakarta Sans/);
  assert.equal(/\bInter\b/.test(indexHtml), false);
  assert.equal(/\bInter\b/.test(indexCss), false);
});

test('Phase 3 migration adds establishment detail, manual payment RPCs, MFA AAL2, and partner audit logs', () => {
  assert.match(migrationPhase3Sql, /CREATE OR REPLACE FUNCTION public\.admin_get_establishment_detail/i);
  assert.match(migrationPhase3Sql, /CREATE OR REPLACE FUNCTION public\.admin_record_manual_payment/i);
  assert.match(migrationPhase3Sql, /assert_platform_admin\(ARRAY\['super_admin', 'finance'\], true\)/i);
  assert.match(migrationPhase3Sql, /'manual_adjustment'/);
  assert.match(migrationPhase3Sql, /'payment_manual_recorded'/);
  assert.match(migrationPhase3Sql, /'partner_campaign_created'/);
  assert.match(migrationPhase3Sql, /'partner_campaign_status_updated'/);
  assert.match(migrationPhase3Sql, /'partner_material_created'/);
  assert.match(migrationPhase3Sql, /'partner_material_status_updated'/);
  assert.match(migrationPhase3Sql, /SET search_path = pg_catalog, public, auth/i);
  assert.match(migrationPhase3Sql, /REVOKE ALL ON FUNCTION public\.admin_get_establishment_detail\(uuid\) FROM PUBLIC, anon/i);
  assert.match(
    migrationPhase3Sql,
    /REVOKE ALL ON FUNCTION public\.admin_record_manual_payment\(uuid, integer, text, text, text, text\) FROM PUBLIC, anon/i,
  );
  assert.match(
    migrationPhase3Sql,
    /REVOKE ALL ON FUNCTION public\.admin_create_mgw_partner_campaign\(text, text, text, text, text, timestamptz, timestamptz\) FROM PUBLIC, anon/i,
  );
  assert.match(
    migrationPhase3Sql,
    /REVOKE ALL ON FUNCTION public\.admin_set_mgw_partner_campaign_status\(uuid, text\) FROM PUBLIC, anon/i,
  );
  assert.match(
    migrationPhase3Sql,
    /REVOKE ALL ON FUNCTION public\.admin_create_mgw_partner_material\(text, text, text, text, text, uuid\) FROM PUBLIC, anon/i,
  );
  assert.match(
    migrationPhase3Sql,
    /REVOKE ALL ON FUNCTION public\.admin_set_mgw_partner_material_active\(uuid, boolean\) FROM PUBLIC, anon/i,
  );

  // Must remain strictly additive and never touch operational tenant policies
  assert.equal(/DROP POLICY/i.test(migrationPhase3Sql), false);
  assert.equal(/DELETE FROM/i.test(migrationPhase3Sql), false);
});

test('Phase 4 PWA compliance & runtime status: manifest, icons, SW, install UI, and safe public flags', () => {
  const requiredAssets = [
    'public/icon.svg',
    'public/icon-maskable.svg',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-512x512.png',
    'public/apple-touch-icon.png',
  ];
  for (const relAsset of requiredAssets) {
    assert.equal(fs.existsSync(path.join(APP_ROOT, relAsset)), true, `Missing PWA asset: ${relAsset}`);
  }

  const viteConfig = fs.readFileSync(path.join(APP_ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /VitePWA\(/);
  assert.match(viteConfig, /short_name:\s*'MGW Admin'/);
  assert.match(viteConfig, /display:\s*'standalone'/);
  assert.match(viteConfig, /handler:\s*'NetworkOnly'/);
  assert.match(viteConfig, /devOptions:\s*\{\s*enabled:\s*true/);

  const indexHtml = fs.readFileSync(path.join(APP_ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /apple-touch-icon\.png/);
  assert.match(indexHtml, /name="theme-color" content="#202733"/);
  assert.match(indexHtml, /name="apple-mobile-web-app-capable" content="yes"/);

  const mainTsx = fs.readFileSync(path.join(APP_ROOT, 'src/main.tsx'), 'utf8');
  assert.match(mainTsx, /virtual:pwa-register/);

  const adminLayout = fs.readFileSync(path.join(APP_ROOT, 'src/components/AdminLayout.tsx'), 'utf8');
  const adminLogin = fs.readFileSync(path.join(APP_ROOT, 'src/components/AdminLoginScreen.tsx'), 'utf8');
  const settingsView = fs.readFileSync(path.join(APP_ROOT, 'src/views/SettingsView.tsx'), 'utf8');
  assert.match(adminLayout, /<PWAInstallButton/);
  assert.match(adminLogin, /<PWAInstallButton/);
  assert.match(settingsView, /WhatsApp de Suporte/);

  assert.match(migrationPhase4Sql, /CREATE OR REPLACE FUNCTION public\.get_platform_runtime_status\(\)/i);
  assert.match(migrationPhase4Sql, /'allowPublicSignup'/);
  assert.match(migrationPhase4Sql, /'maintenanceMode'/);
  assert.equal(/DROP POLICY/i.test(migrationPhase4Sql), false);
});

