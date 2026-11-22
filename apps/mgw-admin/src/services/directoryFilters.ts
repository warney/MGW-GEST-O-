import type { ClientRecord, EstablishmentRecord } from '../types/admin';

export type ClientAccountFilter =
  | 'all'
  | 'verified'
  | 'unconfirmed'
  | 'has_suspended'
  | 'platform_admin';

export type ClientRoleFilter = 'all' | 'owner' | 'team' | 'no_tenant';
export type ClientSortOption = 'newest' | 'last_sign_in' | 'alpha';

export interface ClientTimelineEvent {
  id: string;
  label: string;
  timestamp: string | null;
  detail: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

export function filterAndSortClients(
  clients: ClientRecord[],
  options: {
    accountFilter: ClientAccountFilter;
    roleFilter: ClientRoleFilter;
    sortBy: ClientSortOption;
  },
): ClientRecord[] {
  const filtered = clients.filter((client) => {
    if (options.accountFilter === 'verified' && !client.email_confirmed_at) return false;
    if (options.accountFilter === 'unconfirmed' && client.email_confirmed_at) return false;
    if (
      options.accountFilter === 'has_suspended' &&
      !client.memberships.some((m) => !m.memberActive || m.tenantStatus === 'suspended')
    ) {
      return false;
    }
    if (options.accountFilter === 'platform_admin' && !client.is_platform_admin) return false;

    if (options.roleFilter === 'owner' && !client.memberships.some((m) => m.role === 'owner')) {
      return false;
    }
    if (
      options.roleFilter === 'team' &&
      !client.memberships.some((m) => m.role !== 'owner')
    ) {
      return false;
    }
    if (options.roleFilter === 'no_tenant' && client.memberships.length > 0) {
      return false;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    if (options.sortBy === 'alpha') {
      const labelA = (a.full_name || a.email).toLowerCase();
      const labelB = (b.full_name || b.email).toLowerCase();
      return labelA.localeCompare(labelB, 'pt-BR');
    }
    if (options.sortBy === 'last_sign_in') {
      const timeA = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
      const timeB = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
      return timeB - timeA;
    }
    const createdA = new Date(a.created_at).getTime();
    const createdB = new Date(b.created_at).getTime();
    return createdB - createdA;
  });
}

export function resolveClientAccountStatus(client: ClientRecord): {
  status: string;
  label: string;
} {
  if (client.banned_until) {
    const bannedUntilTime = new Date(client.banned_until).getTime();
    if (Number.isNaN(bannedUntilTime) || bannedUntilTime > Date.now()) {
      return { status: 'suspended', label: 'Conta bloqueada (Auth)' };
    }
  }
  if (!client.email_confirmed_at) {
    return { status: 'pending', label: 'E-mail não confirmado' };
  }
  if (
    client.memberships.length > 0 &&
    client.memberships.every((m) => !m.memberActive || m.tenantStatus !== 'active')
  ) {
    return { status: 'suspended', label: 'Sem vínculo ativo' };
  }
  return { status: 'active', label: 'Conta ativa' };
}

export function buildClientRegistrationHistory(client: ClientRecord): ClientTimelineEvent[] {
  const events: ClientTimelineEvent[] = [
    {
      id: 'created',
      label: 'Cadastro no Supabase Auth',
      timestamp: client.created_at,
      detail: client.email,
      tone: 'neutral',
    },
    {
      id: 'confirmed',
      label: client.email_confirmed_at ? 'E-mail confirmado' : 'Confirmação de e-mail pendente',
      timestamp: client.email_confirmed_at,
      detail: client.email_confirmed_at ? 'Identidade verificada' : 'Aguardando verificação',
      tone: client.email_confirmed_at ? 'success' : 'warning',
    },
    {
      id: 'last-login',
      label: 'Último login registrado',
      timestamp: client.last_sign_in_at,
      detail: client.last_sign_in_at ? 'Sessão autenticada' : 'Nenhum acesso concluído',
      tone: client.last_sign_in_at ? 'success' : 'neutral',
    },
  ];

  if (client.banned_until) {
    events.push({
      id: 'ban',
      label: 'Restrição Auth configurada',
      timestamp: client.banned_until,
      detail: 'Campo banned_until preenchido em auth.users',
      tone: 'danger',
    });
  }

  return events;
}

export type EstablishmentSubscriptionFilter =
  | 'all'
  | 'trialing'
  | 'paid'
  | 'exempt'
  | 'past_due'
  | 'blocked';

export type EstablishmentMenuFilter = 'all' | 'published' | 'unpublished';
export type EstablishmentOnboardingFilter = 'all' | 'completed' | 'pending';

export function filterEstablishments(
  items: EstablishmentRecord[],
  options: {
    subscriptionFilter: EstablishmentSubscriptionFilter;
    menuFilter: EstablishmentMenuFilter;
    onboardingFilter: EstablishmentOnboardingFilter;
  },
): EstablishmentRecord[] {
  return items.filter((tenant) => {
    const subStatus = tenant.subscription_status ?? '';

    if (options.subscriptionFilter === 'trialing' && subStatus !== 'trialing') {
      return false;
    }
    if (
      options.subscriptionFilter === 'paid' &&
      !['authorized', 'active'].includes(subStatus)
    ) {
      return false;
    }
    if (
      options.subscriptionFilter === 'exempt' &&
      !tenant.billing_exempt &&
      !tenant.is_founder_account &&
      subStatus !== 'exempt'
    ) {
      return false;
    }
    if (
      options.subscriptionFilter === 'past_due' &&
      !['past_due', 'paused', 'pending'].includes(subStatus)
    ) {
      return false;
    }
    if (
      options.subscriptionFilter === 'blocked' &&
      !['suspended', 'cancelled', 'expired'].includes(subStatus) &&
      tenant.status === 'active'
    ) {
      return false;
    }

    if (options.menuFilter === 'published' && !tenant.digital_menu_active) return false;
    if (options.menuFilter === 'unpublished' && tenant.digital_menu_active) return false;

    if (options.onboardingFilter === 'completed' && !tenant.onboarding_completed) return false;
    if (options.onboardingFilter === 'pending' && tenant.onboarding_completed) return false;

    return true;
  });
}
