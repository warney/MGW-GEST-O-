// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';
import {
  buildCanonicalMenuStoragePath,
  DEFAULT_FIREBASE_PROJECT_ID,
  MenuStorageAuthError,
  parseTenantMembershipRegistry,
  resolveAuthorizedTenantForIdentity,
  validateFirebaseClaims,
  validateTenantDeletePath,
  type FirebaseJwtPayload,
} from './auth.ts';

const BUCKET_NAME = 'mgw-cardapios';
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-firebase-token',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function extractBearerToken(req: Request): string {
  const customHeader = req.headers.get('x-firebase-token')?.trim();
  if (customHeader) return customHeader;

  const authHeader = req.headers.get('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

async function verifyFirebaseIdToken(
  token: string,
  firebaseProjectId: string,
) {
  if (!token) {
    throw new MenuStorageAuthError(
      401,
      'missing_token',
      'Token de autenticação Firebase ausente.',
    );
  }

  let verifiedPayload: FirebaseJwtPayload;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
      algorithms: ['RS256'],
    });
    verifiedPayload = payload as unknown as FirebaseJwtPayload;
  } catch (err) {
    throw new MenuStorageAuthError(
      401,
      'invalid_signature_or_jwt',
      err instanceof Error
        ? `Token Firebase inválido: ${err.message}`
        : 'Token Firebase inválido.',
    );
  }

  return validateFirebaseClaims(verifiedPayload, firebaseProjectId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Método não permitido. Use POST.' },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() || '';
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '';
    const firebaseProjectId =
      Deno.env.get('FIREBASE_PROJECT_ID')?.trim() ||
      DEFAULT_FIREBASE_PROJECT_ID;
    const membershipRegistry = parseTenantMembershipRegistry(
      Deno.env.get('TENANT_MEMBERS_JSON'),
    );

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[menu-storage] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.');
      return jsonResponse(
        { error: 'Configuração de servidor do Supabase Storage incompleta.' },
        500,
      );
    }

    const token = extractBearerToken(req);
    const identity = await verifyFirebaseIdToken(token, firebaseProjectId);

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);
    }

    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const authorizedTenantId = resolveAuthorizedTenantForIdentity({
      identity,
      requestedTenantId:
        typeof body.tenantId === 'string' ? body.tenantId : null,
      membershipRegistry,
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === 'create-upload-url') {
      const target = buildCanonicalMenuStoragePath({
        authorizedTenantId,
        kind: body.kind,
        entityId: body.entityId,
        contentType: body.contentType,
        fileSize: body.fileSize,
      });

      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUploadUrl(target.path, { upsert: false });

      if (error || !data?.signedUrl) {
        console.error('[menu-storage] Erro ao gerar Signed Upload URL:', error);
        return jsonResponse(
          {
            error:
              error?.message ||
              'Não foi possível gerar autorização temporária de upload.',
          },
          500,
        );
      }

      const { data: pubData } = supabaseAdmin.storage
        .from(BUCKET_NAME)
        .getPublicUrl(target.path);

      return jsonResponse({
        bucket: BUCKET_NAME,
        tenantId: authorizedTenantId,
        path: target.path,
        signedUrl: data.signedUrl,
        token: data.token,
        publicUrl: pubData.publicUrl,
        contentType: target.contentType,
      });
    }

    if (action === 'delete') {
      const pathToDelete = validateTenantDeletePath({
        authorizedTenantId,
        rawPath: body.path,
      });

      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([pathToDelete]);

      if (error) {
        console.error('[menu-storage] Erro ao excluir arquivo:', error);
        return jsonResponse(
          {
            error: error.message || 'Não foi possível excluir a imagem.',
          },
          500,
        );
      }

      return jsonResponse({
        deleted: true,
        tenantId: authorizedTenantId,
        path: pathToDelete,
      });
    }

    return jsonResponse(
      { error: 'Ação inválida. Use create-upload-url ou delete.' },
      400,
    );
  } catch (err) {
    if (err instanceof MenuStorageAuthError) {
      return jsonResponse(
        { error: err.message, code: err.code },
        err.status,
      );
    }
    console.error('[menu-storage] Erro inesperado:', err);
    return jsonResponse(
      { error: 'Erro interno ao processar operação de imagem.' },
      500,
    );
  }
});
