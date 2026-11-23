import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  DigitalMenuSettingsInput,
  OnlineOrderRecord,
  PublicCatalogCombo,
  PublicCatalogProduct,
  SaleRecord,
} from '../types/finance';
import {
  buildSaleInputFromCompletedOrder,
  computeCartSummary,
  computeOnlineOrdersDashboardStats,
  formatDigitalMenuSaveErrorMessage,
  formatOrderNumber,
  getNextStatusActions,
  getTrackingFlowSteps,
  normalizePixKeyInput,
  sanitizeMenuSlug,
  shouldShowOrderPixPaymentBox,
  validateCheckoutPayload,
  validateOrderStatusTransition,
} from './onlineOrders';

const menuSettings: DigitalMenuSettingsInput = {
  slug: 'mgw_lanches',
  isActive: true,
  isOpen: true,
  storeName: 'MGW Lanches',
  description: 'Lanches na chapa',
  phoneWhatsapp: '11999999999',
  address: 'Rua Principal, 100',
  openingHours: '18h às 23h',
  pixKey: '',
  deliveryFee: 5,
  minimumOrderAmount: 20,
  acceptsDelivery: true,
  acceptsPickup: true,
};

const catalogProducts: PublicCatalogProduct[] = [
  {
    id: 'p-xsalada',
    name: 'X-Salada',
    category: 'Lanche',
    unitPrice: 22,
    countsAsXSalada: true,
  },
  {
    id: 'p-refri',
    name: 'Refri 250 ml',
    category: 'Bebida',
    unitPrice: 6,
    countsAsXSalada: false,
  },
];

const catalogCombos: PublicCatalogCombo[] = [
  {
    id: 'c-combo1',
    name: 'Combo 1',
    description: '1 X-Salada + 1 Refri 250 ml',
    salePrice: 25,
    items: [
      {
        productId: 'p-xsalada',
        productName: 'X-Salada',
        quantity: 1,
        countsAsXSalada: true,
      },
      {
        productId: 'p-refri',
        productName: 'Refri 250 ml',
        quantity: 1,
        countsAsXSalada: false,
      },
    ],
  },
];

function makeOrder(
  overrides: Partial<OnlineOrderRecord> = {},
): OnlineOrderRecord {
  return {
    id: 'ord-1',
    tenantId: 'mgw_lanches',
    orderNumber: 1,
    orderCode: '#0001',
    tokenHash: 'hash-1',
    status: 'received',
    fulfillmentType: 'delivery',
    customerName: 'Maria',
    customerPhone: '11988887777',
    deliveryAddress: 'Rua das Flores, 45',
    deliveryReference: 'Portão azul',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: 'Sem cebola',
    subtotalAmount: 47,
    deliveryFee: 5,
    totalAmount: 52,
    rejectionReason: '',
    viewedAtMs: null,
    acceptedAtMs: null,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs: null,
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: new Date(2026, 10, 17, 12, 0, 0).getTime(),
    updatedAtMs: new Date(2026, 10, 17, 12, 0, 0).getTime(),
    items: [
      {
        id: 'item-1',
        itemKind: 'combo',
        refId: 'c-combo1',
        itemName: 'Combo 1',
        quantity: 1,
        unitPrice: 25,
        lineTotal: 25,
        selectedAddons: [],
        estimatedUnitCost: 12,
        xSaladasPerUnit: 1,
        components: [
          {
            productId: 'p-xsalada',
            productName: 'X-Salada',
            quantityPerUnit: 1,
            totalQuantity: 1,
            countsAsXSalada: true,
          },
          {
            productId: 'p-refri',
            productName: 'Refri 250 ml',
            quantityPerUnit: 1,
            totalQuantity: 1,
            countsAsXSalada: false,
          },
        ],
        itemNote: '',
      },
      {
        id: 'item-2',
        itemKind: 'product',
        refId: 'p-xsalada',
        itemName: 'X-Salada',
        quantity: 1,
        unitPrice: 22,
        lineTotal: 22,
        selectedAddons: [],
        estimatedUnitCost: 0,
        xSaladasPerUnit: 1,
        components: [
          {
            productId: 'p-xsalada',
            productName: 'X-Salada',
            quantityPerUnit: 1,
            totalQuantity: 1,
            countsAsXSalada: true,
          },
        ],
        itemNote: 'Sem cebola',
      },
    ],
    statusHistory: [],
    ...overrides,
  };
}

