export type MenuImageKind = 'logo' | 'banner' | 'product' | 'combo';

export class MenuStorageAuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const MAX_MENU_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_MENU_IMAGE_TYPES = [
  'image/webp',
  'image/jpeg',
  'image/png',
] as const;

const DEFAULT_TENANT_MEMBERS_BY_EMAIL: Record<string, string[]> = {
  'warney.fernandes22@gmail.com': ['mgw_lanches'],
  'fernandes38mk@gmail.com': ['mgw_lanches'],
  'gf3163666@gmail.com': ['gf_lanches'],
};

const SAFE_TENANT_ID_REGEX = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const SAFE_ENTITY_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

export function parseTenantMembershipRegistry(
  rawJson?: string | null,
): Record<string, string[]> {
  if (!rawJson || !rawJson.trim()) {
    return DEFAULT_TENANT_MEMBERS_BY_EMAIL;
  }
  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('TENANT_MEMBERS_JSON deve ser um objeto email -> tenantId[].');
  }
  const normalized: Record<string, string[]> = {};
  for (const [emailKey, tenantsVal] of Object.entries(parsed)) {
    const cleanEmail = emailKey.trim().toLowerCase();
    if (!cleanEmail || !Array.isArray(tenantsVal)) continue;
    const validTenants = tenantsVal
      .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
      .filter((t) => SAFE_TENANT_ID_REGEX.test(t));
    if (validTenants.length > 0) {
      normalized[cleanEmail] = Array.from(new Set(validTenants));
    }
  }
  return Object.keys(normalized).length > 0
    ? normalized
    : DEFAULT_TENANT_MEMBERS_BY_EMAIL;
}

export function validateFirebaseClaims(
  payload: FirebaseJwtPayload,
  expectedProjectId = DEFAULT_FIREBASE_PROJECT_ID,
  nowSec = Math.floor(Date.now() / 1000),
): VerifiedFirebaseIdentity {
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;

  if (payload.iss !== expectedIssuer) {
    throw new MenuStorageAuthError(
      401,
      'invalid_issuer',
      'Emissor do token Firebase inválido.',
    );
  }

  if (payload.aud !== expectedProjectId) {
    throw new MenuStorageAuthError(
      401,
      'invalid_audience',
      'Audiência do token Firebase não corresponde ao projeto autorizado.',
    );
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;

  if (!exp || exp <= nowSec) {
    throw new MenuStorageAuthError(
      401,
      'token_expired',
      'Sessão Firebase expirada. Atualize a página ou faça login novamente.',
    );
  }

  if (!iat || iat > nowSec + 60 || (authTime && authTime > nowSec + 60)) {
    throw new MenuStorageAuthError(
      401,
      'invalid_timestamps',
      'Timestamps do token Firebase inválidos.',
    );
  }

  const uid = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!uid || uid.length > 128) {
    throw new MenuStorageAuthError(
      401,
      'invalid_subject',
      'Identificador do usuário ausente no token Firebase.',
    );
  }

  const email =
    typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    throw new MenuStorageAuthError(
      401,
      'missing_email',
      'E-mail ausente no token Firebase.',
    );
  }

  if (payload.email_verified !== true) {
    throw new MenuStorageAuthError(
      401,
      'email_not_verified',
      'Somente contas Firebase com e-mail verificado podem gerenciar imagens.',
    );
  }

  const provider =
    typeof payload.firebase?.sign_in_provider === 'string'
      ? payload.firebase.sign_in_provider.trim()
      : '';
  if (!provider) {
    throw new MenuStorageAuthError(
      401,
      'missing_provider',
      'Provedor de autenticação ausente no token Firebase.',
    );
  }

  return {
    uid,
    email,
    emailVerified: true,
    provider,
  };
}

export function resolveAuthorizedTenantForIdentity(params: {
  identity: VerifiedFirebaseIdentity;
  requestedTenantId?: string | null;
  membershipRegistry?: Record<string, string[]>;
}): string {
  const {
    identity,
    requestedTenantId,
    membershipRegistry = DEFAULT_TENANT_MEMBERS_BY_EMAIL,
  } = params;

  const allowedTenants = membershipRegistry[identity.email] ?? [];
  if (allowedTenants.length === 0) {
    throw new MenuStorageAuthError(
      403,
      'no_tenant_membership',
      'Esta conta autenticada não possui vínculo autorizado com nenhum estabelecimento.',
    );
  }

  const normalizedRequested = String(requestedTenantId || '')
    .trim()
    .toLowerCase();

  if (!normalizedRequested) {
    return allowedTenants[0];
  }

  if (!SAFE_TENANT_ID_REGEX.test(normalizedRequested)) {
    throw new MenuStorageAuthError(
      400,
      'invalid_tenant_id',
      'Identificador de estabelecimento inválido.',
    );
  }

  if (!allowedTenants.includes(normalizedRequested)) {
    throw new MenuStorageAuthError(
      403,
      'tenant_mismatch',
      'Acesso negado: você não tem permissão para gerenciar imagens deste estabelecimento.',
    );
  }

  return normalizedRequested;
}

