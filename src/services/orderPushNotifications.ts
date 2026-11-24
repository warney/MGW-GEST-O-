import {
  getSupabaseClient,
  getSupabaseConfigStatus,
  isSupabaseConfigured,
} from '../lib/supabase';
import {
  getBrowserNotificationPermission,
  getServiceWorkerHealth,
  needsIOSHomeScreenForWebPush,
  type BrowserNotificationPermissionState,
  type ServiceWorkerStatusState,
} from '../utils/orderNotifications';

const VAPID_PUBLIC_KEY =
  'BPf9kCfw3EEmyV9ATJ4LMkc7sc8wjCY4sSuWOiEr-pubGFlcvEabNbdQlXvy-MurJ0V8Hq9sdGDoigGmTCucOBI';

export interface RegisteredPushDevice {
  id: string;
  userId: string;
  memberEmail: string;
  memberRole: string;
  deviceLabel: string;
  userAgent: string;
  isEnabled: boolean;
  updatedAt: string;
  isCurrentUser: boolean;
  isCurrentDevice?: boolean;
}

export interface OrderPushBackendDiagnostics {
  available: boolean;
  hasWebhookSecret: boolean;
  hasVapidPublicKey: boolean;
  hasVapidPrivateKey: boolean;
  vapidKeyMatchesFrontend: boolean | null;
  activeSubscriptionsCount: number;
  currentEndpointRegistered: boolean;
  error?: string;
}

export interface OrderPushDeliveryLogEntry {
  id: string;
  orderId: string | null;
  eventType: string;
  status: string;
  httpStatus: number | null;
  sentCount: number;
  expiredCount: number;
  failedCount: number;
  errorMessage: string;
  createdAt: string;
}

export interface OrderPushDiagnosticsSnapshot {
  permission: BrowserNotificationPermissionState;
  serviceWorkerStatus: ServiceWorkerStatusState;
  serviceWorkerScope: string | null;
  pushSupported: boolean;
  needsIOSHomeScreenInstall: boolean;
  hasBrowserSubscription: boolean;
  currentEndpoint: string | null;
  devices: RegisteredPushDevice[];
  backend: OrderPushBackendDiagnostics | null;
  recentLogs: OrderPushDeliveryLogEntry[];
}

export function getFrontendVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob(
    (value + padding).replace(/-/g, '+').replace(/_/g, '/'),
  );
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function describePushDeviceUserAgent(userAgent: string): string {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'Dispositivo cadastrado';

  let platform = 'Computador';
  if (/iphone/.test(ua)) platform = 'iPhone';
  else if (/ipad/.test(ua)) platform = 'iPad';
  else if (/android/.test(ua)) platform = 'Celular Android';
  else if (/windows/.test(ua)) platform = 'Computador Windows';
  else if (/macintosh|mac os x/.test(ua)) platform = 'Mac (macOS)';
  else if (/linux/.test(ua)) platform = 'Computador Linux';

  let browser = 'Navegador';
  if (/edg\//.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/crios/.test(ua)) browser = 'Chrome iOS';
  else if (/fxios/.test(ua)) browser = 'Firefox iOS';
  else if (/firefox\//.test(ua)) browser = 'Firefox';
  else if (/chrome\//.test(ua) && !/edg\//.test(ua)) browser = 'Chrome';
  else if (/safari\//.test(ua) && !/chrome\//.test(ua)) browser = 'Safari';

  return `${platform} · ${browser}`;
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error(
      'Este navegador não oferece suporte a Service Worker para notificações Push.',
    );
  }

  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) {
    reg = await navigator.serviceWorker.getRegistration();
  }

  const readyReg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 6000)),
  ]);

  if (readyReg) return readyReg;
  if (reg) return reg;

  throw new Error(
    'O Service Worker do MGW Gestão ainda não está ativo. Recarregue a página e tente novamente.',
  );
}

