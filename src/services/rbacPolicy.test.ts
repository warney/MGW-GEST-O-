import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignInvitationRole,
  canManageMemberRecord,
  hasTenantPermission,
  normalizeSubscriptionStatus,
  normalizeTenantRole,
  PLAN_CATALOG,
  selectAuthorizedTenant,
} from './rbacPolicy';
import {
  buildTenantContextFromRows,
  hasActiveTenantBillingAccess,
} from './supabaseMappers';
import type { TenantContext } from '../types/finance';

test('normalizeTenantRole fails closed to staff for unknown or invalid roles', () => {
  assert.equal(normalizeTenantRole('owner'), 'owner');
  assert.equal(normalizeTenantRole('admin'), 'admin');
  assert.equal(normalizeTenantRole('manager'), 'manager');
  assert.equal(normalizeTenantRole('staff'), 'staff');
  assert.equal(normalizeTenantRole('super_admin'), 'staff');
  assert.equal(normalizeTenantRole(undefined), 'staff');
  assert.equal(normalizeTenantRole(null), 'staff');
});

test('RBAC permission matrix isolates financial, catalog, settings, and team actions cleanly', () => {
  // owner tem acesso total inclusive billing e gestao de equipe
  assert.equal(hasTenantPermission('owner', 'billing:manage'), true);
  assert.equal(hasTenantPermission('owner', 'team:manage'), true);
  assert.equal(hasTenantPermission('owner', 'settings:write'), true);
  assert.equal(hasTenantPermission('owner', 'expenses:delete'), true);

  // admin tem gestao operacional/convites, mas nao billing/transferencia de owner
  assert.equal(hasTenantPermission('admin', 'team:invite'), true);
  assert.equal(hasTenantPermission('admin', 'settings:write'), true);
  assert.equal(hasTenantPermission('admin', 'sales:delete'), true);
  assert.equal(hasTenantPermission('admin', 'billing:manage'), false);
  assert.equal(hasTenantPermission('admin', 'team:manage'), false);

  // manager opera vendas, despesas e catalogo, mas nao apaga registros criticos nem altera settings/equipe
  assert.equal(hasTenantPermission('manager', 'catalog:write'), true);
  assert.equal(hasTenantPermission('manager', 'expenses:create'), true);
  assert.equal(hasTenantPermission('manager', 'sales:update'), true);
  assert.equal(hasTenantPermission('manager', 'catalog:delete'), false);
  assert.equal(hasTenantPermission('manager', 'sales:delete'), false);
  assert.equal(hasTenantPermission('manager', 'settings:write'), false);
  assert.equal(hasTenantPermission('manager', 'team:invite'), false);

  // staff (caixa/atendente) cria vendas, mas nao le/edita despesas, nao altera catalogo e nao exclui
  assert.equal(hasTenantPermission('staff', 'sales:create'), true);
  assert.equal(hasTenantPermission('staff', 'sales:read'), true);
  assert.equal(hasTenantPermission('staff', 'sales:update'), false);
  assert.equal(hasTenantPermission('staff', 'sales:delete'), false);
  assert.equal(hasTenantPermission('staff', 'expenses:read'), false);
  assert.equal(hasTenantPermission('staff', 'expenses:create'), false);
  assert.equal(hasTenantPermission('staff', 'catalog:write'), false);
  assert.equal(hasTenantPermission('staff', 'settings:write'), false);
});

test('anti-privilege-escalation rules block self-modification, founder edits, and owner invitations', () => {
  assert.equal(canAssignInvitationRole('owner', 'admin'), true);
  assert.equal(canAssignInvitationRole('admin', 'manager'), true);
  assert.equal(canAssignInvitationRole('owner', 'owner'), false);
  assert.equal(canAssignInvitationRole('manager', 'staff'), false);

  // owner pode gerenciar staff nao-fundador de outro usuario
  assert.equal(
    canManageMemberRecord({
      actorUserId: 'uid-owner',
      actorRole: 'owner',
      targetUserId: 'uid-staff',
      targetRole: 'staff',
      targetIsFounder: false,
      nextRole: 'manager',
    }),
    true,
  );

  // bloqueia auto-alteracao, promocao para owner, alteracao de fundador e alteracao por nao-owner
  assert.equal(
    canManageMemberRecord({
      actorUserId: 'uid-owner',
      actorRole: 'owner',
      targetUserId: 'uid-owner',
      targetRole: 'admin',
      targetIsFounder: false,
    }),
    false,
  );
  assert.equal(
    canManageMemberRecord({
      actorUserId: 'uid-owner',
      actorRole: 'owner',
      targetUserId: 'uid-staff',
      targetRole: 'staff',
      targetIsFounder: false,
      nextRole: 'owner',
    }),
    false,
  );
  assert.equal(
    canManageMemberRecord({
      actorUserId: 'uid-owner',
      actorRole: 'owner',
      targetUserId: 'uid-fernandes',
      targetRole: 'admin',
      targetIsFounder: true,
    }),
    false,
  );
  assert.equal(
    canManageMemberRecord({
      actorUserId: 'uid-admin',
      actorRole: 'admin',
      targetUserId: 'uid-staff',
      targetRole: 'staff',
      targetIsFounder: false,
    }),
    false,
  );
});

test('selectAuthorizedTenant never trusts arbitrary client tenant IDs outside RLS-returned memberships', () => {
  const authorized: TenantContext[] = [
    {
      tenantId: 'tenant-mgw',
      slug: 'mgw_lanches',
      name: 'MGW Lanches',
      role: 'owner',
      isFounderAccount: true,
      billingExempt: true,
      subscriptionStatus: 'exempt',
      graceUntil: null,
    },
  ];

  // Tentativa de injetar tenant alheio via localStorage/URL cai no primeiro tenant autorizado
  assert.equal(selectAuthorizedTenant(authorized, 'tenant-outro-invasor')?.tenantId, 'tenant-mgw');
  assert.equal(selectAuthorizedTenant([], 'tenant-mgw'), null);
});

test('plans and billing access support founder_exempt, free, active trial, expired trial, and paid plans', () => {
  assert.equal(PLAN_CATALOG.founder_exempt.selfServeAllowed, false);
  assert.equal(PLAN_CATALOG.free.amountCents, 0);
  assert.equal(PLAN_CATALOG.mgw_mensal_49.amountCents, 4900);

  assert.equal(normalizeSubscriptionStatus('trialing', false), 'trialing');
  assert.equal(normalizeSubscriptionStatus('free', false), 'free');
  assert.equal(normalizeSubscriptionStatus('unknown', true), 'exempt');

  const now = Date.parse('2026-11-16T12:00:00.000Z');
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'free', grace_until: null }, now),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'trialing', grace_until: null, trial_ends_at: '2026-11-20T12:00:00.000Z' },
      now,
    ),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'trialing', grace_until: null, trial_ends_at: '2026-11-15T12:00:00.000Z' },
      now,
    ),
    false,
  );

  const staffCtx = buildTenantContextFromRows(
    {
      id: 'm-staff',
      tenant_id: 't-1',
      user_id: 'u-staff',
      email: 'caixa@lanchonete.com',
      role: 'staff',
      is_founder: false,
      active: true,
      tenants: {
        id: 't-1',
        slug: 'lanche-teste',
        name: 'Lanche Teste',
        is_founder_account: false,
        billing_exempt: false,
        status: 'active',
      },
    },
    { status: 'trialing', grace_until: null, trial_ends_at: '2026-11-30T00:00:00.000Z' },
  );
  assert.equal(staffCtx?.role, 'staff');
  assert.equal(staffCtx?.subscriptionStatus, 'trialing');
});
