import test from 'node:test';
import assert from 'node:assert/strict';
import type { OnlineOrderRecord } from '../types/finance';
import {
  BASE_APP_TITLE,
  buildNewOrderNotificationContent,
  formatPendingOrdersDocumentTitle,
  resolveInitialRouteFromSearch,
} from './orderNotifications';

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
