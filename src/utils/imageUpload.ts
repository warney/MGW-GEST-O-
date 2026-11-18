export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB antes da compressão
export const MAX_COMPRESSED_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB após compressão (limite no bucket)
export const MAX_IMAGE_URL_LENGTH = 1000;
export const MAX_IMAGE_PATH_LENGTH = 260;

export type ImageUploadPreset = 'logo' | 'banner' | 'catalog';
export type TenantImageFolder = 'branding' | 'products' | 'combos';
export type MenuImageKind = 'logo' | 'banner' | 'product' | 'combo';

export const IMAGE_UPLOAD_PRESETS: Record<
  ImageUploadPreset,
  {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    label: string;
    aspectHint: string;
  }
> = {
  logo: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.85,
    label: 'Logo da Loja',
    aspectHint: 'Quadrada (ex: 512×512)',
  },
  banner: {
    maxWidth: 1440,
    maxHeight: 720,
    quality: 0.82,
    label: 'Banner Principal',
    aspectHint: 'Panorâmica horizontal (ex: 1440×560)',
  },
  catalog: {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.82,
    label: 'Foto do Item',
    aspectHint: 'Quadrada ou 4:3 (ex: 800×800)',
  },
};

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const ENTITY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export function isValidTenantSlugFormat(value: string): boolean {
  return TENANT_ID_PATTERN.test(String(value || '').trim());
}

export function isValidWorkspaceId(value: string): boolean {
  return value === 'mgw_lanches' || value === 'gf_lanches';
}

export function isValidEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(String(value || '').trim());
}

export function generateDraftEntityId(prefix: 'prod' | 'combo'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function validateImageFileMeta(meta: {
  type: string;
  size: number;
}): { valid: boolean; error?: string } {
  const mime = String(meta.type || '').trim().toLowerCase();
  if (
    !ALLOWED_IMAGE_MIME_TYPES.includes(
      mime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    )
  ) {
    return {
      valid: false,
      error: 'Formato não suportado. Envie uma imagem JPG, PNG ou WebP.',
    };
  }
  if (!Number.isFinite(meta.size) || meta.size <= 0) {
    return {
      valid: false,
      error: 'Arquivo de imagem vazio ou inválido.',
    };
  }
  if (meta.size > MAX_RAW_IMAGE_BYTES) {
    return {
      valid: false,
      error: 'A imagem excede o limite máximo de 8 MB antes da otimização.',
    };
  }
  return { valid: true };
}

export function computeScaledDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(width || 1));
  const safeH = Math.max(1, Math.round(height || 1));
  if (safeW <= maxWidth && safeH <= maxHeight) {
    return { width: safeW, height: safeH };
  }
  const scale = Math.min(maxWidth / safeW, maxHeight / safeH);
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

export function sanitizeStorageFileSegment(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return cleaned || 'img';
}

export function resolveMenuImageKind(
  folder: TenantImageFolder,
  entityHint?: string,
): MenuImageKind {
  if (folder === 'branding') {
    return entityHint === 'banner' ? 'banner' : 'logo';
  }
  return folder === 'combos' ? 'combo' : 'product';
}

export function buildTenantStoragePath(
  workspaceId: string,
  folder: TenantImageFolder,
  baseName: string,
  ext: 'webp' | 'jpg' = 'webp',
  nowMs = Date.now(),
  randomSuffix = Math.random().toString(36).slice(2, 8),
  entityId?: string,
): string {
  const cleanWorkspace = String(workspaceId || '').trim();
  if (!isValidTenantSlugFormat(cleanWorkspace)) {
    throw new Error('Estabelecimento inválido para armazenamento de imagem.');
  }
  const cleanName = sanitizeStorageFileSegment(baseName);
  const cleanRand = sanitizeStorageFileSegment(randomSuffix).slice(0, 12) || 'x';
  const fileName = `${cleanName}_${Math.trunc(nowMs)}_${cleanRand}.${ext}`;

  if (folder === 'branding') {
    const subFolder = baseName === 'banner' ? 'banner' : 'logo';
    return `tenants/${cleanWorkspace}/branding/${subFolder}/${fileName}`;
  }

  const cleanEntity = String(entityId || '').trim();
  if (cleanEntity && isValidEntityId(cleanEntity)) {
    return `tenants/${cleanWorkspace}/${folder}/${cleanEntity}/${fileName}`;
  }

  return `tenants/${cleanWorkspace}/${folder}/item/${fileName}`;
}

