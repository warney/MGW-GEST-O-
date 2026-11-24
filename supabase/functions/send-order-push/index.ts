import webpush from 'npm:web-push@3.6.7';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

interface OrderWebhookPayload {
  action?: 'diagnose' | 'test';
  tenantId?: unknown;
  expectedVapidPublicKey?: unknown;
  currentEndpoint?: unknown;
  record?: {
    id?: unknown;
    tenant_id?: unknown;
  };
}

interface OnlineOrderPushRow {
  id: string;
  tenant_id: string;
  order_number: number;
  order_code: string | null;
  customer_name: string;
  fulfillment_type: string;
  total_amount: number | string;
  status: string;
  created_at: string | null;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_enabled: boolean;
}

interface DigitalMenuRow {
  store_name: string | null;
}

interface ShopSettingsTimezoneRow {
  establishment_name: string | null;
  timezone: string | null;
}

interface TenantRow {
  id: string;
  name: string | null;
  status: string;
}

interface TenantMemberRow {
  user_id: string;
  role: string;
  active: boolean;
}

interface WebPushStatusError {
  statusCode?: number;
  body?: string;
  message?: string;
}

const ALLOWED_PUSH_ROLES = new Set(['owner', 'admin', 'manager']);

function resolveCorsOrigin(requestOrigin: string | null, allowedOriginsEnv?: string): string | null {
  const raw = (allowedOriginsEnv || '').trim();
  if (!raw) return '*';

  const allowlist = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowlist.length === 0 || allowlist.includes('*')) return '*';

  const origin = (requestOrigin || '').trim();
  if (!origin) return null;
  return allowlist.includes(origin) ? origin : null;
}

function getRequestCorsHeaders(request: Request): Record<string, string> {
  const allowedOrigins =
    Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('MGW_ALLOWED_ORIGINS');
  const origin = resolveCorsOrigin(request.headers.get('origin'), allowedOrigins);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-mgw-push-secret',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    if (origin !== '*') headers['Vary'] = 'Origin';
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function normalizeVapidSubject(rawSubject: string): string {
  const trimmed = rawSubject.trim();
  if (!trimmed) return 'mailto:suporte@mgwgestao.com.br';
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.includes('@')) {
    return `mailto:${trimmed}`;
  }
  return 'mailto:suporte@mgwgestao.com.br';
}

function formatOrderTime(isoDate: string | null, timezone: string): string {
  const ts = isoDate ? Date.parse(isoDate) : NaN;
  const date = Number.isFinite(ts) ? new Date(ts) : new Date();
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone || 'America/Manaus',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Manaus',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}

function buildWebPushTopic(seed: string): string {
  const clean = seed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28);
  return `mgw${clean || 'order'}`;
}

function extractSafeErrorMessage(err: unknown): string {
  const pushErr = err as WebPushStatusError | null;
  const code = pushErr?.statusCode ? `HTTP ${pushErr.statusCode}` : '';
  const body = typeof pushErr?.body === 'string' ? pushErr.body.trim().slice(0, 140) : '';
  const msg = typeof pushErr?.message === 'string' ? pushErr.message.trim().slice(0, 140) : '';
  return [code, body || msg].filter(Boolean).join(': ') || 'Falha desconhecida no serviço Push';
}

async function upsertDeliveryLogSafe(
  supabase: SupabaseClient,
  entry: {
    tenant_id: string;
    order_id: string | null;
    event_type: string;
    status: string;
    http_status: number | null;
    sent_count: number;
    expired_count: number;
    failed_count: number;
    error_message: string;
  },
): Promise<void> {
  try {
    if (entry.order_id) {
      await supabase
        .from('order_push_delivery_logs')
        .upsert(
          {
            ...entry,
            error_message: entry.error_message.slice(0, 400),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'order_id,event_type' },
        );
      return;
    }
    await supabase.from('order_push_delivery_logs').insert({
      ...entry,
      error_message: entry.error_message.slice(0, 400),
    });
  } catch {
    // Tabela opcional caso migration ainda nao tenha sido aplicada em producao
  }
}

