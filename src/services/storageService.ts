import { auth } from '../firebase';
import { getSupabaseStorageConfig } from '../lib/supabase';
import {
  buildTenantStoragePath,
  compressImageFileToWebP,
  type ImageUploadPreset,
  isValidEntityId,
  isValidTenantSlugFormat,
  isValidTenantStoragePath,
  resolveMenuImageKind,
  sanitizeStorageFileSegment,
  type TenantImageFolder,
} from '../utils/imageUpload';
import {
  formatStorageErrorMessage,
  formatSupabaseEdgeErrorMessage,
} from '../utils/storageErrors';
import { isDemoSandboxActive } from './demoSandbox';

export { formatStorageErrorMessage };

export interface UploadedImageMetadata {
  url: string;
  path: string;
}

const SIGNED_URL_REQUEST_TIMEOUT_MS = 15_000;
const SIGNED_UPLOAD_TIMEOUT_MS = 30_000;
const EDGE_DELETE_TIMEOUT_MS = 12_000;

interface SignedUploadEdgeResponse {
  bucket?: string;
  tenantId?: string;
  path?: string;
  signedUrl?: string;
  token?: string;
  publicUrl?: string;
  contentType?: string;
  error?: string;
  code?: string;
}

function createAbortSignalWithTimeout(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

function uploadBlobViaSignedUrl(params: {
  signedUrl: string;
  blob: Blob;
  contentType: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { signedUrl, blob, contentType, onProgress, signal } = params;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(formatStorageErrorMessage({ code: 'storage/canceled' })));
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    let maxReported = 15;

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const handleAbort = () => {
      try {
        xhr.abort();
      } catch {
        // noop
      }
      fail(new Error(formatStorageErrorMessage({ code: 'storage/canceled' })));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    xhr.open('PUT', signedUrl, true);
    xhr.timeout = SIGNED_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (event) => {
      if (settled || !event.lengthComputable || event.total <= 0) return;
      const ratio = event.loaded / event.total;
      const computed = Math.round(15 + ratio * 84);
      const bounded = Math.min(99, Math.max(maxReported, computed));
      if (bounded > maxReported) {
        maxReported = bounded;
        onProgress?.(bounded);
      }
    };

    xhr.onload = () => {
      if (settled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        settled = true;
        cleanup();
        onProgress?.(100);
        resolve();
        return;
      }

      let serverCode = '';
      let serverMessage = '';
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          error?: unknown;
          message?: unknown;
          statusCode?: unknown;
        };
        serverCode = String(parsed.error || parsed.statusCode || '');
        serverMessage = String(parsed.message || parsed.error || '');
      } catch {
        serverMessage = xhr.responseText || '';
      }

      fail(
        new Error(
          formatSupabaseEdgeErrorMessage(
            xhr.status,
            serverCode,
            serverMessage || `Falha ao enviar arquivo ao Storage (HTTP ${xhr.status}).`,
          ),
        ),
      );
    };

    xhr.onerror = () => {
      fail(
        new Error(
          formatStorageErrorMessage(new TypeError('Failed to fetch'), 'network_error'),
        ),
      );
    };

    xhr.ontimeout = () => {
      fail(
        new Error(
          formatStorageErrorMessage({
            code: 'storage/retry-limit-exceeded',
            message: 'Tempo limite de envio excedido.',
          }),
        ),
      );
    };

    xhr.onabort = () => {
      fail(new Error(formatStorageErrorMessage({ code: 'storage/canceled' })));
    };

    xhr.send(blob);
  });
}

