// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  buildCanonicalMenuStoragePath,
  MenuStorageAuthError,
  validateTenantDeletePath,
} from './auth.ts';

const BUCKET_NAME = 'mgw-cardapios';
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function extractBearerToken(req: Request): string {
  const value = req.headers.get('authorization')?.trim() || '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function authorizeTenant(admin: ReturnType<typeof createClient>, token: string, requestedTenantId: unknown): Promise<string> {
  if (!token) throw new MenuStorageAuthError(401, 'missing_token', 'Sessão Supabase ausente. Entre novamente.');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.id || !user.email || !user.email_confirmed_at) {
    throw new MenuStorageAuthError(401, 'invalid_session', 'Sessão inválida ou e-mail ainda não confirmado.');
  }

  const tenantId = typeof requestedTenantId === 'string' ? requestedTenantId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new MenuStorageAuthError(400, 'invalid_tenant_id', 'Identificador de estabelecimento inválido.');
  }

  const { data: member, error: memberError } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (memberError || !member) {
    throw new MenuStorageAuthError(403, 'tenant_mismatch', 'Você não tem permissão para gerenciar imagens deste estabelecimento.');
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id,status,billing_exempt')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError || !tenant || tenant.status !== 'active') {
    throw new MenuStorageAuthError(403, 'tenant_inactive', 'Este estabelecimento não está ativo.');
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status,trial_ends_at,grace_until')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const trialActive = sub?.status === 'trialing' && Boolean(sub.trial_ends_at) && Date.parse(sub.trial_ends_at as string) > Date.now();
  const graceActive = sub?.status === 'paused' && sub.grace_until && Date.parse(sub.grace_until) > Date.now();
  const billingActive = Boolean(tenant.billing_exempt || ['authorized', 'exempt', 'free'].includes(sub?.status) || trialActive || graceActive);
  if (!billingActive) throw new MenuStorageAuthError(403, 'billing_inactive', 'O acesso deste estabelecimento está suspenso ou aguardando ativação.');

  return tenantId;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido. Use POST.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[menu-storage] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
      return jsonResponse({ error: 'Configuração de servidor do Supabase Storage incompleta.' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = extractBearerToken(req);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);

    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const tenantId = await authorizeTenant(admin, token, body.tenantId);

    if (action === 'create-upload-url') {
      const target = buildCanonicalMenuStoragePath({
        authorizedTenantId: tenantId,
        kind: body.kind,
        entityId: body.entityId,
        contentType: body.contentType,
        fileSize: body.fileSize,
      });
      const { data, error } = await admin.storage.from(BUCKET_NAME).createSignedUploadUrl(target.path, { upsert: false });
      if (error || !data?.signedUrl) {
        console.error('[menu-storage] Erro ao gerar Signed Upload URL:', error);
        return jsonResponse({ error: error?.message || 'Não foi possível gerar autorização temporária de upload.' }, 500);
      }
      const { data: publicData } = admin.storage.from(BUCKET_NAME).getPublicUrl(target.path);
      return jsonResponse({ bucket: BUCKET_NAME, tenantId, path: target.path, signedUrl: data.signedUrl, token: data.token, publicUrl: publicData.publicUrl, contentType: target.contentType });
    }

    if (action === 'delete') {
      const path = validateTenantDeletePath({ authorizedTenantId: tenantId, rawPath: body.path });
      const { error } = await admin.storage.from(BUCKET_NAME).remove([path]);
      if (error) {
        console.error('[menu-storage] Erro ao excluir arquivo:', error);
        return jsonResponse({ error: error.message || 'Não foi possível excluir a imagem.' }, 500);
      }
      return jsonResponse({ deleted: true, tenantId, path });
    }

    return jsonResponse({ error: 'Ação inválida. Use create-upload-url ou delete.' }, 400);
  } catch (err) {
    if (err instanceof MenuStorageAuthError) return jsonResponse({ error: err.message, code: err.code }, err.status);
    console.error('[menu-storage] Erro inesperado:', err);
    return jsonResponse({ error: 'Erro interno ao processar operação de imagem.' }, 500);
  }
});