async function sendBatchPushNotifications(
  supabase: SupabaseClient,
  subscriptions: PushSubscriptionRow[],
  payload: string,
  topic: string,
): Promise<{
  sent: number;
  expired: number;
  failed: number;
  lastError: string | null;
}> {
  let sent = 0;
  let expired = 0;
  let failed = 0;
  let lastError: string | null = null;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 3600, urgency: 'high', headers: { Topic: topic } },
        );
        sent += 1;
      } catch (error) {
        const pushError = error as WebPushStatusError | null;
        if (pushError?.statusCode === 404 || pushError?.statusCode === 410) {
          await supabase.from('tenant_push_subscriptions').delete().eq('id', subscription.id);
          expired += 1;
        } else {
          failed += 1;
          lastError = extractSafeErrorMessage(error);
          console.error('Web Push delivery failed.', lastError);
        }
      }
    }),
  );

  return { sent, expired, failed, lastError };
}

function extractBearerToken(request: Request): string {
  const value = request.headers.get('authorization')?.trim() || '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

async function handleAuthenticatedPanelAction(
  request: Request,
  body: OrderWebhookPayload,
  headers: Record<string, string>,
  config: {
    supabaseUrl: string;
    serviceRoleKey: string;
    publicKey: string;
    privateKey: string;
    subject: string;
    webhookSecret: string;
  },
): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return json({ error: 'Sessão Supabase ausente.' }, 401, headers);
  }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
  if (!tenantId) {
    return json({ error: 'Estabelecimento não informado.' }, 400, headers);
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.id || !user.email_confirmed_at) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401, headers);
  }

  const [
    { data: member },
    { data: tenant },
    { data: menu },
    { data: subs },
  ] = await Promise.all([
    supabase
      .from('tenant_members')
      .select('user_id,role,active')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle<TenantMemberRow>(),
    supabase
      .from('tenants')
      .select('id,name,status')
      .eq('id', tenantId)
      .maybeSingle<TenantRow>(),
    supabase
      .from('digital_menu_settings')
      .select('store_name')
      .eq('tenant_id', tenantId)
      .maybeSingle<DigitalMenuRow>(),
    supabase
      .from('tenant_push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,is_enabled')
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true)
      .returns<PushSubscriptionRow[]>(),
  ]);

  if (!member || !ALLOWED_PUSH_ROLES.has(member.role)) {
    return json({ error: 'Sem permissão para diagnosticar notificações deste estabelecimento.' }, 403, headers);
  }
  if (!tenant || tenant.status !== 'active') {
    return json({ error: 'Estabelecimento inativo.' }, 403, headers);
  }

  const expectedFrontendKey =
    typeof body.expectedVapidPublicKey === 'string'
      ? body.expectedVapidPublicKey.trim()
      : '';
  const currentEndpoint =
    typeof body.currentEndpoint === 'string' ? body.currentEndpoint.trim() : '';

  const enabledSubs = subs ?? [];
  const currentEndpointRegistered = Boolean(
    currentEndpoint &&
      enabledSubs.some(
        (s) => s.user_id === user.id && s.endpoint === currentEndpoint,
      ),
  );

  const diagnostics = {
    hasWebhookSecret: Boolean(config.webhookSecret.trim()),
    hasVapidPublicKey: Boolean(config.publicKey.trim()),
    hasVapidPrivateKey: Boolean(config.privateKey.trim()),
    vapidKeyMatchesFrontend:
      Boolean(config.publicKey.trim()) && Boolean(expectedFrontendKey)
        ? config.publicKey.trim() === expectedFrontendKey
        : null,
    activeSubscriptionsCount: enabledSubs.length,
    currentEndpointRegistered,
  };

  if (body.action === 'diagnose') {
    return json({ ok: true, diagnostics }, 200, headers);
  }

  if (!diagnostics.hasVapidPublicKey || !diagnostics.hasVapidPrivateKey) {
    return json(
      {
        ok: false,
        error: 'As chaves VAPID não estão configuradas nas secrets da Edge Function send-order-push.',
        diagnostics,
      },
      503,
      headers,
    );
  }

  if (diagnostics.vapidKeyMatchesFrontend === false) {
    return json(
      {
        ok: false,
        error: 'A chave VAPID_PUBLIC_KEY configurada no Supabase não coincide com a chave pública do frontend.',
        diagnostics,
      },
      409,
      headers,
    );
  }

  const targetSubs = currentEndpoint
    ? enabledSubs.filter((s) => s.user_id === user.id && s.endpoint === currentEndpoint)
    : enabledSubs.filter((s) => s.user_id === user.id);

  if (targetSubs.length === 0) {
    return json(
      {
        ok: false,
        error: 'Este dispositivo ainda não está salvo como ativo no banco de dados deste estabelecimento.',
        diagnostics,
      },
      404,
      headers,
    );
  }

  const storeName = menu?.store_name || tenant.name || 'MGW Gestão';
  try {
    webpush.setVapidDetails(
      normalizeVapidSubject(config.subject),
      config.publicKey.trim(),
      config.privateKey.trim(),
    );
  } catch (err) {
    return json(
      {
        ok: false,
        error: `Configuração VAPID inválida: ${extractSafeErrorMessage(err)}`,
        diagnostics,
      },
      500,
      headers,
    );
  }

  const testTimestamp = Date.now();
  const testPayload = JSON.stringify({
    kind: 'test_push',
    title: '🔔 TESTE DE NOTIFICAÇÃO — MGW GESTÃO',
    body: `${storeName}: Web Push em segundo plano ativo e configurado neste dispositivo!`,
    url: '/?view=orders',
    tag: `mgw-push-test-${testTimestamp}`,
    orderId: null,
    tenantId,
    timestamp: testTimestamp,
  });

  const result = await sendBatchPushNotifications(
    supabase,
    targetSubs,
    testPayload,
    buildWebPushTopic(`test${testTimestamp}`),
  );

  await upsertDeliveryLogSafe(supabase, {
    tenant_id: tenantId,
    order_id: null,
    event_type: 'manual_test',
    status: result.sent > 0 ? 'sent' : 'failed',
    http_status: result.sent > 0 ? 200 : 502,
    sent_count: result.sent,
    expired_count: result.expired,
    failed_count: result.failed,
    error_message: result.lastError || '',
  });

  return json(
    {
      ok: result.sent > 0,
      sent: result.sent,
      expired: result.expired,
      failed: result.failed,
      lastError: result.lastError,
      diagnostics,
    },
    result.sent > 0 ? 200 : 502,
    headers,
  );
}