async function ensureSubscription(): Promise<{
  subscription: PushSubscription;
  replacedEndpoint: string | null;
}> {
  if (needsIOSHomeScreenForWebPush()) {
    throw new Error(
      'No iPhone/iPad, adicione o MGW Gestão à Tela de Início pelo menu Compartilhar do Safari antes de ativar as notificações.',
    );
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error(
      'Este navegador não oferece suporte a notificações Push. Instale o MGW Gestão como aplicativo e tente novamente.',
    );
  }

  const registration = await getReadyServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  let replacedEndpoint: string | null = null;

  if (subscription) {
    const currentKey = subscription.options.applicationServerKey;
    const expectedKey = decodeBase64Url(VAPID_PUBLIC_KEY);
    const currentBytes = currentKey
      ? new Uint8Array(currentKey)
      : new Uint8Array();
    const keyMatches =
      currentBytes.length === expectedKey.length &&
      currentBytes.every((value, index) => value === expectedKey[index]);

    if (!keyMatches) {
      replacedEndpoint = subscription.endpoint;
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

  return { subscription, replacedEndpoint };
}

export async function getCurrentBrowserPushEndpoint(): Promise<string | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return null;
  }
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2000)),
    ]);
    if (!registration) return null;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function registerOrderPushSubscription(input: {
  tenantId: string;
  userId: string;
}): Promise<{ endpoint: string }> {
  const { subscription, replacedEndpoint } = await ensureSubscription();
  const data = subscription.toJSON();
  if (!subscription.endpoint || !data.keys?.p256dh || !data.keys.auth) {
    throw new Error(
      'O navegador não retornou os dados completos da assinatura Push.',
    );
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('tenant_push_subscriptions')
    .upsert(
      {
        tenant_id: input.tenantId,
        user_id: input.userId,
        endpoint: subscription.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        is_enabled: true,
        user_agent: navigator.userAgent.slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,user_id,endpoint' },
    );

  if (error) throw new Error(error.message);

  // Remove ONLY the replaced endpoint from THIS browser if its VAPID key changed.
  // Never delete other endpoints of the same user so multiple devices (phone + PC) stay active!
  if (replacedEndpoint && replacedEndpoint !== subscription.endpoint) {
    await supabase
      .from('tenant_push_subscriptions')
      .delete()
      .eq('tenant_id', input.tenantId)
      .eq('user_id', input.userId)
      .eq('endpoint', replacedEndpoint);
  }

  return { endpoint: subscription.endpoint };
}

export async function handlePushSubscriptionRotated(input: {
  tenantId: string;
  userId: string;
  oldEndpoint?: string | null;
}): Promise<void> {
  if (getBrowserNotificationPermission() !== 'granted') return;
  const { endpoint } = await registerOrderPushSubscription({
    tenantId: input.tenantId,
    userId: input.userId,
  });

  if (input.oldEndpoint && input.oldEndpoint !== endpoint) {
    await getSupabaseClient()
      .from('tenant_push_subscriptions')
      .delete()
      .eq('tenant_id', input.tenantId)
      .eq('user_id', input.userId)
      .eq('endpoint', input.oldEndpoint);
  }
}

export async function syncExistingOrderPushSubscription(input: {
  tenantId: string;
  userId: string;
  localPausedPreference?: boolean;
}): Promise<{ synced: boolean; enabled: boolean }> {
  if (
    typeof window === 'undefined' ||
    !isSupabaseConfigured() ||
    getBrowserNotificationPermission() !== 'granted' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return { synced: false, enabled: false };
  }

  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
    ]);
    if (!registration) return { synced: false, enabled: false };

    const existingSub = await registration.pushManager.getSubscription();
    const supabase = getSupabaseClient();

    if (existingSub) {
      const { data: dbRow } = await supabase
        .from('tenant_push_subscriptions')
        .select('id,is_enabled')
        .eq('tenant_id', input.tenantId)
        .eq('user_id', input.userId)
        .eq('endpoint', existingSub.endpoint)
        .maybeSingle<{ id: string; is_enabled: boolean }>();

      if (dbRow && dbRow.is_enabled === false) {
        return { synced: true, enabled: false };
      }
      if (!dbRow && input.localPausedPreference) {
        return { synced: false, enabled: false };
      }

      await registerOrderPushSubscription({
        tenantId: input.tenantId,
        userId: input.userId,
      });
      return { synced: true, enabled: true };
    }

    // Se o usuário já havia habilitado anteriormente neste dispositivo, tenta restaurar assinatura sem prompt
    if (!input.localPausedPreference) {
      await registerOrderPushSubscription({
        tenantId: input.tenantId,
        userId: input.userId,
      });
      return { synced: true, enabled: true };
    }

    return { synced: false, enabled: false };
  } catch {
    return { synced: false, enabled: false };
  }
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

  const registration = await getReadyServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  const { error } = await getSupabaseClient()
    .from('tenant_push_subscriptions')
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', input.tenantId)
    .eq('user_id', input.userId)
    .eq('endpoint', subscription.endpoint);

  if (error) throw new Error(error.message);
}

