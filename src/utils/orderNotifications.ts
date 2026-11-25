import type { AppRoute, OnlineOrderRecord } from '../types/finance';
import { formatCurrencyBRL } from './finance';
import { formatOrderNumber } from './onlineOrders';

export const BASE_APP_TITLE = 'MGW GESTÃO — Controle Financeiro MGW Lanches';

export type BrowserNotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export type ServiceWorkerStatusState =
  | 'active'
  | 'installing'
  | 'not_registered'
  | 'unsupported';

export interface OrderSystemNotificationPayload {
  title: string;
  body: string;
  tag: string;
  orderId: string | null;
}

export function buildNewOrderNotificationContent(
  orders: OnlineOrderRecord[],
  storeName: string,
): OrderSystemNotificationPayload | null {
  if (orders.length === 0) return null;

  const cleanStore = storeName.trim() || 'MGW GESTÃO';

  if (orders.length === 1) {
    const order = orders[0];
    const itemsSummary = order.items
      .slice(0, 3)
      .map((item) => `${item.quantity}x ${item.itemName}`)
      .join(', ');
    const extraCount = order.items.length > 3 ? ` +${order.items.length - 3}` : '';
    const fulfillment =
      order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada';
    const orderCode = formatOrderNumber(order.orderNumber);

    return {
      title: `Novo Pedido ${orderCode} — ${cleanStore}`,
      body: `${order.customerName} · ${fulfillment} · ${formatCurrencyBRL(order.totalAmount)}${
        itemsSummary ? ` · ${itemsSummary}${extraCount}` : ''
      }`,
      tag: `mgw-order-${order.id}`,
      orderId: order.id,
    };
  }

  const totalSum = orders.reduce((acc, o) => acc + o.totalAmount, 0);
  const codes = orders
    .slice(0, 3)
    .map((o) => formatOrderNumber(o.orderNumber))
    .join(', ');

  return {
    title: `${orders.length} novos pedidos — ${cleanStore}`,
    body: `Pedidos ${codes} · Total ${formatCurrencyBRL(totalSum)}. Toque para confirmar.`,
    tag: 'mgw-orders-batch',
    orderId: orders[0].id,
  };
}

export function formatPendingOrdersDocumentTitle(
  unviewedCount: number,
  baseTitle: string = BASE_APP_TITLE,
): string {
  if (unviewedCount <= 0) return baseTitle;
  const label = unviewedCount === 1 ? 'Novo Pedido!' : 'Novos Pedidos!';
  return `(${unviewedCount}) ${label} · MGW GESTÃO`;
}

export function resolveInitialRouteFromSearch(search: string): AppRoute {
  try {
    const params = new URLSearchParams(search);
    const view = params.get('view');
    if (view === 'orders') {
      return 'orders';
    }
    if (view === 'dispatch') {
      return 'delivery_dispatch';
    }
    if (view === 'regions') {
      return 'delivery_regions';
    }
  } catch {
    // Ignora URLSearchParams invalido
  }
  return 'dashboard';
}

export function isIOSBrowserDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

export function isStandalonePwaSession(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneMedia = window.matchMedia?.(
    '(display-mode: standalone)',
  )?.matches;
  const navStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(standaloneMedia || navStandalone);
}

export function needsIOSHomeScreenForWebPush(): boolean {
  return isIOSBrowserDevice() && !isStandalonePwaSession();
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function getServiceWorkerHealth(): Promise<{
  status: ServiceWorkerStatusState;
  scope: string | null;
  scriptUrl: string | null;
}> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { status: 'unsupported', scope: null, scriptUrl: null };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      return { status: 'not_registered', scope: null, scriptUrl: null };
    }
    const activeWorker = registration.active;
    if (activeWorker) {
      return {
        status: 'active',
        scope: registration.scope,
        scriptUrl: activeWorker.scriptURL,
      };
    }
    if (registration.installing || registration.waiting) {
      return {
        status: 'installing',
        scope: registration.scope,
        scriptUrl:
          (registration.waiting || registration.installing)?.scriptURL ?? null,
      };
    }
    return {
      status: 'not_registered',
      scope: registration.scope,
      scriptUrl: null,
    };
  } catch {
    return { status: 'not_registered', scope: null, scriptUrl: null };
  }
}

export async function requestMobileOrderNotificationsPermission(): Promise<BrowserNotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return window.Notification.permission ?? 'default';
  }
}

export function vibrateMobileDevice(): void {
  if (typeof navigator === 'undefined') return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate([300, 120, 300, 120, 450]);
    }
  } catch {
    // Dispositivo sem suporte a vibracao
  }
}

export function updateAppUnreadBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(count).catch(() => {});
    } else if (count <= 0 && typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Ignora navegadores sem App Badging API
  }
}

export async function sendMobileSystemNotification(
  payload: OrderSystemNotificationPayload,
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string }>;
  } = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 120, 300, 120, 450],
    data: {
      url: '/?view=orders',
      orderId: payload.orderId,
    },
    actions: [{ action: 'open-orders', title: 'Ver pedido agora' }],
  };

  // No Android Chrome, desktop e PWAs instalados, a exibicao passa pelo Service Worker
  if ('serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1800)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, options);
        return true;
      }
    } catch {
      // Fallback para Notification construtor se SW falhar
    }
  }

  try {
    const n = new window.Notification(payload.title, options);
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignora erro de foco
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