Deno.serve(async (request: Request) => {
  const headers = getRequestCorsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const expected = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  const publicKey = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim();
  const privateKey = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@mgwgestao.com.br';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  let event: OrderWebhookPayload;
  try {
    event = (await request.json()) as OrderWebhookPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400, headers);
  }

  // Modo autenticado do painel administrativo (diagnóstico ou teste real ponta a ponta)
  if (event?.action === 'diagnose' || event?.action === 'test') {
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Supabase service environment not configured' }, 503, headers);
    }
    return handleAuthenticatedPanelAction(request, event, headers, {
      supabaseUrl,
      serviceRoleKey,
      publicKey,
      privateKey,
      subject,
      webhookSecret: expected,
    });
  }

  // Modo webhook automático disparado pelo PostgreSQL (pg_net)
  if (!safeEqual(expected, request.headers.get('x-mgw-push-secret') || '')) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  if (!publicKey || !privateKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Web Push secrets are not configured.');
    return json({ error: 'Push service is not configured' }, 503, headers);
  }

  const orderId = event?.record?.id;
  const tenantId = event?.record?.tenant_id;
  if (typeof orderId !== 'string' || typeof tenantId !== 'string') {
    return json({ error: 'Invalid order event' }, 400, headers);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Deduplicação idempotente: evita envio repetido para o mesmo pedido
  try {
    const { data: existingLog } = await supabase
      .from('order_push_delivery_logs')
      .select('status,sent_count')
      .eq('order_id', orderId)
      .eq('event_type', 'order_received')
      .maybeSingle<{ status: string; sent_count: number }>();

    if (existingLog?.status === 'sent' && existingLog.sent_count > 0) {
      return json({ sent: 0, expired: 0, deduplicated: true }, 200, headers);
    }
  } catch {
    // Continua normalmente se a tabela ainda nao existir
  }

  const [
    { data: order, error: orderError },
    { data: tenant },
    { data: subscriptions, error: subscriptionsError },
    { data: authorizedMembers, error: membersError },
    { data: menu },
    { data: shopSettings },
  ] = await Promise.all([
    supabase
      .from('online_orders')
      .select('id,tenant_id,order_number,order_code,customer_name,fulfillment_type,total_amount,status,created_at')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle<OnlineOrderPushRow>(),
    supabase
      .from('tenants')
      .select('id,name,status')
      .eq('id', tenantId)
      .maybeSingle<TenantRow>(),
    supabase
      .from('tenant_push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,is_enabled')
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true)
      .returns<PushSubscriptionRow[]>(),
    supabase
      .from('tenant_members')
      .select('user_id,role,active')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .returns<TenantMemberRow[]>(),
    supabase
      .from('digital_menu_settings')
      .select('store_name')
      .eq('tenant_id', tenantId)
      .maybeSingle<DigitalMenuRow>(),
    supabase
      .from('shop_settings')
      .select('establishment_name,timezone')
      .eq('tenant_id', tenantId)
      .maybeSingle<ShopSettingsTimezoneRow>(),
  ]);

  if (orderError || !order || order.status !== 'received' || !tenant || tenant.status !== 'active') {
    console.error('New order could not be resolved.', orderError?.message);
    return json({ error: 'Order not found' }, 404, headers);
  }
  if (subscriptionsError || membersError) {
    const errMsg = subscriptionsError?.message || membersError?.message || 'Unknown DB error';
    console.error('Push subscriptions could not be loaded.', errMsg);
    await upsertDeliveryLogSafe(supabase, {
      tenant_id: tenantId,
      order_id: orderId,
      event_type: 'order_received',
      status: 'failed',
      http_status: 500,
      sent_count: 0,
      expired_count: 0,
      failed_count: 0,
      error_message: errMsg,
    });
    return json({ error: 'Could not load push subscriptions' }, 500, headers);
  }

  const authorizedUserIds = new Set(
    (authorizedMembers ?? [])
      .filter((m) => m.active && ALLOWED_PUSH_ROLES.has(m.role))
      .map((m) => m.user_id),
  );
  const eligibleSubscriptions = (subscriptions ?? []).filter((sub) =>
    authorizedUserIds.has(sub.user_id),
  );

  if (eligibleSubscriptions.length === 0) {
    await upsertDeliveryLogSafe(supabase, {
      tenant_id: tenantId,
      order_id: orderId,
      event_type: 'order_received',
      status: 'no_subscriptions',
      http_status: 200,
      sent_count: 0,
      expired_count: 0,
      failed_count: 0,
      error_message: 'Nenhum dispositivo autorizado inscrito para este estabelecimento.',
    });
    return json({ sent: 0, expired: 0 }, 200, headers);
  }

  try {
    webpush.setVapidDetails(normalizeVapidSubject(subject), publicKey, privateKey);
  } catch (err) {
    const msg = extractSafeErrorMessage(err);
    console.error('Invalid VAPID configuration:', msg);
    await upsertDeliveryLogSafe(supabase, {
      tenant_id: tenantId,
      order_id: orderId,
      event_type: 'order_received',
      status: 'failed',
      http_status: 500,
      sent_count: 0,
      expired_count: 0,
      failed_count: eligibleSubscriptions.length,
      error_message: msg,
    });
    return json({ error: 'Invalid VAPID configuration' }, 500, headers);
  }

  const storeName =
    menu?.store_name ||
    shopSettings?.establishment_name ||
    tenant.name ||
    'MGW Gestão';
  const orderCode =
    order.order_code && order.order_code.startsWith('#')
      ? order.order_code
      : `#${String(order.order_number).padStart(4, '0')}`;
  const fulfillment = order.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada';
  const amount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(order.total_amount));
  const orderTime = formatOrderTime(
    order.created_at,
    shopSettings?.timezone || 'America/Manaus',
  );

  const payload = JSON.stringify({
    kind: 'new_order',
    title: '🔔 NOVO PEDIDO RECEBIDO!',
    body: `${storeName} recebeu um novo pedido!\nPedido ${orderCode} • ${amount} (${fulfillment}) · ${order.customer_name} · ${orderTime}`,
    url: '/?view=orders',
    tag: `mgw-order-${order.id}`,
    orderId: order.id,
    tenantId: order.tenant_id,
    orderCode,
    storeName,
    totalAmount: amount,
    orderTime,
    timestamp: order.created_at ? Date.parse(order.created_at) || Date.now() : Date.now(),
  });

  const result = await sendBatchPushNotifications(
    supabase,
    eligibleSubscriptions,
    payload,
    buildWebPushTopic(order.id),
  );

  const logStatus =
    result.sent > 0
      ? result.failed > 0
        ? 'partial_failure'
        : 'sent'
      : 'failed';

  await upsertDeliveryLogSafe(supabase, {
    tenant_id: tenantId,
    order_id: orderId,
    event_type: 'order_received',
    status: logStatus,
    http_status: result.sent > 0 ? 200 : 502,
    sent_count: result.sent,
    expired_count: result.expired,
    failed_count: result.failed,
    error_message: result.lastError || '',
  });

  return json(
    {
      sent: result.sent,
      expired: result.expired,
      failed: result.failed,
    },
    200,
    headers,
  );
});
