export type MenuImageKind = 'logo' | 'banner' | 'product' | 'combo';

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
