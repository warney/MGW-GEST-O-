import { getSupabaseClient } from '../lib/supabase';

const VAPID_PUBLIC_KEY = 'BPf9kCfw3EEmyV9ATJ4LMkc7sc8wjCY4sSuWOiEr-pubGFlcvEabNbdQlXvy-MurJ0V8Hq9sdGDoigGmTCucOBI';

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function ensureSubscription(): Promise<PushSubscription> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Este navegador não oferece suporte a notificações Push. Instale o MGW Gestão como aplicativo e tente novamente.');
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const currentKey = subscription.options.applicationServerKey;
    const expectedKey = decodeBase64Url(VAPID_PUBLIC_KEY);
    const currentBytes = currentKey ? new Uint8Array(currentKey) : new Uint8Array();
    const keyMatches = currentBytes.length === expectedKey.length &&
      currentBytes.every((value, index) => value === expectedKey[index]);
    if (!keyMatches) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }
  return subscription;
}

export async function registerOrderPushSubscription(input: {
  tenantId: string;
  userId: string;
}): Promise<void> {
  const subscription = await ensureSubscription();
  const data = subscription.toJSON();
  if (!subscription.endpoint || !data.keys?.p256dh || !data.keys.auth) {
    throw new Error('O navegador não retornou os dados completos da assinatura Push.');
  }
  const { error } = await getSupabaseClient()
    .from('tenant_push_subscriptions')
    .upsert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      endpoint: subscription.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      is_enabled: true,
      user_agent: navigator.userAgent.slice(0, 500),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,user_id,endpoint' });
  if (error) throw new Error(error.message);

  // Keep only the current endpoint for this user and tenant. This removes
  // browser subscriptions created with an older VAPID public key.
  const { error: cleanupError } = await getSupabaseClient()
    .from('tenant_push_subscriptions')
    .delete()
    .eq('tenant_id', input.tenantId)
    .eq('user_id', input.userId)
    .neq('endpoint', subscription.endpoint);
  if (cleanupError) throw new Error(cleanupError.message);
}

export async function setOrderPushSubscriptionEnabled(input: {
  tenantId: string;
  userId: string;
  enabled: boolean;
}): Promise<void> {
  if (input.enabled) {
    await registerOrderPushSubscription(input);
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    if (input.enabled) await registerOrderPushSubscription(input);
    return;
  }
  const { data, error } = await getSupabaseClient()
    .from('tenant_push_subscriptions')
    .update({ is_enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq('tenant_id', input.tenantId)
    .eq('user_id', input.userId)
    .eq('endpoint', subscription.endpoint)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (input.enabled && !data) await registerOrderPushSubscription(input);
}