export async function fetchRegisteredPushDevices(
  tenantId: string,
  userId: string,
  currentEndpoint: string | null,
): Promise<RegisteredPushDevice[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.rpc('get_tenant_push_devices', {
      p_tenant_id: tenantId,
    });

    if (!error && Array.isArray(data)) {
      return (
        data as Array<{
          id: string;
          user_id: string;
          member_email: string;
          member_role: string;
          user_agent: string;
          is_enabled: boolean;
          updated_at: string;
          is_current_user: boolean;
        }>
      ).map((row) => ({
        id: row.id,
        userId: row.user_id,
        memberEmail: row.member_email || '',
        memberRole: row.member_role || 'manager',
        deviceLabel: describePushDeviceUserAgent(row.user_agent),
        userAgent: row.user_agent || '',
        isEnabled: Boolean(row.is_enabled),
        updatedAt: row.updated_at,
        isCurrentUser: Boolean(row.is_current_user),
      }));
    }
  } catch {
    // Fallback para leitura das proprias assinaturas caso migration ainda nao aplicada
  }

  const { data: ownRows, error: ownError } = await supabase
    .from('tenant_push_subscriptions')
    .select('id,user_id,endpoint,user_agent,is_enabled,updated_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (ownError || !ownRows) return [];

  return (
    ownRows as Array<{
      id: string;
      user_id: string;
      endpoint: string;
      user_agent: string;
      is_enabled: boolean;
      updated_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    userId: row.user_id,
    memberEmail: '',
    memberRole: '',
    deviceLabel: describePushDeviceUserAgent(row.user_agent),
    userAgent: row.user_agent || '',
    isEnabled: Boolean(row.is_enabled),
    updatedAt: row.updated_at,
    isCurrentUser: true,
    isCurrentDevice: Boolean(currentEndpoint && row.endpoint === currentEndpoint),
  }));
}

export async function removeRegisteredPushDevice(input: {
  tenantId: string;
  userId: string;
  subscriptionId: string;
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('tenant_push_subscriptions')
    .delete()
    .eq('id', input.subscriptionId)
    .eq('tenant_id', input.tenantId)
    .eq('user_id', input.userId);
  if (error) throw new Error(error.message);
}

async function callSendOrderPushFunction(payload: {
  action: 'diagnose' | 'test';
  tenantId: string;
  currentEndpoint: string | null;
}): Promise<{
  ok: boolean;
  sent?: number;
  expired?: number;
  failed?: number;
  lastError?: string | null;
  error?: string;
  diagnostics?: Omit<OrderPushBackendDiagnostics, 'available' | 'error'>;
}> {
  const configStatus = getSupabaseConfigStatus();
  if (!configStatus.configured || !configStatus.url) {
    return {
      ok: false,
      error: 'Supabase não configurado neste ambiente.',
    };
  }

  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      ok: false,
      error: 'Sessão de usuário não encontrada para consultar o servidor.',
    };
  }

  const functionUrl = `${configStatus.url.replace(/\/+$/, '')}/functions/v1/send-order-push`;
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: payload.action,
      tenantId: payload.tenantId,
      expectedVapidPublicKey: VAPID_PUBLIC_KEY,
      currentEndpoint: payload.currentEndpoint,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    sent?: number;
    expired?: number;
    failed?: number;
    lastError?: string | null;
    error?: string;
    diagnostics?: Omit<OrderPushBackendDiagnostics, 'available' | 'error'>;
  };

  return {
    ok: response.ok && body.ok !== false,
    sent: body.sent,
    expired: body.expired,
    failed: body.failed,
    lastError: body.lastError,
    error: body.error,
    diagnostics: body.diagnostics,
  };
}

