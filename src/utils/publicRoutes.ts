export type PublicUrlRoute =
  | { kind: 'landing' }
  | { kind: 'login' }
  | { kind: 'register' }
  | { kind: 'terms' }
  | { kind: 'privacy' }
  | { kind: 'institutional'; page: 'gestao' | 'cardapio' | 'recursos' | 'planos' }
  | { kind: 'admin' }
  | { kind: 'partnerLogin' }
  | { kind: 'partnerRegister' }
  | { kind: 'partnerPortal' }
  | { kind: 'menu'; slug?: string }
  | { kind: 'tracking'; token: string };

export function parsePublicUrlRoute(
  pathname: string,
  lastPublicMenuSlug = '',
): PublicUrlRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (normalized === '/') {
    return { kind: 'landing' };
  }
  if (normalized === '/mgw-gestao') return { kind: 'institutional', page: 'gestao' };
  if (normalized === '/cardapio-digital') return { kind: 'institutional', page: 'cardapio' };
  if (normalized === '/recursos') return { kind: 'institutional', page: 'recursos' };
  if (normalized === '/planos') return { kind: 'institutional', page: 'planos' };
  if (normalized === '/login' || normalized === '/entrar') {
    return { kind: 'login' };
  }
  if (normalized === '/cadastro' || normalized === '/criar-conta') {
    return { kind: 'register' };
  }
  if (normalized === '/parceiros' || normalized === '/parceiros/login') {
    return { kind: 'partnerLogin' };
  }
  if (normalized === '/parceiros/cadastro' || normalized === '/parceiros/inscricao') {
    return { kind: 'partnerRegister' };
  }
  if (normalized === '/parceiros/painel') {
    return { kind: 'partnerPortal' };
  }
  if (normalized === '/termos' || normalized === '/termos-de-uso') {
    return { kind: 'terms' };
  }
  if (
    normalized === '/privacidade' ||
    normalized === '/politica-de-privacidade'
  ) {
    return { kind: 'privacy' };
  }
  if (normalized === '/cardapio') {
    return { kind: 'menu', slug: lastPublicMenuSlug || undefined };
  }
  if (normalized.startsWith('/cardapio/pedido/')) {
    const token = decodeURIComponent(
      normalized.slice('/cardapio/pedido/'.length),
    );
    if (token) return { kind: 'tracking', token };
  }
  if (normalized.startsWith('/cardapio/')) {
    const slug = decodeURIComponent(normalized.slice('/cardapio/'.length));
    return slug ? { kind: 'menu', slug } : { kind: 'menu' };
  }
  if (normalized.startsWith('/pedido/')) {
    const token = decodeURIComponent(normalized.slice('/pedido/'.length));
    if (token) return { kind: 'tracking', token };
  }
  return { kind: 'admin' };
}

export function isAuthShellRoute(route: PublicUrlRoute): boolean {
  return (
    route.kind === 'landing' ||
    route.kind === 'institutional' ||
    route.kind === 'login' ||
    route.kind === 'register' ||
    route.kind === 'admin' ||
    route.kind === 'partnerLogin' ||
    route.kind === 'partnerRegister' ||
    route.kind === 'partnerPortal'
  );
}

export function hasAuthCallbackParams(search = '', hash = ''): boolean {
  const s = search || '';
  const h = hash || '';
  return (
    /(?:^\?|&)(?:code|error|type=recovery)=|(?:^\?|&)type=recovery(?:&|$)/i.test(
      s,
    ) ||
    /(?:^#|&)(?:access_token|refresh_token|error)=|(?:^#|&)type=recovery(?:&|$)/i.test(
      h,
    )
  );
}
