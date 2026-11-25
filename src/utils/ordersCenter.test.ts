import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrdersCenterView } from '../components/OrdersCenterView.tsx';
import type {
  DigitalMenuSettings,
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance.ts';
import { getLocalTodayDate } from './finance.ts';
import { DEFAULT_DIGITAL_MENU_SETTINGS } from './onlineOrders.ts';
import {
  computeOrdersCenterSummary,
  filterAndSearchOrders,
  getOrderStatusBadgeSpec,
  paginateOrders,
  summarizeOrderItems,
} from './ordersCenter.ts';

const baseMenuSettings: DigitalMenuSettings = {
  tenantId: 'tenant-1',
  ...DEFAULT_DIGITAL_MENU_SETTINGS,
  slug: 'lanchonete-mgw',
  storeName: 'MGW Lanches',
  isActive: true,
  isOpen: true,
};

function makeOrder(
  id: string,
  orderNumber: number,
  status: OnlineOrderStatus,
  overrides: Partial<OnlineOrderRecord> = {},
): OnlineOrderRecord {
  const now = Date.now();
  return {
    id,
    tenantId: 'tenant-1',
    orderNumber,
    orderCode: `MGW-${orderNumber}`,
    tokenHash: `hash-${id}`,
    status,
    fulfillmentType: 'delivery',
    customerName: `Cliente ${orderNumber}`,
    customerPhone: '(92) 99999-0000',
    deliveryAddress: 'Rua Principal, 100',
    deliveryReference: '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: 50,
    deliveryFee: 5,
    totalAmount: 55,
    rejectionReason: '',
    viewedAtMs: status === 'received' ? null : now,
    acceptedAtMs: null,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs: status === 'completed' ? now : null,
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: now,
    updatedAtMs: now,
    items: [
      {
        id: `${id}-item-1`,
        itemKind: 'product',
        refId: 'prod-1',
        itemName: 'X-Salada Artesanal',
        quantity: 2,
        unitPrice: 25,
        lineTotal: 50,
        estimatedUnitCost: 10,
        xSaladasPerUnit: 1,
        selectedAddons: [],
        components: [],
        itemNote: '',
      },
    ],
    statusHistory: [],
    ...overrides,
  };
}

test('computeOrdersCenterSummary computes exclusive status counts without double-counting and handles yesterday delta honestly', () => {
  const today = getLocalTodayDate();
  const todayNoonMs = new Date(`${today}T12:00:00`).getTime();
  const yesterdayNoonMs = todayNoonMs - 24 * 60 * 60 * 1000;

  const orders: OnlineOrderRecord[] = [
    makeOrder('o1', 1001, 'received', { createdAtMs: todayNoonMs, viewedAtMs: null }),
    makeOrder('o2', 1002, 'accepted', { createdAtMs: todayNoonMs }),
    makeOrder('o3', 1003, 'preparing', { createdAtMs: todayNoonMs }),
    makeOrder('o4', 1004, 'preparing', { createdAtMs: todayNoonMs }),
    makeOrder('o5', 1005, 'ready', { createdAtMs: todayNoonMs }),
    makeOrder('o6', 1006, 'out_for_delivery', { createdAtMs: todayNoonMs }),
    makeOrder('o7', 1007, 'completed', { createdAtMs: yesterdayNoonMs, completedAtMs: yesterdayNoonMs }),
    makeOrder('o8', 1008, 'completed', { createdAtMs: yesterdayNoonMs, completedAtMs: yesterdayNoonMs }),
    makeOrder('o9', 1009, 'cancelled', { createdAtMs: yesterdayNoonMs }),
  ];

  const summary = computeOrdersCenterSummary(orders, today);

  assert.equal(summary.totalCount, 9);
  assert.equal(summary.receivedTodayCount, 6);
  assert.equal(summary.receivedYesterdayCount, 3);
  assert.equal(summary.todayDeltaPct, 100);
  assert.equal(summary.unviewedCount, 1);
  assert.equal(summary.receivedCount, 1);
  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.preparingCount, 2);
  assert.equal(summary.pendingBeforePrepCount, 2);
  assert.equal(summary.readyCount, 1);
  assert.equal(summary.dispatchCount, 1);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.completedTodayCount, 0);
  assert.equal(summary.closedCount, 1);

  // Check zero double counting across all status buckets
  const bucketSum =
    summary.receivedCount +
    summary.acceptedCount +
    summary.preparingCount +
    summary.readyCount +
    summary.dispatchCount +
    summary.completedCount +
    summary.closedCount;
  assert.equal(bucketSum, orders.length);

  // Without yesterday orders, delta must be null (never fabricated)
  const onlyTodaySummary = computeOrdersCenterSummary(
    [makeOrder('t1', 1, 'preparing', { createdAtMs: todayNoonMs })],
    today,
  );
  assert.equal(onlyTodaySummary.todayDeltaPct, null);
});

