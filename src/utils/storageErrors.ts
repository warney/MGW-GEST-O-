export type StorageProbeStatus =
  | 'ok'
  | 'bucket_not_found'
  | 'unauthorized'
  | 'network_error'
  | 'unknown';

export function extractStorageErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code || '').trim();
  }
  return '';
}

export function extractStorageServerResponse(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'serverResponse' in error
  ) {
    return String((error as { serverResponse?: unknown }).serverResponse || '').trim();
  }
  return '';
}

export function classifyStorageHttpProbe(
  httpStatus: number,
  bodyText = '',
): StorageProbeStatus {
  const lower = bodyText.toLowerCase();
  if (
    httpStatus === 404 ||
    (lower.includes('bucket') && lower.includes('not found'))
  ) {
    return 'bucket_not_found';
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return 'unauthorized';
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    return 'ok';
  }
  return 'unknown';
}

export function formatSupabaseEdgeErrorMessage(
  httpStatus: number,
  serverCode?: string,
  serverMessage?: string,
): string {
  const lower = `${serverCode || ''} ${serverMessage || ''}`.toLowerCase();

  if (httpStatus === 401 || lower.includes('token_expired') || lower.includes('invalid_jwt')) {
    return 'Sessão Supabase expirada ou inválida para autorizar o upload (401). Entre novamente na sua conta.';
  }
  if (httpStatus === 403 || lower.includes('tenant_mismatch') || lower.includes('no_tenant_membership')) {
    return 'Acesso negado (403): sua conta não tem permissão para enviar ou excluir imagens deste estabelecimento.';
  }
  if (httpStatus === 404 || lower.includes('bucket') && lower.includes('not found')) {
    return 'Serviço de upload do Supabase (Edge Function "menu-storage" ou bucket "mgw-cardapios") ainda não está publicado no projeto.';
  }
  if (httpStatus === 413 || lower.includes('file_too_large') || lower.includes('maximum allowed size')) {
    return 'A imagem excede o limite máximo de 2 MB configurado no bucket mgw-cardapios.';
  }
  if (httpStatus >= 500) {
    return (
      serverMessage ||
      'Erro interno no servidor do Supabase Storage ao autorizar o envio. Tente novamente em instantes.'
    );
  }
  return serverMessage || `Falha ao enviar imagem (HTTP ${httpStatus}).`;
}

export function formatStorageErrorMessage(
  error: unknown,
  probeHint?: StorageProbeStatus,
): string {
  const code = extractStorageErrorCode(error);
  const serverResponse = extractStorageServerResponse(error);
  const msg = error instanceof Error ? error.message : String(error || '');
  const lower = `${code} ${msg} ${serverResponse}`.toLowerCase();

  if (code === 'storage/canceled' || lower.includes('storage/canceled')) {
    return 'Envio da imagem cancelado. Você pode selecionar outra imagem ou tentar novamente.';
  }

  if (
    code === 'storage/bucket-not-found' ||
    probeHint === 'bucket_not_found' ||
    lower.includes('storage/bucket-not-found')
  ) {
    return 'Bucket "mgw-cardapios" não encontrado no Supabase Storage (storage/bucket-not-found). Execute a migration do bucket no projeto Supabase.';
  }

  if (
    code === 'storage/project-not-found' ||
    lower.includes('storage/project-not-found')
  ) {
    return 'Projeto Supabase não encontrado (storage/project-not-found). Verifique VITE_SUPABASE_URL.';
  }

  if (
    code === 'storage/unauthorized' ||
    lower.includes('storage/unauthorized')
  ) {
    return 'Permissão negada no Supabase Storage (storage/unauthorized). Confirme se sua conta verificada pertence a este estabelecimento.';
  }

  if (
    code === 'storage/unauthenticated' ||
    lower.includes('storage/unauthenticated')
  ) {
    return 'Sessão Supabase não autenticada (storage/unauthenticated). Saia e entre novamente antes de enviar imagens.';
  }

  if (
    code === 'storage/quota-exceeded' ||
    lower.includes('storage/quota-exceeded')
  ) {
    return 'Cota de armazenamento do Supabase Storage excedida (storage/quota-exceeded).';
  }

  if (
    code === 'storage/retry-limit-exceeded' ||
    lower.includes('storage/retry-limit-exceeded')
  ) {
    return 'Tempo limite de envio excedido (storage/retry-limit-exceeded). Verifique sua conexão e tente novamente.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('offline') ||
    probeHint === 'network_error'
  ) {
    return 'Falha de rede ao enviar a imagem. Verifique sua conexão com a internet e tente novamente.';
  }

  if (code === 'storage/unknown' || lower.includes('storage/unknown')) {
    return 'Erro desconhecido no serviço de Storage (storage/unknown). Tente novamente em instantes.';
  }

  return msg || 'Não foi possível concluir o envio da imagem. Tente novamente.';
}