export function buildCanonicalMenuStoragePath(params: {
  authorizedTenantId: string;
  kind: unknown;
  entityId?: unknown;
  contentType: unknown;
  fileSize: unknown;
  nowMs?: number;
  uniqueId?: string;
}): {
  path: string;
  contentType: (typeof ALLOWED_MENU_IMAGE_TYPES)[number];
  extension: 'webp' | 'jpg' | 'png';
} {
  const {
    authorizedTenantId,
    kind,
    entityId,
    contentType,
    fileSize,
    nowMs = Date.now(),
    uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 12),
  } = params;

  if (!SAFE_TENANT_ID_REGEX.test(authorizedTenantId)) {
    throw new MenuStorageAuthError(
      403,
      'invalid_authorized_tenant',
      'Estabelecimento autorizado inválido.',
    );
  }

  if (
    kind !== 'logo' &&
    kind !== 'banner' &&
    kind !== 'product' &&
    kind !== 'combo'
  ) {
    throw new MenuStorageAuthError(
      400,
      'invalid_image_kind',
      'Tipo de imagem inválido. Use logo, banner, product ou combo.',
    );
  }

  const mime =
    typeof contentType === 'string' ? contentType.trim().toLowerCase() : '';
  if (
    !ALLOWED_MENU_IMAGE_TYPES.includes(
      mime as (typeof ALLOWED_MENU_IMAGE_TYPES)[number],
    )
  ) {
    throw new MenuStorageAuthError(
      400,
      'invalid_mime_type',
      'Formato inválido. Permitidos apenas WebP, JPEG e PNG.',
    );
  }

  const numericSize = Number(fileSize);
  if (
    !Number.isFinite(numericSize) ||
    numericSize <= 0 ||
    numericSize > MAX_MENU_IMAGE_BYTES
  ) {
    throw new MenuStorageAuthError(
      400,
      'file_too_large',
      'O arquivo excede o limite máximo de 2 MB.',
    );
  }

  const extension: 'webp' | 'jpg' | 'png' =
    mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
  const safeTs = Math.max(1, Math.trunc(nowMs));
  const safeRand =
    uniqueId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'img';

  if (kind === 'logo') {
    return {
      path: `tenants/${authorizedTenantId}/branding/logo/${safeTs}_${safeRand}.${extension}`,
      contentType: mime as (typeof ALLOWED_MENU_IMAGE_TYPES)[number],
      extension,
    };
  }

  if (kind === 'banner') {
    return {
      path: `tenants/${authorizedTenantId}/branding/banner/${safeTs}_${safeRand}.${extension}`,
      contentType: mime as (typeof ALLOWED_MENU_IMAGE_TYPES)[number],
      extension,
    };
  }

  const cleanEntityId = typeof entityId === 'string' ? entityId.trim() : '';
  if (!SAFE_ENTITY_ID_REGEX.test(cleanEntityId)) {
    throw new MenuStorageAuthError(
      400,
      'invalid_entity_id',
      `Identificador de ${kind === 'product' ? 'produto' : 'combo'} inválido.`,
    );
  }

  const folder = kind === 'product' ? 'products' : 'combos';
  return {
    path: `tenants/${authorizedTenantId}/${folder}/${cleanEntityId}/${safeTs}_${safeRand}.${extension}`,
    contentType: mime as (typeof ALLOWED_MENU_IMAGE_TYPES)[number],
    extension,
  };
}

export function validateTenantDeletePath(params: {
  authorizedTenantId: string;
  rawPath: unknown;
}): string {
  const { authorizedTenantId, rawPath } = params;
  const cleanPath = typeof rawPath === 'string' ? rawPath.trim() : '';

  if (!cleanPath || cleanPath.length > 260) {
    throw new MenuStorageAuthError(
      400,
      'invalid_delete_path',
      'Caminho do arquivo para exclusão inválido.',
    );
  }

  if (
    cleanPath.includes('..') ||
    cleanPath.includes('//') ||
    cleanPath.includes('\\') ||
    cleanPath.includes('%') ||
    cleanPath.includes('?') ||
    cleanPath.includes('#')
  ) {
    throw new MenuStorageAuthError(
      403,
      'unsafe_delete_path',
      'Caminho de exclusão rejeitado por segurança.',
    );
  }

  const canonicalRegex = new RegExp(
    `^tenants/${authorizedTenantId}/(?:branding/(?:logo|banner)|(?:products|combos)/[a-zA-Z0-9_-]{1,80})/[a-zA-Z0-9_.-]{3,160}$`,
  );
  const legacyRegex = new RegExp(
    `^tenants/${authorizedTenantId}/(?:branding|products|combos)/[a-zA-Z0-9_.-]{3,160}$`,
  );

  if (!canonicalRegex.test(cleanPath) && !legacyRegex.test(cleanPath)) {
    throw new MenuStorageAuthError(
      403,
      'cross_tenant_delete_denied',
      'Acesso negado: o caminho não pertence ao estabelecimento autenticado.',
    );
  }

  return cleanPath;
}
