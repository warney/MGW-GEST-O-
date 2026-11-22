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
const WORKSPACE_ROOT = path.resolve(APP_ROOT, '../..');

const MIGRATION_4_1_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/migrations/20261122000001_etapa4_1_platform_admin_security_and_audit.sql',
);
const BOOTSTRAP_SEED_PATH = path.join(
  WORKSPACE_ROOT,
  'supabase/seeds/002_platform_admin_bootstrap.sql',
);

const migrationSql = fs.readFileSync(MIGRATION_4_1_PATH, 'utf8');
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