export function isValidTenantStoragePath(
  path: string,
  expectedWorkspaceId?: string,
): boolean {
  const trimmed = String(path || '').trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_PATH_LENGTH) return false;
  if (
    trimmed.includes('..') ||
    trimmed.includes('//') ||
    trimmed.includes('\\') ||
    trimmed.includes('%') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    return false;
  }

  const tenantSegment = expectedWorkspaceId
    ? (() => {
        const cleanExpected = String(expectedWorkspaceId).trim();
        return isValidTenantSlugFormat(cleanExpected) ? cleanExpected : null;
      })()
    : '[a-z0-9][a-z0-9_-]{1,62}';

  if (!tenantSegment) return false;

  const canonicalRegex = new RegExp(
    `^tenants/${tenantSegment}/(?:branding/(?:logo|banner)|(?:products|combos)/[a-zA-Z0-9_-]{1,80})/[a-zA-Z0-9_.-]{3,160}$`,
  );
  const legacyRegex = new RegExp(
    `^tenants/${tenantSegment}/(?:branding|products|combos)/[a-zA-Z0-9_.-]{3,160}$`,
  );

  return canonicalRegex.test(trimmed) || legacyRegex.test(trimmed);
}

export function isValidImageUrl(
  rawUrl: string,
  options: { allowBlob?: boolean } = {},
): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_URL_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:')) {
    return false;
  }
  if (options.allowBlob && lower.startsWith('blob:')) {
    return true;
  }
  return lower.startsWith('https://');
}

export function sanitizeOptionalImageUrl(
  rawUrl?: string | null,
  options: { allowBlob?: boolean } = {},
): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  return isValidImageUrl(trimmed, options) ? trimmed : '';
}

export function sanitizeOptionalImagePath(
  rawPath?: string | null,
  expectedWorkspaceId?: string,
): string {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return '';
  return isValidTenantStoragePath(trimmed, expectedWorkspaceId) ? trimmed : '';
}

export interface CompressedImageResult {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  extension: 'webp' | 'jpg';
  width: number;
  height: number;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    img.src = src;
  });
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export async function compressImageFileToWebP(
  file: File,
  preset: ImageUploadPreset,
): Promise<CompressedImageResult> {
  const metaCheck = validateImageFileMeta({ type: file.type, size: file.size });
  if (!metaCheck.valid) {
    throw new Error(metaCheck.error || 'Arquivo de imagem inválido.');
  }

  const presetCfg = IMAGE_UPLOAD_PRESETS[preset];
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageElement(objectUrl);
    const naturalW = img.naturalWidth || img.width || 1;
    const naturalH = img.naturalHeight || img.height || 1;
    const target = computeScaledDimensions(
      naturalW,
      naturalH,
      presetCfg.maxWidth,
      presetCfg.maxHeight,
    );

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Não foi possível processar a imagem no navegador.');
    }

    ctx.drawImage(img, 0, 0, target.width, target.height);

    let contentType: 'image/webp' | 'image/jpeg' = 'image/webp';
    let extension: 'webp' | 'jpg' = 'webp';
    let blob = await canvasToBlobAsync(canvas, 'image/webp', presetCfg.quality);

    if (!blob || blob.type !== 'image/webp') {
      contentType = 'image/jpeg';
      extension = 'jpg';
      blob = await canvasToBlobAsync(canvas, 'image/jpeg', presetCfg.quality);
    }

    if (blob && blob.size > MAX_COMPRESSED_IMAGE_BYTES) {
      blob = await canvasToBlobAsync(canvas, contentType, 0.68);
    }

    if (!blob || blob.size <= 0) {
      throw new Error('Falha ao comprimir a imagem para envio.');
    }
    if (blob.size > MAX_COMPRESSED_IMAGE_BYTES) {
      throw new Error(
        'A imagem ficou acima de 2 MB mesmo após a otimização. Escolha uma imagem menor.',
      );
    }

    return {
      blob,
      contentType,
      extension,
      width: target.width,
      height: target.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