test('sanitizeMenuSlug and formatOrderNumber produce clean canonical formats', () => {
  assert.equal(sanitizeMenuSlug('MGW Lanches & Burgers!'), 'mgw-lanches-burgers');
  assert.equal(sanitizeMenuSlug('  '), 'mgw_lanches');
  assert.equal(formatOrderNumber(1), '#0001');
  assert.equal(formatOrderNumber(42), '#0042');
});

test('computeCartSummary calculates delivery fee, pickup zero fee, minimum order gap, and missing items', () => {
  const deliverySummary = computeCartSummary(
    [
      { kind: 'combo', id: 'c-combo1', quantity: 2, note: 'Caprichado' },
      { kind: 'product', id: 'p-refri', quantity: 1 },
    ],
    catalogProducts,
    catalogCombos,
    menuSettings,
    'delivery',
  );

  assert.equal(deliverySummary.subtotal, 56);
  assert.equal(deliverySummary.deliveryFee, 5);
  assert.equal(deliverySummary.totalAmount, 61);
  assert.equal(deliverySummary.belowMinimum, false);
  assert.equal(deliverySummary.totalItemsCount, 3);

  const pickupBelowMin = computeCartSummary(
    [{ kind: 'product', id: 'p-refri', quantity: 1 }],
    catalogProducts,
    catalogCombos,
    menuSettings,
    'pickup',
  );
  assert.equal(pickupBelowMin.deliveryFee, 0);
  assert.equal(pickupBelowMin.totalAmount, 6);
  assert.equal(pickupBelowMin.belowMinimum, true);
  assert.equal(pickupBelowMin.missingForMinimum, 14);

  const withMissing = computeCartSummary(
    [{ kind: 'product', id: 'inexistente', quantity: 1 }],
    catalogProducts,
    catalogCombos,
    menuSettings,
    'delivery',
  );
  assert.equal(withMissing.missingItems.length, 1);
  assert.equal(withMissing.lines.length, 0);
});

test('validateCheckoutPayload enforces open store, minimum order, delivery address, and cash changeFor', () => {
  const validCart = computeCartSummary(
    [{ kind: 'combo', id: 'c-combo1', quantity: 1 }],
    catalogProducts,
    catalogCombos,
    menuSettings,
    'delivery',
  );

  assert.equal(
    validateCheckoutPayload(
      {
        slug: 'mgw_lanches',
        customerName: 'Carlos Souza',
        customerPhone: '(11) 99999-1111',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Av. Brasil, 500',
        deliveryReference: '',
        paymentMethod: 'Dinheiro',
        changeFor: 50,
        customerNote: '',
      },
      validCart,
      menuSettings,
    ).valid,
    true,
  );

  // Store closed
  assert.equal(
    validateCheckoutPayload(
      {
        slug: 'mgw_lanches',
        customerName: 'Carlos Souza',
        customerPhone: '11999991111',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Av. Brasil, 500',
        deliveryReference: '',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: '',
      },
      validCart,
      { ...menuSettings, isOpen: false },
    ).valid,
    false,
  );

  // Delivery without address
  assert.equal(
    validateCheckoutPayload(
      {
        slug: 'mgw_lanches',
        customerName: 'Carlos Souza',
        customerPhone: '11999991111',
        fulfillmentType: 'delivery',
        deliveryAddress: '',
        deliveryReference: '',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: '',
      },
      validCart,
      menuSettings,
    ).valid,
    false,
  );

  // Insufficient changeFor
  assert.equal(
    validateCheckoutPayload(
      {
        slug: 'mgw_lanches',
        customerName: 'Carlos Souza',
        customerPhone: '11999991111',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Av. Brasil, 500',
        deliveryReference: '',
        paymentMethod: 'Dinheiro',
        changeFor: 10,
        customerNote: '',
      },
      validCart,
      menuSettings,
    ).valid,
    false,
  );
});

