export type MenuImageKind = 'logo' | 'banner' | 'product' | 'combo';

export type TenantStorageRole = 'owner' | 'admin' | 'manager' | 'staff';

export function assertMenuImagePermission(role: unknown, kind: unknown): asserts kind is MenuImageKind {
  if (kind !== 'logo' && kind !== 'banner' && kind !== 'product' && kind !== 'combo') {
    throw new MenuStorageAuthError(400, 'invalid_image_kind', 'Tipo de imagem inválido.');
  }

  const allowedRoles = kind === 'logo' || kind === 'banner'
    ? ['owner', 'admin']
    : ['owner', 'admin', 'manager'];

  if (typeof role !== 'string' || !allowedRoles.includes(role)) {
    throw new MenuStorageAuthError(
      403,
      'insufficient_role',
      kind === 'logo' || kind === 'banner'
        ? 'Somente o proprietário ou administrador pode alterar a identidade visual.'
        : 'Somente proprietário, administrador ou gerente pode alterar imagens do catálogo.',
    );
  }
}

export function inferMenuImageKindFromPath(path: string): MenuImageKind {
  if (path.includes('/branding/logo/') || /\/branding\/[^/]+$/.test(path)) return 'logo';
  if (path.includes('/branding/banner/')) return 'banner';
  if (path.includes('/products/')) return 'product';
  if (path.includes('/combos/')) return 'combo';
  throw new MenuStorageAuthError(403, 'unknown_image_path', 'Não foi possível identificar o tipo da imagem.');
}

export class MenuStorageAuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'MenuStorageAuthError';
    this.status = status;
    this.code = code;
  }
}

export const MAX_MENU_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_MENU_IMAGE_TYPES = [
  'image/webp',
  'image/jpeg',
  'image/png',
] as const;

const SAFE_TENANT_ID_REGEX = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const SAFE_ENTITY_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;
const UUID_TENANT_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeTenantId(rawTenantId: unknown): string {
  const normalized =
    typeof rawTenantId === 'string' ? rawTenantId.trim().toLowerCase() : '';
  if (!UUID_TENANT_REGEX.test(normalized)) {
    throw new MenuStorageAuthError(
      400,
      'invalid_tenant_id',
      'Identificador de estabelecimento inválido.',
    );
  }
  return normalized;
}

export function resolveCorsOrigin(
  requestOrigin: string | null,
  allowedOriginsEnv?: string,
): string | null {
  const raw = (allowedOriginsEnv || '').trim();
  if (!raw) {
    return '*';
  }

  const allowlist = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowlist.length === 0 || allowlist.includes('*')) {
    return '*';
  }

  const origin = (requestOrigin || '').trim();
  if (!origin) {
    return null;
  }

  return allowlist.includes(origin) ? origin : null;
}

export function buildCorsHeaders(params: {
  requestOrigin: string | null;
  allowedOriginsEnv?: string;
  allowedMethods?: string;
  allowedHeaders?: string;
}): Record<string, string> {
  const origin = resolveCorsOrigin(
    params.requestOrigin,
    params.allowedOriginsEnv,
  );
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': params.allowedMethods || 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      params.allowedHeaders || 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    if (origin !== '*') {
      headers['Vary'] = 'Origin';
    }
  }

  return headers;
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