test('filterAndSearchOrders filters by primary tabs, secondary tabs, and search query', () => {
  const orders: OnlineOrderRecord[] = [
    makeOrder('o1', 1047, 'preparing', { customerName: 'Cliente VIP' }),
    makeOrder('o2', 1046, 'ready', { customerName: 'Maria Silva' }),
    makeOrder('o3', 1045, 'completed', { customerName: 'João Santos' }),
    makeOrder('o4', 1044, 'received', { customerName: 'Ana Costa', viewedAtMs: null }),
    makeOrder('o5', 1043, 'out_for_delivery', { customerName: 'Pedro Souza' }),
    makeOrder('o6', 1042, 'rejected', { customerName: 'Lucas Lima' }),
  ];

  assert.equal(filterAndSearchOrders(orders, 'all', '').length, 6);
  assert.equal(filterAndSearchOrders(orders, 'preparing', '').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'ready', '').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'completed', '').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'received', '').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'dispatch', '').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'closed', '').length, 1);

  assert.equal(filterAndSearchOrders(orders, 'all', 'maria').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'all', '#1047').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'all', '1044').length, 1);
  assert.equal(filterAndSearchOrders(orders, 'preparing', 'maria').length, 0);
});

test('summarizeOrderItems, paginateOrders, and getOrderStatusBadgeSpec format domain details cleanly', () => {
  const oneItemOrder = makeOrder('o1', 1, 'ready', {
    items: [
      {
        id: 'i1',
        itemKind: 'product',
        refId: 'p1',
        itemName: 'Refrigerante Lata',
        quantity: 1,
        unitPrice: 6,
        lineTotal: 6,
        estimatedUnitCost: 3,
        xSaladasPerUnit: 0,
        selectedAddons: [],
        components: [],
        itemNote: '',
      },
    ],
  });
  const summary = summarizeOrderItems(oneItemOrder);
  assert.equal(summary.totalUnits, 1);
  assert.equal(summary.countLabel, '1 item');
  assert.equal(summary.previewText, '1x Refrigerante Lata');

  const manyOrders = Array.from({ length: 20 }, (_, i) =>
    makeOrder(`m-${i}`, i + 1, 'preparing'),
  );
  const page2 = paginateOrders(manyOrders, 2, 15);
  assert.equal(page2.safePage, 2);
  assert.equal(page2.totalPages, 2);
  assert.equal(page2.items.length, 5);
  assert.equal(page2.startIndex, 15);
  assert.equal(page2.endIndex, 20);

  assert.equal(getOrderStatusBadgeSpec('preparing').variant, 'orange');
  assert.equal(getOrderStatusBadgeSpec('ready').variant, 'green');
  assert.equal(getOrderStatusBadgeSpec('completed').variant, 'blue');
  assert.equal(getOrderStatusBadgeSpec('rejected').variant, 'danger');
});

test('OrdersCenterView renders loading skeleton, empty state, error state, and populated reference UI faithfully', () => {
  const baseProps = {
    orders: [] as OnlineOrderRecord[],
    couriers: [],
    dispatches: [],
    onAssignCourier: async () => {},
    digitalMenuSettings: baseMenuSettings,
    soundEnabled: true,
    pushEnabled: false,
    notificationPermission: 'default' as const,
    onRefreshOrders: async () => {},
    onOpenNewOrder: () => {},
    onToggleSound: () => {},
    onTogglePush: () => {},
    onEnableMobileNotifications: () => {},
    onTestAlert: () => {},
    onMarkViewed: async () => {},
    onTransitionStatus: async () => {},
    onOpenDigitalMenuSettings: () => {},
  };

  const loadingHtml = renderToStaticMarkup(
    createElement(OrdersCenterView, { ...baseProps, isLoading: true }),
  );
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Carregando Central de Pedidos/);

  const emptyHtml = renderToStaticMarkup(
    createElement(OrdersCenterView, baseProps),
  );
  assert.match(emptyHtml, /Central de Pedidos/);
  assert.match(emptyHtml, /Nenhum pedido encontrado\./);
  assert.match(emptyHtml, /Atualizar/);
  assert.match(emptyHtml, /Novo Pedido/);

  const errorHtml = renderToStaticMarkup(
    createElement(OrdersCenterView, {
      ...baseProps,
      errorMessage: 'Falha de conexão temporária',
    }),
  );
  assert.match(errorHtml, /Falha de conexão temporária/);
  assert.match(errorHtml, /Tentar novamente/);

  const populatedOrders = [
    makeOrder('o1', 1047, 'preparing', { customerName: 'Cliente VIP', totalAmount: 52.9 }),
    makeOrder('o2', 1046, 'ready', { customerName: 'Maria Silva', totalAmount: 68.5 }),
    makeOrder('o3', 1045, 'completed', { customerName: 'João Santos', totalAmount: 24.9 }),
    makeOrder('o4', 1044, 'received', { customerName: 'Ana Costa', totalAmount: 47.8, viewedAtMs: null }),
  ];

  const populatedHtml = renderToStaticMarkup(
    createElement(OrdersCenterView, {
      ...baseProps,
      orders: populatedOrders,
    }),
  );

  assert.match(populatedHtml, /Pedidos Hoje/);
  assert.match(populatedHtml, /Em Preparo/);
  assert.match(populatedHtml, /Prontos/);
  assert.match(populatedHtml, /Entregues/);
  assert.match(populatedHtml, /Todos/);
  assert.match(populatedHtml, /Novos/);
  assert.match(populatedHtml, /Aceitos/);
  assert.match(populatedHtml, /Entrega \/ Retirada/);
  assert.match(populatedHtml, /Recusados \/ Cancelados/);
  assert.match(populatedHtml, /#1047/);
  assert.match(populatedHtml, /Cliente VIP/);
  assert.match(populatedHtml, /Maria Silva/);
  assert.match(populatedHtml, /Novo pedido recebido aguardando visualização!/);
});
