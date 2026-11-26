import type { AdminModuleId, PlatformRole } from '../types/admin';

export type AdminModuleGroup =
  | 'Operação'
  | 'Receita & Rede'
  | 'Atendimento & Saúde'
  | 'Governança';

export const ADMIN_MODULE_GROUPS: AdminModuleGroup[] = [
  'Operação',
  'Receita & Rede',
  'Atendimento & Saúde',
  'Governança',
];

export interface ModuleAccessRule {
  id: AdminModuleId;
  group: AdminModuleGroup;
  label: string;
  description: string;
  allowedRoles: PlatformRole[];
}

export const MODULE_RULES: ModuleAccessRule[] = [
  {
    id: 'dashboard',
    group: 'Operação',
    label: 'Visão Geral',
    description: 'Indicadores globais e crescimento do SaaS',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'clients',
    group: 'Operação',
    label: 'Clientes',
    description: 'Contas cadastradas, vínculos e acessos',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'establishments',
    group: 'Operação',
    label: 'Estabelecimentos',
    description: 'Tenants ativos, suspensos e fundadores',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'plans',
    group: 'Receita & Rede',
    label: 'Planos & Assinaturas',
    description: 'Catálogo comercial, trials, isenções e carência',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'finance',
    group: 'Receita & Rede',
    label: 'Financeiro',
    description: 'MRR, ARR, recebimentos e inadimplência',
    allowedRoles: ['super_admin', 'finance'],
  },
  {
    id: 'partners',
    group: 'Receita & Rede',
    label: 'MGW Parceiros',
    description: 'Parceiros, indicações e comissões',
    allowedRoles: ['super_admin', 'finance'],
  },
  {
    id: 'support',
    group: 'Atendimento & Saúde',
    label: 'Suporte',
    description: 'Chamados, histórico e notas internas',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'monitoring',
    group: 'Atendimento & Saúde',
    label: 'Monitoramento',
    description: 'Webhooks Mercado Pago e saúde operacional',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'settings',
    group: 'Governança',
    label: 'Configurações',
    description: 'Parâmetros globais de trial, retenção e manutenção',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
  {
    id: 'admins',
    group: 'Governança',
    label: 'Equipe Admin',
    description: 'Gestão de acessos e papéis do MGW Admin',
    allowedRoles: ['super_admin'],
  },
  {
    id: 'audit',
    group: 'Governança',
    label: 'Auditoria & Relatórios',
    description: 'Trilha imutável de ações e exportações',
    allowedRoles: ['super_admin', 'support', 'finance'],
  },
];

export function canAccessModule(role: PlatformRole | null | undefined, moduleId: AdminModuleId): boolean {
  if (!role) return false;
  const rule = MODULE_RULES.find((item) => item.id === moduleId);
  if (!rule) return false;
  return rule.allowedRoles.includes(role);
}

export function canMutateTenantsOrPlans(role: PlatformRole | null | undefined): boolean {
  return role === 'super_admin';
}

export function canManageSubscriptions(role: PlatformRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'finance';
}

export function canReplySupportTickets(role: PlatformRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'support';
}

export function canManagePlatformAdmins(role: PlatformRole | null | undefined): boolean {
  return role === 'super_admin';
}

export function formatRoleLabel(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'support':
      return 'Suporte';
    case 'finance':
      return 'Financeiro';
    default:
      return role;
  }
}

export function formatCurrencyCents(cents: number | null | undefined): string {
  const safe = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return (safe / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Manaus',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateBr(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', {
    timeZone: 'America/Manaus',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
