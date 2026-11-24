import type { AppRoute } from '../types/finance';

export type SettingsTabKind = 'shop' | 'catalog' | 'digital_menu';
export type ShellNavId = AppRoute | 'products';

/**
 * Gera um nome de exibição legível a partir do e-mail autenticado quando
 * não há nome completo explícito na sessão.
 */
export function formatUserDisplayName(email?: string | null): string {
  const clean = (email || '').trim();
  if (!clean) return 'Usuário MGW';

  const localPart = clean.split('@')[0] || clean;
  const tokens = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return localPart;
  }

  return tokens
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extrai até 2 iniciais para o avatar do usuário no cabeçalho.
 */
export function getUserInitials(displayName: string, email?: string | null): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const cleanEmail = (email || '').trim();
  if (cleanEmail.length >= 2) {
    return cleanEmail.slice(0, 2).toUpperCase();
  }
  return 'MG';
}

export function resolveShellPageTitle(
  effectiveRoute: AppRoute,
  settingsTab: SettingsTabKind,
): string {
  switch (effectiveRoute) {
    case 'dashboard':
      return 'Dashboard';
    case 'orders':
      return 'Pedidos';
    case 'delivery':
      return 'MGW Delivery';
    case 'delivery_customers':
      return 'Clientes · MGW Delivery';
    case 'sales':
      return 'Vendas';
    case 'expenses':
      return 'Despesas';
    case 'reports':
      return 'Relatórios';
    case 'settings':
      return settingsTab === 'catalog' ? 'Produtos' : 'Configurações';
    default:
      return 'Dashboard';
  }
}

export function resolveActiveShellNavId(
  effectiveRoute: AppRoute,
  settingsTab: SettingsTabKind,
): ShellNavId {
  if (effectiveRoute === 'settings' && settingsTab === 'catalog') {
    return 'products';
  }
  return effectiveRoute;
}
