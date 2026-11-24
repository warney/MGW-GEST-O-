import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrdersCenterView } from '../components/OrdersCenterView.tsx';
import type { DigitalMenuSettings, OnlineOrderRecord } from '../types/finance';
import { DEFAULT_DIGITAL_MENU_SETTINGS } from './onlineOrders.ts';
import {
  BASE_APP_TITLE,
  buildNewOrderNotificationContent,
  formatPendingOrdersDocumentTitle,
  resolveInitialRouteFromSearch,
} from './orderNotifications';
import {
  filterUnalertedOrderIds,
  hasOrderSoundAlerted,
  markOrdersSoundAlerted,
  resetOrderSoundDeduplicationForTests,
} from './soundAlert';
import {
  describePushDeviceUserAgent,
  getFrontendVapidPublicKey,
  type OrderPushDiagnosticsSnapshot,
} from '../services/orderPushNotifications';

function makeOrder(num: number, name: string, total: number): OnlineOrderRecord {
  return {
    id: `ord_${num}`,
    tenantId: 'mgw_lanches',
    orderNumber: num,
    orderCode: `#${String(num).padStart(4, '0')}`,
    tokenHash: `hash_${num}`,
    status: 'received',
    fulfillmentType: num % 2 === 0 ? 'pickup' : 'delivery',
    customerName: name,
    customerPhone: '92999990000',
    deliveryAddress: num % 2 === 0 ? '' : 'Rua Principal, 10',
    deliveryReference: '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: total,
    deliveryFee: 0,
    totalAmount: total,
    rejectionReason: '',
    viewedAtMs: null,
    acceptedAtMs: null,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs: null,
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: 1794920000000,
    updatedAtMs: 1794920000000,
    items: [
      {
        id: 'item_1',
        itemKind: 'combo',
        refId: 'combo_1',
        itemName: 'COMBO 1',
        quantity: 1,
        unitPrice: total,
        lineTotal: total,
        selectedAddons: [],
        estimatedUnitCost: 11,
        xSaladasPerUnit: 1,
        components: [],
        itemNote: '',
      },
    ],
    statusHistory: [],
  };
}

test('buildNewOrderNotificationContent formats single order with customer, fulfillment, total, and items', () => {
  const deliveryPayload = buildNewOrderNotificationContent(
    [makeOrder(3, 'João Pedro', 53)],
    'MGW Lanches',
  );
  assert.ok(deliveryPayload);
  assert.equal(deliveryPayload.title, 'Novo Pedido #0003 — MGW Lanches');
  assert.ok(deliveryPayload.body.includes('João Pedro'));
  assert.ok(deliveryPayload.body.includes('Entrega'));
  assert.ok(deliveryPayload.body.includes('53,00'));
  assert.ok(deliveryPayload.body.includes('1x COMBO 1'));
  assert.equal(deliveryPayload.tag, 'mgw-order-ord_3');

  const pickupPayload = buildNewOrderNotificationContent(
    [makeOrder(4, 'Ana Paula', 28)],
    'MGW Lanches',
  );
  assert.ok(pickupPayload);
  assert.ok(pickupPayload.body.includes('Retirada'));
});

test('buildNewOrderNotificationContent summarizes batch orders cleanly', () => {
  const payload = buildNewOrderNotificationContent(
    [makeOrder(1, 'Maria', 26), makeOrder(2, 'Carlos', 31)],
    'MGW Lanches',
  );
  assert.ok(payload);
  assert.equal(payload.title, '2 novos pedidos — MGW Lanches');
  assert.ok(payload.body.includes('#0001, #0002'));
  assert.ok(payload.body.includes('57,00'));
});

test('formatPendingOrdersDocumentTitle highlights pending count and restores base title at 0', () => {
  assert.equal(formatPendingOrdersDocumentTitle(0), BASE_APP_TITLE);
  assert.equal(formatPendingOrdersDocumentTitle(1), '(1) Novo Pedido! · MGW GESTÃO');
  assert.equal(formatPendingOrdersDocumentTitle(3), '(3) Novos Pedidos! · MGW GESTÃO');
});

test('resolveInitialRouteFromSearch opens orders view when ?view=orders is present', () => {
  assert.equal(resolveInitialRouteFromSearch('?view=orders'), 'orders');
  assert.equal(resolveInitialRouteFromSearch('?demo=1&view=orders'), 'orders');
  assert.equal(resolveInitialRouteFromSearch('?demo=1'), 'dashboard');
});

test('Sound alert deduplication plays only once per order ID and ignores repeated refreshes', () => {
  resetOrderSoundDeduplicationForTests();
  assert.deepEqual(filterUnalertedOrderIds(['ord_10', 'ord_11']), ['ord_10', 'ord_11']);
  assert.equal(hasOrderSoundAlerted('ord_10'), false);

  markOrdersSoundAlerted(['ord_10']);
  assert.equal(hasOrderSoundAlerted('ord_10'), true);
  assert.deepEqual(filterUnalertedOrderIds(['ord_10', 'ord_11']), ['ord_11']);

  markOrdersSoundAlerted(['ord_10', 'ord_11']);
  assert.deepEqual(filterUnalertedOrderIds(['ord_10', 'ord_11']), []);
  resetOrderSoundDeduplicationForTests();
});

test('describePushDeviceUserAgent labels mobile and desktop platforms cleanly', () => {
  assert.equal(
    describePushDeviceUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36',
    ),
    'Celular Android · Chrome',
  );
  assert.equal(
    describePushDeviceUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    ),
    'iPhone · Safari',
  );
  assert.equal(
    describePushDeviceUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
    ),
    'Computador Windows · Edge',
  );
  assert.equal(
    describePushDeviceUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    ),
    'Mac (macOS) · Safari',
  );
});