test('status machine separates Delivery vs Pickup transitions, requires reason on reject/cancel, and locks terminal statuses', () => {
  assert.deepEqual(getTrackingFlowSteps('delivery'), [
    'received',
    'accepted',
    'preparing',
    'ready',
    'out_for_delivery',
    'completed',
  ]);
  assert.deepEqual(getTrackingFlowSteps('pickup'), [
    'received',
    'accepted',
    'preparing',
    'ready',
    'ready_for_pickup',
    'completed',
  ]);

  // Reject without reason blocked
  assert.equal(
    validateOrderStatusTransition('received', 'rejected', 'delivery', 'no').valid,
    false,
  );
  assert.equal(
    validateOrderStatusTransition('received', 'rejected', 'delivery', 'Item em falta').valid,
    true,
  );

  // Ready -> Delivery vs Pickup branching
  assert.equal(
    validateOrderStatusTransition('ready', 'out_for_delivery', 'delivery', '').valid,
    true,
  );
  assert.equal(
    validateOrderStatusTransition('ready', 'ready_for_pickup', 'delivery', '').valid,
    false,
  );
  assert.equal(
    validateOrderStatusTransition('ready', 'ready_for_pickup', 'pickup', '').valid,
    true,
  );

  // Terminal lock
  assert.equal(
    validateOrderStatusTransition('completed', 'cancelled', 'delivery', 'erro').valid,
    false,
  );
  assert.deepEqual(getNextStatusActions('rejected', 'delivery'), []);
});

test('buildSaleInputFromCompletedOrder converts ONLY completed orders with accurate snapshot & totals', () => {
  assert.throws(() => buildSaleInputFromCompletedOrder(makeOrder({ status: 'received' })));
  assert.throws(() => buildSaleInputFromCompletedOrder(makeOrder({ status: 'rejected', rejectionReason: 'Sem pão' })));

  const completed = makeOrder({
    status: 'completed',
    completedAtMs: new Date('2026-11-17T21:15:00-03:00').getTime(),
  });
  const saleInput = buildSaleInputFromCompletedOrder(completed, '2026-11-17');

  assert.equal(saleInput.saleOrigin, 'online');
  assert.equal(saleInput.onlineOrderId, 'ord-1');
  assert.equal(saleInput.onlineOrderNumber, 1);
  assert.equal(saleInput.deliveryFee, 5);
  assert.equal(saleInput.xSaladaCount, 2); // 1 from combo + 1 individual
  assert.equal(saleInput.combosCount, 1);
  assert.equal(saleInput.saleMode, 'mixed');
  assert.equal(saleInput.date, '2026-11-17');
  assert.equal(saleInput.paymentMethod, 'Pix');
  assert.equal(Math.round(saleInput.quantity * saleInput.unitPrice), 52);
});

