// @ts-nocheck
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-mgw-push-secret',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  if (!safeEqual(expected, request.headers.get('x-mgw-push-secret') || '')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@mgw.app';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!publicKey || !privateKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Web Push secrets are not configured.');
    return json({ error: 'Push service is not configured' }, 503);
  }

  let event;
  try { event = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const orderId = event?.record?.id;
  const tenantId = event?.record?.tenant_id;
  if (typeof orderId !== 'string' || typeof tenantId !== 'string') {
    return json({ error: 'Invalid order event' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: order, error: orderError }, { data: subscriptions, error: subscriptionsError }, { data: menu }] = await Promise.all([
    supabase.from('online_orders')
      .select('id,tenant_id,order_number,order_code,customer_name,fulfillment_type,total_amount,status')
      .eq('id', orderId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenant_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('tenant_id', tenantId).eq('is_enabled', true),
    supabase.from('digital_menu_settings').select('store_name')
      .eq('tenant_id', tenantId).maybeSingle(),
  ]);
  if (orderError || !order || order.status !== 'received') {
    console.error('New order could not be resolved.', orderError?.message);
    return json({ error: 'Order not found' }, 404);
  }
  if (subscriptionsError) {
    console.error('Push subscriptions could not be loaded.', subscriptionsError.message);
    return json({ error: 'Could not load push subscriptions' }, 500);
  }
  if (!subscriptions?.length) return json({ sent: 0, expired: 0 });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const storeName = menu?.store_name || 'MGW Gestão';
  const orderCode = order.order_code || `#${String(order.order_number).padStart(4, '0')}`;
  const fulfillment = order.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada';
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(order.total_amount));
  const payload = JSON.stringify({
    title: `Novo pedido ${orderCode} — ${storeName}`,
    body: `${order.customer_name} · ${fulfillment} · ${amount}`,
    url: '/?view=orders',
    tag: `mgw-order-${order.id}`,
    orderId: order.id,
  });

  let sent = 0;
  let expired = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60, urgency: 'high' });
      sent++;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from('tenant_push_subscriptions').delete().eq('id', subscription.id);
        expired++;
      } else {
        console.error('Web Push delivery failed.', error?.statusCode || 'unknown');
      }
    }
  }));
  return json({ sent, expired });
});
