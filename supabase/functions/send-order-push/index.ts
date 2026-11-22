import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

interface OrderWebhookPayload {
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
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface DigitalMenuRow {
  store_name: string | null;
}

interface WebPushStatusError {
  statusCode?: number;
}

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
    'Access-Control-Allow-Headers': 'content-type, x-mgw-push-secret',
    'Content-Type': 'application/json',
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

Deno.serve(async (request: Request) => {
  const headers = getRequestCorsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const expected = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  if (!safeEqual(expected, request.headers.get('x-mgw-push-secret') || '')) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@mgw.app';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!publicKey || !privateKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Web Push secrets are not configured.');
    return json({ error: 'Push service is not configured' }, 503, headers);
  }

  let event: OrderWebhookPayload;
  try {
    event = (await request.json()) as OrderWebhookPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400, headers);
  }

  const orderId = event?.record?.id;
  const tenantId = event?.record?.tenant_id;
  if (typeof orderId !== 'string' || typeof tenantId !== 'string') {
    return json({ error: 'Invalid order event' }, 400, headers);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [
    { data: order, error: orderError },
    { data: subscriptions, error: subscriptionsError },
    { data: menu },
  ] = await Promise.all([
    supabase
      .from('online_orders')
      .select('id,tenant_id,order_number,order_code,customer_name,fulfillment_type,total_amount,status')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle<OnlineOrderPushRow>(),
    supabase
      .from('tenant_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true)
      .returns<PushSubscriptionRow[]>(),
    supabase
      .from('digital_menu_settings')
      .select('store_name')
      .eq('tenant_id', tenantId)
      .maybeSingle<DigitalMenuRow>(),
  ]);

  if (orderError || !order || order.status !== 'received') {
    console.error('New order could not be resolved.', orderError?.message);
    return json({ error: 'Order not found' }, 404, headers);
  }
  if (subscriptionsError) {
    console.error('Push subscriptions could not be loaded.', subscriptionsError.message);
    return json({ error: 'Could not load push subscriptions' }, 500, headers);
  }
  if (!subscriptions?.length) return json({ sent: 0, expired: 0 }, 200, headers);

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const storeName = menu?.store_name || 'MGW Gestão';
  const orderCode = order.order_code || `#${String(order.order_number).padStart(4, '0')}`;
  const fulfillment = order.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada';
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(order.total_amount),
  );
  const payload = JSON.stringify({
    title: `Novo pedido ${orderCode} — ${storeName}`,
    body: `${order.customer_name} · ${fulfillment} · ${amount}`,
    url: '/?view=orders',
    tag: `mgw-order-${order.id}`,
    orderId: order.id,
  });

  let sent = 0;
  let expired = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 60, urgency: 'high' },
        );
        sent++;
      } catch (error) {
        const pushError = error as WebPushStatusError | null;
        if (pushError?.statusCode === 404 || pushError?.statusCode === 410) {
          await supabase.from('tenant_push_subscriptions').delete().eq('id', subscription.id);
          expired++;
        } else {
          console.error('Web Push delivery failed.', pushError?.statusCode || 'unknown');
        }
      }
    }),
  );

  return json({ sent, expired }, 200, headers);
});