export async function uploadTenantMenuImage(params: {
  workspaceId: string;
  folder: TenantImageFolder;
  entityHint: string;
  entityId?: string;
  file: File;
  preset: ImageUploadPreset;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<UploadedImageMetadata> {
  const {
    workspaceId,
    folder,
    entityHint,
    entityId,
    file,
    preset,
    onProgress,
    signal,
  } = params;

  const cleanWorkspace = String(workspaceId || '').trim().toLowerCase();
  if (!isValidTenantSlugFormat(cleanWorkspace)) {
    throw new Error('Estabelecimento não autorizado para envio de imagens.');
  }

  if (signal?.aborted) {
    throw new Error(formatStorageErrorMessage({ code: 'storage/canceled' }));
  }

  onProgress?.(2);
  const compressed = await compressImageFileToWebP(file, preset);

  if (signal?.aborted) {
    throw new Error(formatStorageErrorMessage({ code: 'storage/canceled' }));
  }

  const kind = resolveMenuImageKind(folder, entityHint);
  const cleanEntityId =
    entityId && isValidEntityId(entityId.trim())
      ? entityId.trim()
      : sanitizeStorageFileSegment(entityHint);

  const demoStoragePath = buildTenantStoragePath(
    cleanWorkspace,
    folder,
    entityHint,
    compressed.extension,
    Date.now(),
    undefined,
    cleanEntityId,
  );

  // Em modo demonstração (?demo=1), gera apenas URL de objeto local da sessão sem chamadas externas.
  if (isDemoSandboxActive()) {
    onProgress?.(100);
    const demoUrl = URL.createObjectURL(compressed.blob);
    return { url: demoUrl, path: demoStoragePath };
  }

  const supabaseCfg = getSupabaseStorageConfig();
  if (
    !supabaseCfg.configured ||
    !supabaseCfg.edgeFunctionUrl ||
    !supabaseCfg.anonKey
  ) {
    throw new Error(
      `Supabase Storage não configurado no ambiente (${supabaseCfg.missing.join(', ') || 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'}).`,
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error(formatStorageErrorMessage({ code: 'storage/unauthenticated' }));
  }

  onProgress?.(6);
  const firebaseIdToken = await currentUser.getIdToken();

  if (signal?.aborted) {
    throw new Error(formatStorageErrorMessage({ code: 'storage/canceled' }));
  }

  onProgress?.(10);
  const { signal: edgeSignal, cleanup } = createAbortSignalWithTimeout(
    SIGNED_URL_REQUEST_TIMEOUT_MS,
    signal,
  );

  let edgeResponse: Response;
  let edgePayload: SignedUploadEdgeResponse = {};

  try {
    edgeResponse = await fetch(supabaseCfg.edgeFunctionUrl, {
      method: 'POST',
      signal: edgeSignal,
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseCfg.anonKey,
        Authorization: `Bearer ${firebaseIdToken}`,
        'x-firebase-token': firebaseIdToken,
      },
      body: JSON.stringify({
        action: 'create-upload-url',
        tenantId: cleanWorkspace,
        kind,
        entityId:
          kind === 'product' || kind === 'combo' ? cleanEntityId : undefined,
        contentType: compressed.contentType,
        fileSize: compressed.blob.size,
      }),
    });
    edgePayload = (await edgeResponse.json().catch(() => ({}))) as SignedUploadEdgeResponse;
  } catch (err) {
    if (signal?.aborted) {
      throw new Error(formatStorageErrorMessage({ code: 'storage/canceled' }));
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        formatStorageErrorMessage({
          code: 'storage/retry-limit-exceeded',
          message: 'Tempo limite excedido ao autorizar upload no Supabase.',
        }),
      );
    }
    throw new Error(formatStorageErrorMessage(err, 'network_error'));
  } finally {
    cleanup();
  }

  if (!edgeResponse.ok) {
    console.warn('[Supabase Storage Edge Error]', {
      workspaceId: cleanWorkspace,
      status: edgeResponse.status,
      code: edgePayload.code,
      error: edgePayload.error,
    });
    throw new Error(
      formatSupabaseEdgeErrorMessage(
        edgeResponse.status,
        edgePayload.code,
        edgePayload.error,
      ),
    );
  }

  const signedUrl = String(edgePayload.signedUrl || '').trim();
  const canonicalPath = String(edgePayload.path || '').trim();
  const publicUrl = String(edgePayload.publicUrl || '').trim();

  if (
    !signedUrl ||
    !publicUrl ||
    !isValidTenantStoragePath(canonicalPath, cleanWorkspace)
  ) {
    throw new Error(
      'Resposta inválida do servidor de autorização de upload do Supabase.',
    );
  }

  onProgress?.(15);
  await uploadBlobViaSignedUrl({
    signedUrl,
    blob: compressed.blob,
    contentType: compressed.contentType,
    onProgress,
    signal,
  });

  return {
    url: publicUrl,
    path: canonicalPath,
  };
}

export async function deleteTenantMenuImage(
  workspaceId: string,
  storagePath?: string | null,
): Promise<void> {
  const cleanWorkspace = String(workspaceId || '').trim().toLowerCase();
  const cleanPath = String(storagePath || '').trim();
  if (!cleanPath || !cleanWorkspace) return;

  // Bloqueia qualquer tentativa de excluir objeto fora da pasta do próprio tenant.
  if (!isValidTenantStoragePath(cleanPath, cleanWorkspace)) {
    console.warn('Ignorada exclusão de caminho fora do tenant autorizado:', cleanPath);
    return;
  }

  if (isDemoSandboxActive()) {
    return;
  }

  const supabaseCfg = getSupabaseStorageConfig();
  const currentUser = auth.currentUser;
  if (
    !supabaseCfg.configured ||
    !supabaseCfg.edgeFunctionUrl ||
    !supabaseCfg.anonKey ||
    !currentUser
  ) {
    return;
  }

  const { signal, cleanup } = createAbortSignalWithTimeout(EDGE_DELETE_TIMEOUT_MS);
  try {
    const firebaseIdToken = await currentUser.getIdToken();
    const res = await fetch(supabaseCfg.edgeFunctionUrl, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseCfg.anonKey,
        Authorization: `Bearer ${firebaseIdToken}`,
        'x-firebase-token': firebaseIdToken,
      },
      body: JSON.stringify({
        action: 'delete',
        tenantId: cleanWorkspace,
        path: cleanPath,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      console.warn('[Supabase Storage] Aviso ao remover imagem antiga:', {
        status: res.status,
        code: body.code,
        error: body.error,
        path: cleanPath,
      });
    }
  } catch (err) {
    console.warn('[Supabase Storage] Aviso ao remover imagem antiga:', err);
  } finally {
    cleanup();
  }
}
