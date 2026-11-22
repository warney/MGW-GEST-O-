import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  assertMenuImagePermission,
  buildCanonicalMenuStoragePath,
  buildCorsHeaders,
  inferMenuImageKindFromPath,
  MenuStorageAuthError,
  normalizeTenantId,
  validateTenantDeletePath,
} from './auth.ts';

const BUCKET_NAME = 'mgw-cardapios';

interface TenantMemberRow {
  tenant_id: string;
  role: string;
}

interface TenantRow {
  id: string;
  status: string;
  billing_exempt: boolean;
}

interface SubscriptionRow {
  status: string | null;
  trial_ends_at: string | null;
  grace_until: string | null;
  current_period_end: string | null;
  retention_status: string | null;
}

function getRequestCorsHeaders(req: Request): Record<string, string> {
  const allowedOrigins =
    Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('MGW_ALLOWED_ORIGINS');
  return buildCorsHeaders({
    requestOrigin: req.headers.get('origin'),
    allowedOriginsEnv: allowedOrigins,
    allowedMethods: 'POST, OPTIONS',
    allowedHeaders: 'authorization, x-client-info, apikey, content-type',
  });
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function extractBearerToken(req: Request): string {
  const value = req.headers.get('authorization')?.trim() || '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function authorizeTenant(
  admin: SupabaseClient,
  token: string,
  requestedTenantId: unknown,
): Promise<{ tenantId: string; role: string }> {
  if (!token) {
    throw new MenuStorageAuthError(401, 'missing_token', 'Sessão Supabase ausente. Entre novamente.');
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.id || !user.email || !user.email_confirmed_at) {
    throw new MenuStorageAuthError(401, 'invalid_session', 'Sessão inválida ou e-mail ainda não confirmado.');
  }

  const tenantId = normalizeTenantId(requestedTenantId);

  const { data: member, error: memberError } = await admin
    .from('tenant_members')
    .select('tenant_id,role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle<TenantMemberRow>();

  if (memberError || !member) {
    throw new MenuStorageAuthError(
      403,
      'tenant_mismatch',
      'Você não tem permissão para gerenciar imagens deste estabelecimento.',
    );
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id,status,billing_exempt')
    .eq('id', tenantId)
    .maybeSingle<TenantRow>();

  if (tenantError || !tenant || tenant.status !== 'active') {
    throw new MenuStorageAuthError(403, 'tenant_inactive', 'Este estabelecimento não está ativo.');
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status,trial_ends_at,grace_until,current_period_end,retention_status')
    .eq('tenant_id', tenantId)
    .maybeSingle<SubscriptionRow>();

  const nowMs = Date.now();
  const subStatus = sub?.status ?? '';
  const retentionBlocked = Boolean(sub?.retention_status && sub.retention_status !== 'none');
  const trialActive =
    subStatus === 'trialing' &&
    Boolean(sub?.trial_ends_at) &&
    Date.parse(sub?.trial_ends_at ?? '') > nowMs;
  const graceActive =
    (subStatus === 'paused' || subStatus === 'past_due') &&
    Boolean(sub?.grace_until) &&
    Date.parse(sub?.grace_until ?? '') > nowMs;
  const cancelledActive =
    subStatus === 'cancelled' &&
    Boolean(sub?.current_period_end) &&
    Date.parse(sub?.current_period_end ?? '') > nowMs;

  const billingActive =
    !retentionBlocked &&
    Boolean(
      tenant.billing_exempt ||
        ['authorized', 'active', 'exempt', 'free'].includes(subStatus) ||
        trialActive ||
        graceActive ||
        cancelledActive,
    );

  if (!billingActive) {
    throw new MenuStorageAuthError(
      403,
      'billing_inactive',
      'O acesso deste estabelecimento está suspenso ou aguardando ativação.',
    );
  }

  return { tenantId, role: String(member.role || '') };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getRequestCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido. Use POST.' }, 405, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[menu-storage] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
      return jsonResponse(
        { error: 'Configuração de servidor do Supabase Storage incompleta.' },
        500,
        corsHeaders,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = extractBearerToken(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Corpo JSON inválido.' }, 400, corsHeaders);
    }

    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const authorization = await authorizeTenant(admin, token, body.tenantId);
    const tenantId = authorization.tenantId;

    if (action === 'create-upload-url') {
      assertMenuImagePermission(authorization.role, body.kind);
      const target = buildCanonicalMenuStoragePath({
        authorizedTenantId: tenantId,
        kind: body.kind,
        entityId: body.entityId,
        contentType: body.contentType,
        fileSize: body.fileSize,
      });
      const { data, error } = await admin.storage
        .from(BUCKET_NAME)
        .createSignedUploadUrl(target.path, { upsert: false });
      if (error || !data?.signedUrl) {
        console.error('[menu-storage] Erro ao gerar Signed Upload URL:', error);
        return jsonResponse(
          { error: error?.message || 'Não foi possível gerar autorização temporária de upload.' },
          500,
          corsHeaders,
        );
      }
      const { data: publicData } = admin.storage.from(BUCKET_NAME).getPublicUrl(target.path);
      return jsonResponse(
        {
          bucket: BUCKET_NAME,
          tenantId,
          path: target.path,
          signedUrl: data.signedUrl,
          token: data.token,
          publicUrl: publicData.publicUrl,
          contentType: target.contentType,
        },
        200,
        corsHeaders,
      );
    }

    if (action === 'delete') {
      const path = validateTenantDeletePath({
        authorizedTenantId: tenantId,
        rawPath: body.path,
      });
      assertMenuImagePermission(authorization.role, inferMenuImageKindFromPath(path));
      const { error } = await admin.storage.from(BUCKET_NAME).remove([path]);
      if (error) {
        console.error('[menu-storage] Erro ao excluir arquivo:', error);
        return jsonResponse(
          { error: error.message || 'Não foi possível excluir a imagem.' },
          500,
          corsHeaders,
        );
      }
      return jsonResponse({ deleted: true, tenantId, path }, 200, corsHeaders);
    }

    return jsonResponse(
      { error: 'Ação inválida. Use create-upload-url ou delete.' },
      400,
      corsHeaders,
    );
  } catch (err) {
    if (err instanceof MenuStorageAuthError) {
      return jsonResponse({ error: err.message, code: err.code }, err.status, corsHeaders);
    }
    console.error('[menu-storage] Erro inesperado:', err);
    return jsonResponse({ error: 'Erro interno ao processar operação de imagem.' }, 500, corsHeaders);
  }
});
