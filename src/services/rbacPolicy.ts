import type { SubscriptionStatus, TenantContext, TenantRole } from '../types/finance';

export const TENANT_ROLES = ['owner', 'admin', 'manager', 'staff'] as const;

export const ROLE_HIERARCHY: Record<TenantRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  staff: 1,
};

export const ROLE_LABELS_PT: Record<TenantRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  manager: 'Gerente',
  staff: 'Atendente',
};

export type TenantPermission =
  | 'dashboard:view'
  | 'delivery:view'
  | 'inventory:read'
  | 'inventory:write'
  | 'sales:read'
  | 'sales:create'
  | 'sales:update'
  | 'sales:delete'
  | 'expenses:read'
  | 'expenses:create'
  | 'expenses:update'
  | 'expenses:delete'
  | 'reports:view'
  | 'catalog:read'
  | 'catalog:write'
  | 'catalog:delete'
  | 'settings:read'
  | 'settings:write'
  | 'team:read'
  | 'team:invite'
  | 'team:manage'
  | 'billing:manage';

export const ROLE_PERMISSIONS: Record<TenantRole, ReadonlySet<TenantPermission>> = {
  owner: new Set<TenantPermission>([
    'dashboard:view',
    'delivery:view',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:create',
    'sales:update',
    'sales:delete',
    'expenses:read',
    'expenses:create',
    'expenses:update',
    'expenses:delete',
    'reports:view',
    'catalog:read',
    'catalog:write',
    'catalog:delete',
    'settings:read',
    'settings:write',
    'team:read',
    'team:invite',
    'team:manage',
    'billing:manage',
  ]),
  admin: new Set<TenantPermission>([
    'dashboard:view',
    'delivery:view',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:create',
    'sales:update',
    'sales:delete',
    'expenses:read',
    'expenses:create',
    'expenses:update',
    'expenses:delete',
    'reports:view',
    'catalog:read',
    'catalog:write',
    'catalog:delete',
    'settings:read',
    'settings:write',
    'team:read',
    'team:invite',
  ]),
  manager: new Set<TenantPermission>([
    'dashboard:view',
    'delivery:view',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:create',
    'sales:update',
    'expenses:read',
    'expenses:create',
    'expenses:update',
    'reports:view',
    'catalog:read',
    'catalog:write',
    'settings:read',
  ]),
  staff: new Set<TenantPermission>([
    'dashboard:view',
    'sales:create',
    'catalog:read',
    'settings:read',
  ]),
};

export interface PlanDefinition {
  code: 'founder_exempt' | 'free' | 'trial' | 'mgw_mensal_49';
  name: string;
  amountCents: number;
  billingInterval: 'none' | 'trial' | 'monthly';
  maxMembers: number;
  selfServeAllowed: boolean;
}

export const PLAN_CATALOG: Record<PlanDefinition['code'], PlanDefinition> = {
  founder_exempt: {
    code: 'founder_exempt',
    name: 'Conta Fundadora Isenta',
    amountCents: 0,
    billingInterval: 'none',
    maxMembers: 20,
    selfServeAllowed: false,
  },
  free: {
    code: 'free',
    name: 'Plano Gratuito (Legado)',
    amountCents: 0,
    billingInterval: 'none',
    maxMembers: 3,
    selfServeAllowed: false,
  },
  trial: {
    code: 'trial',
    name: 'Período de Teste (3 dias)',
    amountCents: 0,
    billingInterval: 'trial',
    maxMembers: 5,
    selfServeAllowed: true,
  },
  mgw_mensal_49: {
    code: 'mgw_mensal_49',
    name: 'MGW Gestão Mensal',
    amountCents: 4990,
    billingInterval: 'monthly',
    maxMembers: 15,
    selfServeAllowed: true,
  },
};

/**
 * Converte papel cru do banco falhando fechado para o menor privilegio ('staff').
 * Nunca eleva um valor desconhecido para 'admin' ou 'owner'.
 */
export function normalizeTenantRole(rawRole: unknown): TenantRole {
  if (rawRole === 'owner' || rawRole === 'admin' || rawRole === 'manager' || rawRole === 'staff') {
    return rawRole;
  }
  return 'staff';
}

export function normalizeSubscriptionStatus(
  rawStatus: unknown,
  billingExempt: boolean,
): SubscriptionStatus {
  if (
    rawStatus === 'pending' ||
    rawStatus === 'trialing' ||
    rawStatus === 'active' ||
    rawStatus === 'authorized' ||
    rawStatus === 'past_due' ||
    rawStatus === 'paused' ||
    rawStatus === 'cancelled' ||
    rawStatus === 'expired' ||
    rawStatus === 'suspended' ||
    rawStatus === 'free' ||
    rawStatus === 'exempt'
  ) {
    return rawStatus;
  }
  return billingExempt ? 'exempt' : 'pending';
}

export function normalizeRetentionStatus(
  rawRetention: unknown,
): 'none' | 'active_retention' | 'expired' {
  if (rawRetention === 'active_retention' || rawRetention === 'expired') {
    return rawRetention;
  }
  return 'none';
}

export function hasTenantPermission(
  role: TenantRole | null | undefined,
  permission: TenantPermission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function canAssignInvitationRole(
  actorRole: TenantRole | null | undefined,
  invitedRole: TenantRole,
): boolean {
  if (!actorRole) return false;
  if (invitedRole === 'owner') return false;
  return actorRole === 'owner' || actorRole === 'admin';
}

export function canManageMemberRecord(params: {
  actorUserId: string;
  actorRole: TenantRole | null | undefined;
  targetUserId: string | null;
  targetRole: TenantRole;
  targetIsFounder: boolean;
  nextRole?: TenantRole;
}): boolean {
  const { actorUserId, actorRole, targetUserId, targetRole, targetIsFounder, nextRole } = params;
  if (actorRole !== 'owner') return false;
  if (targetIsFounder || targetRole === 'owner') return false;
  if (targetUserId && targetUserId === actorUserId) return false;
  if (nextRole && nextRole === 'owner') return false;
  return true;
}

/**
 * Resolve qual tenant ativo pode ser usado na UI sem nunca confiar em IDs avulsos
 * armazenados no navegador (localStorage/query param) fora da lista retornada pelo backend/RLS.
 */
export function selectAuthorizedTenant(
  authorizedTenants: TenantContext[],
  requestedTenantId?: string | null,
): TenantContext | null {
  if (authorizedTenants.length === 0) return null;
  if (requestedTenantId) {
    const matched = authorizedTenants.find((t) => t.tenantId === requestedTenantId);
    if (matched) return matched;
  }
  return authorizedTenants[0];
}