test('Web Push infrastructure preserves multi-device endpoints, SW always shows push notifications, and custom WAV exists', () => {
  // 1. Chave VAPID pública possui 65 bytes (P-256 não comprimido)
  const vapidKey = getFrontendVapidPublicKey();
  const base64 = vapidKey.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  assert.equal(Buffer.from(padded, 'base64').length, 65);

  // 2. orderPushNotifications.ts nunca apaga outros dispositivos do mesmo usuário (.neq('endpoint', ...) removido)
  const pushServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/orderPushNotifications.ts'),
    'utf8',
  );
  assert.doesNotMatch(pushServiceSource, /\.neq\(\s*'endpoint'/);

  // 3. sw-notifications.js sempre chama showNotification() no push (sem suprimir quando aba visível) e escuta pushsubscriptionchange
  const swSource = fs.readFileSync(
    path.resolve(process.cwd(), 'public/sw-notifications.js'),
    'utf8',
  );
  assert.doesNotMatch(swSource, /if\s*\(hasVisibleAdmin\)\s*return/);
  assert.match(swSource, /self\.registration\.showNotification/);
  assert.match(swSource, /pushsubscriptionchange/);
  assert.match(swSource, /isPublicOrAuthPath/);

  // 4. send-order-push valida tenant_members autorizados, TTL 3600, deduplicação e teste autenticado sem vazar segredos
  const edgeFnSource = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/send-order-push/index.ts'),
    'utf8',
  );
  assert.match(edgeFnSource, /TTL:\s*3600/);
  assert.match(edgeFnSource, /tenant_members/);
  assert.match(edgeFnSource, /order_push_delivery_logs/);
  assert.match(edgeFnSource, /action === 'test'/);

  // 5. Arquivo WAV original do MGW Gestão existe e possui cabeçalho RIFF/WAVE válido
  const wavBuffer = fs.readFileSync(
    path.resolve(process.cwd(), 'public/sounds/mgw-new-order.wav'),
  );
  assert.ok(wavBuffer.length > 44);
  assert.equal(wavBuffer.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBuffer.subarray(8, 12).toString('ascii'), 'WAVE');
});

test('OrdersCenterView renders Push notification controls, iOS PWA hint, denied banner, and backend config warning cleanly', () => {
  const settings: DigitalMenuSettings = {
    tenantId: 'mgw_lanches',
    ...DEFAULT_DIGITAL_MENU_SETTINGS,
    slug: 'mgw-lanches',
    storeName: 'MGW Lanches',
    isActive: true,
    isOpen: true,
  };

  const diagnostics: OrderPushDiagnosticsSnapshot = {
    permission: 'granted',
    pushSupported: true,
    needsIOSHomeScreenInstall: true,
    serviceWorkerStatus: 'active',
    serviceWorkerScope: 'https://mgwgestao.com.br/',
    hasBrowserSubscription: true,
    currentEndpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
    devices: [
      {
        id: 'sub-1',
        userId: 'user-1',
        memberEmail: 'dono@mgwlanches.com',
        memberRole: 'owner',
        userAgent: 'Android Chrome',
        deviceLabel: 'Celular Android · Chrome',
        isEnabled: true,
        isCurrentUser: true,
        isCurrentDevice: true,
        updatedAt: '2026-11-24T10:00:00.000Z',
      },
    ],
    backend: {
      available: true,
      hasWebhookSecret: true,
      hasVapidPublicKey: false,
      hasVapidPrivateKey: true,
      vapidKeyMatchesFrontend: false,
      activeSubscriptionsCount: 1,
      currentEndpointRegistered: true,
    },
    recentLogs: [],
  };

  const grantedHtml = renderToStaticMarkup(
    createElement(OrdersCenterView, {
      orders: [makeOrder(5, 'Cliente Teste', 42)],
      digitalMenuSettings: settings,
      soundEnabled: true,
      pushEnabled: true,
      notificationPermission: 'granted',
      pushDiagnostics: diagnostics,
      onToggleSound: () => {},
      onTogglePush: () => {},
      onEnableMobileNotifications: () => {},
      onTestAlert: () => {},
      onMarkViewed: async () => {},
      onTransitionStatus: async () => {},
      onOpenDigitalMenuSettings: () => {},
    }),
  );

  assert.match(grantedHtml, /Notificações Push ativas/);
  assert.match(grantedHtml, /Testar Push/);
  assert.match(grantedHtml, /Dispositivos \(1\)/);
  assert.match(grantedHtml, /Tela de Início \(iOS 16\.4\+\)/);
  assert.match(grantedHtml, /Configuração pendente no servidor Supabase para Web Push em segundo plano/);

  const deniedHtml = renderToStaticMarkup(
    createElement(OrdersCenterView, {
      orders: [],
      digitalMenuSettings: settings,
      soundEnabled: false,
      pushEnabled: false,
      notificationPermission: 'denied',
      onToggleSound: () => {},
      onTogglePush: () => {},
      onEnableMobileNotifications: () => {},
      onTestAlert: () => {},
      onMarkViewed: async () => {},
      onTransitionStatus: async () => {},
      onOpenDigitalMenuSettings: () => {},
    }),
  );

  assert.match(deniedHtml, /Ativar notificações/);
  assert.match(deniedHtml, /As notificações estão bloqueadas/);
  assert.match(deniedHtml, /Som silenciado/);
});