test('computeOnlineOrdersDashboardStats keeps unaccepted/rejected orders out of revenue and counts completed online sales accurately', () => {
  const today = '2026-11-17';
  const orders: OnlineOrderRecord[] = [
    makeOrder({ id: 'o1', orderNumber: 1, status: 'received', viewedAtMs: null }),
    makeOrder({ id: 'o2', orderNumber: 2, status: 'preparing', viewedAtMs: 1 }),
    makeOrder({
      id: 'o3',
      orderNumber: 3,
      status: 'completed',
      completedAtMs: new Date(2026, 10, 17, 14, 0, 0).getTime(),
      saleId: 's-online-3',
    }),
    makeOrder({
      id: 'o4',
      orderNumber: 4,
      status: 'rejected',
      rejectionReason: 'Fechado',
      cancelledAtMs: new Date(2026, 10, 17, 14, 5, 0).getTime(),
    }),
  ];

  const sales: SaleRecord[] = [
    {
      id: 's-manual-1',
      ownerId: 'o',
      date: today,
      quantity: 2,
      unitPrice: 22,
      totalAmount: 44,
      paymentMethod: 'Dinheiro',
      note: '',
      saleOrigin: 'manual',
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      id: 's-online-3',
      ownerId: 'o',
      date: today,
      quantity: 2,
      unitPrice: 26,
      totalAmount: 52,
      paymentMethod: 'Pix',
      note: '#0003 · Maria',
      saleOrigin: 'online',
      onlineOrderId: 'o3',
      onlineOrderNumber: 3,
      deliveryFee: 5,
      xSaladaCount: 2,
      combosCount: 1,
      items: [
        {
          kind: 'combo',
          refId: 'c-combo1',
          name: 'Combo 1',
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          selectedAddons: [],
          estimatedUnitCost: 12,
          xSaladasPerUnit: 1,
          components: [
            { productId: 'p1', productName: 'X-Salada', quantityPerUnit: 1, totalQuantity: 1, countsAsXSalada: true },
            { productId: 'p2', productName: 'Refri 250 ml', quantityPerUnit: 1, totalQuantity: 1, countsAsXSalada: false },
          ],
        },
        {
          kind: 'product',
          refId: 'p1',
          name: 'X-Salada',
          quantity: 1,
          unitPrice: 22,
          lineTotal: 22,
          selectedAddons: [],
          estimatedUnitCost: 0,
          xSaladasPerUnit: 1,
          components: [
            { productId: 'p1', productName: 'X-Salada', quantityPerUnit: 1, totalQuantity: 1, countsAsXSalada: true },
          ],
        },
      ],
      createdAtMs: 2,
      updatedAtMs: 2,
    },
  ];

  const stats = computeOnlineOrdersDashboardStats(orders, sales, today);
  assert.equal(stats.receivedTodayCount, 4);
  assert.equal(stats.unviewedNewCount, 1);
  assert.equal(stats.pendingApprovalCount, 1);
  assert.equal(stats.inProgressCount, 1);
  assert.equal(stats.completedTodayCount, 1);
  assert.equal(stats.rejectedOrCancelledTodayCount, 1);
  assert.equal(stats.onlineRevenueToday, 52); // Never adds manual sale (44) or pending/rejected orders
  assert.equal(stats.onlineRevenueMonth, 52);
  assert.equal(stats.onlineUnitsSoldToday, 3); // 1 X-Salada + 1 Refri in combo + 1 X-Salada individual
});

test('normalizePixKeyInput and shouldShowOrderPixPaymentBox control Pix copy card visibility cleanly', () => {
  assert.equal(normalizePixKeyInput('  pix@mgwlanches.com.br \n '), 'pix@mgwlanches.com.br');
  assert.equal(normalizePixKeyInput('   '), '');
  assert.equal(normalizePixKeyInput('a'.repeat(180)).length, 140);

  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Pix',
      storePixKey: '12.345.678/0001-99',
      status: 'received',
    }),
    true,
  );
  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Pix',
      storePixKey: '12.345.678/0001-99',
      status: 'completed',
    }),
    true,
  );
  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Pix',
      storePixKey: '   ',
      status: 'received',
    }),
    false,
  );
  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Dinheiro',
      storePixKey: '12.345.678/0001-99',
      status: 'received',
    }),
    false,
  );
  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Cartão',
      storePixKey: '12.345.678/0001-99',
      status: 'accepted',
    }),
    false,
  );
  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Pix',
      storePixKey: '12.345.678/0001-99',
      status: 'rejected',
    }),
    false,
  );
  assert.equal(
    shouldShowOrderPixPaymentBox({
      paymentMethod: 'Pix',
      storePixKey: '12.345.678/0001-99',
      status: 'cancelled',
    }),
    false,
  );

  assert.equal(
    formatDigitalMenuSaveErrorMessage(
      new Error('{"error":"Missing or insufficient permissions.","authInfo":{"userId":"123"}}'),
    ),
    'Permissão negada ao gravar no banco de dados. Verifique sua sessão ou tente novamente.',
  );
  assert.equal(
    formatDigitalMenuSaveErrorMessage(new Error('Chave Pix excede 140 caracteres.')),
    'Chave Pix excede 140 caracteres.',
  );
});

