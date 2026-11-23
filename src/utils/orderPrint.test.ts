import test from 'node:test';
import assert from 'node:assert/strict';
import type { OnlineOrderRecord } from '../types/finance';
import {
  buildPrintableOrderDocument,
  fromOnlineOrderRecord,
  getPrintPageCss,
} from './orderPrint';

const SAMPLE_DELIVERY_ORDER: OnlineOrderRecord = {
  id: 'ord_1',
  tenantId: 'mgw_lanches',
  orderNumber: 7,
  orderCode: '#0007',
  tokenHash: 'hash_7',
  status: 'accepted',
  customerName: 'Lucas Almeida',
  customerPhone: '(92) 99123-4567',
  fulfillmentType: 'delivery',
  deliveryAddress: 'Rua Amazonas, 210 - Centro',
  deliveryReference: 'Portão preto',
  paymentMethod: 'Dinheiro',
  changeFor: 100,
  subtotalAmount: 48,
  deliveryFee: 5,
  totalAmount: 53,
  customerNote: 'Entregar na portaria',
  rejectionReason: '',
  viewedAtMs: 1794920000000,
  acceptedAtMs: 1794920100000,
  preparingAtMs: null,
  readyAtMs: null,
  dispatchedAtMs: null,
  completedAtMs: null,
  cancelledAtMs: null,
  saleId: null,
  createdAtMs: 1794920000000,
  updatedAtMs: 1794920100000,
  items: [
    {
      id: 'item_1',
      itemKind: 'combo',
      refId: 'combo_1',
      itemName: 'COMBO 1',
      quantity: 2,
      unitPrice: 24,
      lineTotal: 48,
      selectedAddons: [],
      estimatedUnitCost: 11,
      xSaladasPerUnit: 1,
      components: [],
      itemNote: 'Sem cebola',
    },
  ],
  statusHistory: [],
};

test('buildPrintableOrderDocument formats delivery receipt with Dinheiro change calculation', () => {
  const source = fromOnlineOrderRecord(SAMPLE_DELIVERY_ORDER, {
    storeName: 'MGW Lanches',
    storePhone: '92999990000',
    storeAddress: 'Av. Principal, 100',
  });
  const doc = buildPrintableOrderDocument(source, 'complete');

  assert.equal(doc.orderNumberFormatted, '#0007');
  assert.equal(doc.fulfillmentLabel, 'ENTREGA');
  assert.equal(doc.showPrices, true);
  assert.equal(doc.deliveryAddress, 'Rua Amazonas, 210 - Centro');
  assert.equal(doc.deliveryReference, 'Portão preto');
  assert.equal(doc.lines[0].note, 'Sem cebola');
  assert.equal(doc.customerNote, 'Entregar na portaria');
  assert.ok(doc.totalFormatted.includes('53,00'));
  assert.ok(doc.changeForFormatted?.includes('100,00'));
  assert.ok(doc.changeReturnFormatted?.includes('47,00'));
});

test('buildPrintableOrderDocument hides prices in kitchen mode and omits delivery details on pickup', () => {
  const pickupOrder: OnlineOrderRecord = {
    ...SAMPLE_DELIVERY_ORDER,
    fulfillmentType: 'pickup',
    deliveryFee: 0,
    totalAmount: 48,
    paymentMethod: 'Pix',
    changeFor: null,
  };
  const source = fromOnlineOrderRecord(pickupOrder, { storeName: 'MGW Lanches' });
  const kitchenDoc = buildPrintableOrderDocument(source, 'kitchen');

  assert.equal(kitchenDoc.modeLabel, 'VIA COZINHA');
  assert.equal(kitchenDoc.showPrices, false);
  assert.equal(kitchenDoc.fulfillmentLabel, 'RETIRADA NO BALCÃO');
  assert.equal(kitchenDoc.deliveryAddress, '');
  assert.equal(kitchenDoc.deliveryFeeFormatted, 'Grátis');
  assert.equal(kitchenDoc.changeForFormatted, null);
  assert.equal(kitchenDoc.lines[0].quantity, 2);
  assert.equal(kitchenDoc.lines[0].note, 'Sem cebola');
});

test('getPrintPageCss emits accurate @page sizes for 58mm, 80mm, and A4', () => {
  assert.ok(getPrintPageCss('58mm').includes('58mm auto'));
  assert.ok(getPrintPageCss('80mm').includes('80mm auto'));
  assert.ok(getPrintPageCss('a4').includes('A4 portrait'));
});