export async function inspectOrderPushDiagnostics(input: {
  tenantId: string;
  userId: string;
}): Promise<OrderPushDiagnosticsSnapshot> {
  const permission = getBrowserNotificationPermission();
  const swHealth = await getServiceWorkerHealth();
  const currentEndpoint = await getCurrentBrowserPushEndpoint();
  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const needsIOSHomeScreenInstall = needsIOSHomeScreenForWebPush();

  const devices = await fetchRegisteredPushDevices(
    input.tenantId,
    input.userId,
    currentEndpoint,
  );

  let backend: OrderPushBackendDiagnostics | null = null;
  let recentLogs: OrderPushDeliveryLogEntry[] = [];

  if (isSupabaseConfigured()) {
    try {
      const diagResult = await callSendOrderPushFunction({
        action: 'diagnose',
        tenantId: input.tenantId,
        currentEndpoint,
      });

      if (diagResult.diagnostics) {
        backend = {
          available: true,
          ...diagResult.diagnostics,
          error: diagResult.error,
        };
      } else {
        backend = {
          available: false,
          hasWebhookSecret: false,
          hasVapidPublicKey: false,
          hasVapidPrivateKey: false,
          vapidKeyMatchesFrontend: null,
          activeSubscriptionsCount: 0,
          currentEndpointRegistered: false,
          error:
            diagResult.error ||
            'Edge Function send-order-push ainda não está atualizada para diagnóstico.',
        };
      }
    } catch (err) {
      backend = {
        available: false,
        hasWebhookSecret: false,
        hasVapidPublicKey: false,
        hasVapidPrivateKey: false,
        vapidKeyMatchesFrontend: null,
        activeSubscriptionsCount: 0,
        currentEndpointRegistered: false,
        error:
          err instanceof Error
            ? err.message
            : 'Não foi possível consultar o serviço Web Push.',
      };
    }

    try {
      const { data: logsData, error: logsError } = await getSupabaseClient()
        .from('order_push_delivery_logs')
        .select(
          'id,order_id,event_type,status,http_status,sent_count,expired_count,failed_count,error_message,created_at',
        )
        .eq('tenant_id', input.tenantId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!logsError && Array.isArray(logsData)) {
        recentLogs = (
          logsData as Array<{
            id: string;
            order_id: string | null;
            event_type: string;
            status: string;
            http_status: number | null;
            sent_count: number;
            expired_count: number;
            failed_count: number;
            error_message: string;
            created_at: string;
          }>
        ).map((row) => ({
          id: row.id,
          orderId: row.order_id,
          eventType: row.event_type,
          status: row.status,
          httpStatus: row.http_status,
          sentCount: row.sent_count,
          expiredCount: row.expired_count,
          failedCount: row.failed_count,
          errorMessage: row.error_message,
          createdAt: row.created_at,
        }));
      }
    } catch {
      // Tabela opcional antes da migration
    }
  }

  return {
    permission,
    serviceWorkerStatus: swHealth.status,
    serviceWorkerScope: swHealth.scope,
    pushSupported,
    needsIOSHomeScreenInstall,
    hasBrowserSubscription: Boolean(currentEndpoint),
    currentEndpoint,
    devices,
    backend,
    recentLogs,
  };
}

export async function sendBackendOrderPushTest(input: {
  tenantId: string;
  userId: string;
}): Promise<{
  ok: boolean;
  sent: number;
  expired: number;
  failed: number;
  message: string;
}> {
  await registerOrderPushSubscription({
    tenantId: input.tenantId,
    userId: input.userId,
  });

  const currentEndpoint = await getCurrentBrowserPushEndpoint();
  const result = await callSendOrderPushFunction({
    action: 'test',
    tenantId: input.tenantId,
    currentEndpoint,
  });

  if (result.ok && (result.sent ?? 0) > 0) {
    return {
      ok: true,
      sent: result.sent ?? 1,
      expired: result.expired ?? 0,
      failed: result.failed ?? 0,
      message:
        'Notificação Web Push real enviada pelo servidor! Verifique o alerta no sistema operacional.',
    };
  }

  return {
    ok: false,
    sent: result.sent ?? 0,
    expired: result.expired ?? 0,
    failed: result.failed ?? 0,
    message:
      result.error ||
      result.lastError ||
      'O servidor não conseguiu concluir o envio Push de teste.',
  };
}
