import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell.tsx';
import { DeliveryCouriersView } from '../components/DeliveryCouriersView.tsx';
import { DeliveryDashboardView } from '../components/DeliveryDashboardView.tsx';
import { DeliveryDispatchView } from '../components/DeliveryDispatchView.tsx';
import {
  demoMutations,
  subscribeDemoAdminState,
} from '../services/demoSandbox.ts';
import { hasTenantPermission } from '../services/rbacPolicy.ts';
import {
  mapDeliveryDispatchHistoryRow,
  mapDeliveryDispatchRow,
} from '../services/supabaseMappers.ts';
import type {
  DeliveryCourierRecord,
  DeliveryDispatchHistoryRecord,
  DeliveryDispatchRecord,
  DigitalMenuSettings,
  OnlineOrderRecord,
  SaleRecord,
  TenantContext,
} from '../types/finance.ts';
import { normalizeCustomerPhone } from './deliveryCouriers.ts';
import { computeDeliveryDashboardSummary } from './deliveryDashboard.ts';
import {
  buildCourierDispatchAvailabilityList,
  buildCourierWhatsappDispatchUrl,
  buildDispatchQueueItems,
  buildDispatchTrackingEntries,
  computeDeliveryDispatchKpis,
  filterDispatchTrackingEntries,
  formatElapsedDurationLabel,
  getNextDispatchActions,
  validateCourierAssignmentEligibility,
} from './deliveryDispatch.ts';
import { getLocalTodayDate } from './finance.ts';
import { DEFAULT_DIGITAL_MENU_SETTINGS } from './onlineOrders.ts';

const baseTenant: TenantContext = {
  tenantId: 'tenant-a',
  slug: 'mgw-burger',
  name: 'MGW Burger',
  role: 'owner',
  isFounderAccount: true,
  billingExempt: true,
  subscriptionStatus: 'exempt',
  graceUntil: null,
  onboardingCompleted: true,
  accessAllowed: true,
};

const baseMenuSettings: DigitalMenuSettings = {
  tenantId: 'tenant-a',
  ...DEFAULT_DIGITAL_MENU_SETTINGS,
  slug: 'mgw-burger',
  storeName: 'MGW Burger',
  deliveryFee: 5,
  acceptsDelivery: true,
  isActive: true,
  isOpen: true,
};

function makeCourier(
  overrides: Partial<DeliveryCourierRecord> & {
    id: string;
    name: string;
    phone: string;
  },
): DeliveryCourierRecord {
  const normalizedPhone = normalizeCustomerPhone(overrides.phone);
  const whatsapp = overrides.whatsapp ?? '';
  return {
    tenantId: 'tenant-a',
    normalizedPhone,
    whatsapp,
    normalizedWhatsapp: whatsapp ? normalizeCustomerPhone(whatsapp) : '',
    cpf: '',
    email: '',
    motorcycleBrand: 'Honda',
    motorcycleModel: 'CG 160',
    motorcycleColor: 'Preta',
    motorcyclePlate: 'ABC1D23',
    courierType: 'own',
    status: 'active',
    availabilityStatus: 'available',
    notes: '',
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function makeOrder(
  overrides: Partial<OnlineOrderRecord> & {
    id: string;
    orderNumber: number;
  },
): OnlineOrderRecord {
  return {
    tenantId: 'tenant-a',
    customerId: null,
    orderCode: `#${String(overrides.orderNumber).padStart(4, '0')}`,
    tokenHash: `hash-${overrides.id}`,
    status: 'accepted',
    fulfillmentType: 'delivery',
    customerName: 'Cliente Teste',
    customerPhone: '(92) 99123-0000',
    deliveryAddress: 'Rua das Flores, 120 - Centro',
    deliveryReference: 'Portão preto',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: 30,
    deliveryFee: 5,
    totalAmount: 35,
    rejectionReason: '',
    viewedAtMs: 1_700_000_000_000,
    acceptedAtMs: 1_700_000_010_000,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs: null,
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_010_000,
    items: [
      {
        id: 'item-1',
        itemKind: 'combo',
        refId: 'combo-1',
        itemName: 'COMBO 1',
        quantity: 1,
        unitPrice: 30,
        lineTotal: 30,
        selectedAddons: [],
        estimatedUnitCost: 11,
        xSaladasPerUnit: 1,
        components: [],
        itemNote: '',
      },
    ],
    statusHistory: [],
    ...overrides,
  };
}

function makeDispatch(
  overrides: Partial<DeliveryDispatchRecord> & {
    id: string;
    orderId: string;
    courierId: string;
  },
): DeliveryDispatchRecord {
  return {
    tenantId: 'tenant-a',
    dispatchStatus: 'awaiting_acceptance',
    courierNameSnapshot: 'Lucas Motoboy',
    courierPhoneSnapshot: '(92) 99111-1111',
    courierTypeSnapshot: 'own',
    assignedByUserId: 'user-1',
    assignedByEmail: 'owner@mgw.com',
    assignedAtMs: 1_700_000_020_000,
    acceptedAtMs: null,
    dispatchedAtMs: null,
    deliveredAtMs: null,
    rejectedAtMs: null,
    cancelledAtMs: null,
    rejectionReason: '',
    cancellationReason: '',
    notes: '',
    createdAtMs: 1_700_000_020_000,
    updatedAtMs: 1_700_000_020_000,
    ...overrides,
  };
}

async function withMockBrowserStorage(run: () => Promise<void> | void) {
  const store = new Map<string, string>();
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevBroadcastChannel = (globalThis as { BroadcastChannel?: unknown })
    .BroadcastChannel;
  const mockStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  (globalThis as { window: unknown }).window = {
    location: { search: '?demo=1', pathname: '/' },
    localStorage: mockStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
  try {
    await run();
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: unknown }).window = prevWindow;
    }
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      prevBroadcastChannel;
  }
}

test('1. Fila de despacho exibe apenas pedidos de entrega não finalizados e ordena por prioridade e espera', () => {
  const now = 1_700_000_600_000;
  const orders: OnlineOrderRecord[] = [
    makeOrder({ id: 'o-pickup', orderNumber: 10, fulfillmentType: 'pickup', status: 'ready', createdAtMs: now - 500_000 }),
    makeOrder({ id: 'o-done', orderNumber: 11, fulfillmentType: 'delivery', status: 'completed', createdAtMs: now - 500_000 }),
    makeOrder({ id: 'o-cancel', orderNumber: 12, fulfillmentType: 'delivery', status: 'cancelled', createdAtMs: now - 500_000 }),
    makeOrder({ id: 'o-rec', orderNumber: 13, fulfillmentType: 'delivery', status: 'received', createdAtMs: now - 400_000 }),
    makeOrder({ id: 'o-ready', orderNumber: 14, fulfillmentType: 'delivery', status: 'ready', createdAtMs: now - 120_000 }),
    makeOrder({ id: 'o-prep', orderNumber: 15, fulfillmentType: 'delivery', status: 'preparing', createdAtMs: now - 240_000 }),
    makeOrder({ id: 'o-active', orderNumber: 16, fulfillmentType: 'delivery', status: 'preparing', createdAtMs: now - 300_000 }),
    makeOrder({ id: 'o-refused', orderNumber: 17, fulfillmentType: 'delivery', status: 'accepted', createdAtMs: now - 300_000 }),
  ];

  const dispatches: DeliveryDispatchRecord[] = [
    makeDispatch({
      id: 'd-active',
      orderId: 'o-active',
      courierId: 'c1',
      dispatchStatus: 'preparing',
    }),
    makeDispatch({
      id: 'd-refused',
      orderId: 'o-refused',
      courierId: 'c1',
      dispatchStatus: 'delivery_rejected',
      rejectedAtMs: now - 60_000,
      rejectionReason: 'Pneu furado',
    }),
  ];

  const queue = buildDispatchQueueItems(orders, dispatches, now);
  assert.deepEqual(
    queue.map((item) => item.order.id),
    ['o-ready', 'o-refused', 'o-prep', 'o-rec'],
  );
  assert.equal(queue[1].wasPreviouslyRefused, true);
  assert.equal(queue[1].lastClosedDispatch?.rejectionReason, 'Pneu furado');
  assert.equal(queue[0].waitTimeMs, 120_000);
});

test('2, 3 & 4. Validação e atribuição de entregador próprio e terceirizado, bloqueios de elegibilidade e prevenção de duplicidade', async () => {
  await withMockBrowserStorage(async () => {
    let orders: OnlineOrderRecord[] = [];
    let couriers: DeliveryCourierRecord[] = [];
    let dispatches: DeliveryDispatchRecord[] = [];
    let history: DeliveryDispatchHistoryRecord[] = [];

    const unsub = subscribeDemoAdminState({
      onSettings: () => {},
      onDigitalMenuSettings: () => {},
      onProducts: () => {},
      onCombos: () => {},
      onSales: () => {},
      onExpenses: () => {},
      onOrders: (list) => {
        orders = list;
      },
      onDeliveryCouriers: (list) => {
        couriers = list;
      },
      onDeliveryDispatches: (list) => {
        dispatches = list;
      },
      onDeliveryDispatchHistory: (list) => {
        history = list;
      },
      onReady: () => {},
    });

    try {
      const ownCourierId = demoMutations.createDeliveryCourier({
        name: 'Lucas Próprio',
        phone: '(92) 99111-1001',
        courierType: 'own',
        status: 'active',
        availabilityStatus: 'available',
      });
      const outsourcedCourierId = demoMutations.createDeliveryCourier({
        name: 'Marcos Terceirizado',
        phone: '(92) 99111-1002',
        courierType: 'outsourced',
        status: 'active',
        availabilityStatus: 'available',
      });
      const unavailableCourierId = demoMutations.createDeliveryCourier({
        name: 'Paulo Folga',
        phone: '(92) 99111-1003',
        courierType: 'own',
        status: 'active',
        availabilityStatus: 'unavailable',
      });
      const inactiveCourierId = demoMutations.createDeliveryCourier({
        name: 'Renato Inativo',
        phone: '(92) 99111-1004',
        courierType: 'outsourced',
        status: 'inactive',
        availabilityStatus: 'unavailable',
      });

      const deliveryCreated = await demoMutations.createPublicOrder({
        customerName: 'Maria Entrega',
        customerPhone: '(92) 99800-1122',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Av. Djalma Batista, 500',
        deliveryReference: 'Ao lado da farmácia',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: 'Sem cebola',
        items: [{ kind: 'combo', id: 'demo_combo_1', quantity: 1 }],
      });

      const pickupCreated = await demoMutations.createPublicOrder({
        customerName: 'João Retirada',
        customerPhone: '(92) 99800-3344',
        fulfillmentType: 'pickup',
        deliveryAddress: '',
        deliveryReference: '',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: '',
        items: [{ kind: 'combo', id: 'demo_combo_1', quantity: 1 }],
      });

      // Bloqueia retirada, indisponível, inativo, inexistente e tenant diferente
      assert.throws(
        () =>
          demoMutations.assignDeliveryCourier(
            pickupCreated.orderId,
            ownCourierId,
            '',
            'gerente@mgw.com',
          ),
        /retirada no balcão/,
      );
      assert.throws(
        () =>
          demoMutations.assignDeliveryCourier(
            deliveryCreated.orderId,
            unavailableCourierId,
            '',
            'gerente@mgw.com',
          ),
        /indisponível/,
      );
      assert.throws(
        () =>
          demoMutations.assignDeliveryCourier(
            deliveryCreated.orderId,
            inactiveCourierId,
            '',
            'gerente@mgw.com',
          ),
        /inativo/,
      );
      assert.throws(
        () =>
          demoMutations.assignDeliveryCourier(
            deliveryCreated.orderId,
            'courier-inexistente',
            '',
            'gerente@mgw.com',
          ),
        /não encontrado/,
      );

      const crossTenantCheck = validateCourierAssignmentEligibility({
        order: makeOrder({ id: 'o-1', orderNumber: 1 }),
        courier: makeCourier({
          id: 'c-other',
          tenantId: 'tenant-b',
          name: 'Outro',
          phone: '92999998888',
        }),
        existingDispatches: [],
      });
      assert.equal(crossTenantCheck.valid, false);
      assert.match(crossTenantCheck.error || '', /não pertence ao estabelecimento/);

      // Atribui entregador próprio com sucesso (e auto-aceita pedido 'received')
      const dispatchId = demoMutations.assignDeliveryCourier(
        deliveryCreated.orderId,
        ownCourierId,
        'Levar maquininha',
        'gerente@mgw.com',
      );
      assert.ok(dispatchId.startsWith('demo_disp_'));

      const createdDispatch = dispatches.find((d) => d.id === dispatchId);
      assert.ok(createdDispatch);
      assert.equal(createdDispatch.dispatchStatus, 'awaiting_acceptance');
      assert.equal(createdDispatch.courierTypeSnapshot, 'own');
      assert.equal(createdDispatch.assignedByEmail, 'gerente@mgw.com');
      assert.equal(createdDispatch.notes, 'Levar maquininha');

      const updatedOrder = orders.find((o) => o.id === deliveryCreated.orderId);
      assert.equal(updatedOrder?.status, 'accepted');

      assert.equal(
        history.filter((h) => h.dispatchId === dispatchId).length,
        2,
      );

      // Bloqueia segunda atribuição ativa para o mesmo pedido
      assert.throws(
        () =>
          demoMutations.assignDeliveryCourier(
            deliveryCreated.orderId,
            outsourcedCourierId,
            '',
            'gerente@mgw.com',
          ),
        /já possui um entregador ativo/,
      );

      // Disponibilidade operacional indica Ocupado para Lucas e Disponível para Marcos
      const avail = buildCourierDispatchAvailabilityList(couriers, dispatches);
      const lucasEntry = avail.find((e) => e.courier.id === ownCourierId);
      const marcosEntry = avail.find((e) => e.courier.id === outsourcedCourierId);
      assert.equal(lucasEntry?.operationalAvailability, 'occupied');
      assert.equal(lucasEntry?.activeDeliveriesCount, 1);
      assert.equal(marcosEntry?.operationalAvailability, 'available');
      assert.equal(marcosEntry?.courierTypeLabel, 'Terceirizado');
    } finally {
      unsub();
    }
  });
});

test('5, 6, 7 & 8. Aceite, recusa obrigando motivo, reatribuição e cancelamento de despacho com histórico auditável', async () => {
  await withMockBrowserStorage(async () => {
    let orders: OnlineOrderRecord[] = [];
    let dispatches: DeliveryDispatchRecord[] = [];
    let history: DeliveryDispatchHistoryRecord[] = [];

    const unsub = subscribeDemoAdminState({
      onSettings: () => {},
      onDigitalMenuSettings: () => {},
      onProducts: () => {},
      onCombos: () => {},
      onSales: () => {},
      onExpenses: () => {},
      onOrders: (list) => {
        orders = list;
      },
      onDeliveryCouriers: () => {},
      onDeliveryDispatches: (list) => {
        dispatches = list;
      },
      onDeliveryDispatchHistory: (list) => {
        history = list;
      },
      onReady: () => {},
    });

    try {
      const c1 = demoMutations.createDeliveryCourier({
        name: 'Entregador 1',
        phone: '(92) 99222-0001',
        courierType: 'own',
      });
      const c2 = demoMutations.createDeliveryCourier({
        name: 'Entregador 2',
        phone: '(92) 99222-0002',
        courierType: 'outsourced',
      });

      const created = await demoMutations.createPublicOrder({
        customerName: 'Cliente Fluxo',
        customerPhone: '(92) 99333-4455',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Rua Amazonas, 400',
        deliveryReference: '',
        paymentMethod: 'Dinheiro',
        changeFor: 50,
        customerNote: '',
        items: [{ kind: 'combo', id: 'demo_combo_1', quantity: 1 }],
      });

      // 1ª atribuição -> recusa exige motivo >= 3 caracteres
      const d1 = demoMutations.assignDeliveryCourier(created.orderId, c1, '', 'op@mgw.com');
      assert.throws(
        () => demoMutations.respondDeliveryDispatch(d1, 'reject', '  ', 'op@mgw.com'),
        /motivo da recusa/i,
      );

      demoMutations.respondDeliveryDispatch(d1, 'reject', 'Moto com pneu furado', 'op@mgw.com');
      const refused = dispatches.find((d) => d.id === d1);
      assert.equal(refused?.dispatchStatus, 'delivery_rejected');
      assert.equal(refused?.rejectionReason, 'Moto com pneu furado');
      assert.ok(refused?.rejectedAtMs);

      // Pedido volta automaticamente para a fila com indicador de recusa anterior
      const queueAfterRefusal = buildDispatchQueueItems(orders, dispatches);
      const qItem = queueAfterRefusal.find((i) => i.order.id === created.orderId);
      assert.ok(qItem);
      assert.equal(qItem.wasPreviouslyRefused, true);

      // Nova atribuição para Entregador 2 -> Reatribuição de volta para Entregador 1
      const d2 = demoMutations.assignDeliveryCourier(created.orderId, c2, 'Urgente', 'op@mgw.com');
      assert.throws(
        () => demoMutations.reassignDeliveryCourier(d2, c2, 'Mesmo', 'op@mgw.com'),
        /entregador diferente/,
      );

      const d3 = demoMutations.reassignDeliveryCourier(d2, c1, 'Entregador 2 sem troco', 'op@mgw.com');
      assert.equal(dispatches.find((d) => d.id === d2)?.dispatchStatus, 'delivery_cancelled');
      assert.equal(dispatches.find((d) => d.id === d3)?.dispatchStatus, 'awaiting_acceptance');
      assert.equal(dispatches.find((d) => d.id === d3)?.courierId, c1);

      // Aceite do entregador 1 -> depois cancelamento do envio exige motivo e devolve pedido à fila
      demoMutations.respondDeliveryDispatch(d3, 'accept', '', 'op@mgw.com');
      assert.equal(dispatches.find((d) => d.id === d3)?.dispatchStatus, 'delivery_accepted');
      assert.ok(dispatches.find((d) => d.id === d3)?.acceptedAtMs);

      assert.throws(
        () => demoMutations.cancelDeliveryDispatch(d3, 'ab', 'op@mgw.com'),
        /motivo do cancelamento/i,
      );
      demoMutations.cancelDeliveryDispatch(d3, 'Cliente mudou endereço', 'op@mgw.com');
      assert.equal(dispatches.find((d) => d.id === d3)?.dispatchStatus, 'delivery_cancelled');

      const queueAfterCancel = buildDispatchQueueItems(orders, dispatches);
      assert.equal(
        queueAfterCancel.some((i) => i.order.id === created.orderId),
        true,
      );

      // Não permite excluir entregador que possui despachos no histórico
      assert.throws(
        () => demoMutations.deleteDeliveryCourier(c1),
        /possui entregas vinculadas/i,
      );

      assert.ok(history.length >= 6);
    } finally {
      unsub();
    }
  });
});

test('9. Progressão completa (Em preparação -> Pronto -> Saiu para entrega -> Entregue) sincroniza pedido, gera 1 única venda e suporta sincronia reversa', async () => {
  await withMockBrowserStorage(async () => {
    let orders: OnlineOrderRecord[] = [];
    let dispatches: DeliveryDispatchRecord[] = [];
    let sales: SaleRecord[] = [];

    const unsub = subscribeDemoAdminState({
      onSettings: () => {},
      onDigitalMenuSettings: () => {},
      onProducts: () => {},
      onCombos: () => {},
      onSales: (list) => {
        sales = list;
      },
      onExpenses: () => {},
      onOrders: (list) => {
        orders = list;
      },
      onDeliveryCouriers: () => {},
      onDeliveryDispatches: (list) => {
        dispatches = list;
      },
      onReady: () => {},
    });

    try {
      const cId = demoMutations.createDeliveryCourier({
        name: 'Carlos Rota',
        phone: '(92) 99444-5566',
        courierType: 'own',
      });

      const orderRes = await demoMutations.createPublicOrder({
        customerName: 'Ana Completa',
        customerPhone: '(92) 99444-1122',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Av. Constantino Nery, 1200',
        deliveryReference: '',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: '',
        items: [{ kind: 'combo', id: 'demo_combo_1', quantity: 2 }],
      });

      const dId = demoMutations.assignDeliveryCourier(orderRes.orderId, cId, '', 'op@mgw.com');
      demoMutations.respondDeliveryDispatch(dId, 'accept', '', 'op@mgw.com');

      demoMutations.advanceDeliveryDispatchStatus(dId, 'preparing', 'op@mgw.com');
      assert.equal(dispatches.find((d) => d.id === dId)?.dispatchStatus, 'preparing');
      assert.equal(orders.find((o) => o.id === orderRes.orderId)?.status, 'preparing');

      demoMutations.advanceDeliveryDispatchStatus(dId, 'ready_for_dispatch', 'op@mgw.com');
      assert.equal(dispatches.find((d) => d.id === dId)?.dispatchStatus, 'ready_for_dispatch');
      assert.equal(orders.find((o) => o.id === orderRes.orderId)?.status, 'ready');

      demoMutations.advanceDeliveryDispatchStatus(dId, 'out_for_delivery', 'op@mgw.com');
      const dOut = dispatches.find((d) => d.id === dId);
      assert.equal(dOut?.dispatchStatus, 'out_for_delivery');
      assert.ok(dOut?.dispatchedAtMs);
      assert.equal(orders.find((o) => o.id === orderRes.orderId)?.status, 'out_for_delivery');

      // Reatribuir em rota é bloqueado
      assert.throws(
        () => demoMutations.reassignDeliveryCourier(dId, 'other', 'teste', 'op@mgw.com'),
        /saiu em rota/i,
      );

      const salesBefore = sales.filter((s) => s.onlineOrderId === orderRes.orderId).length;
      assert.equal(salesBefore, 0);

      demoMutations.advanceDeliveryDispatchStatus(dId, 'delivered', 'op@mgw.com');
      const dDone = dispatches.find((d) => d.id === dId);
      const oDone = orders.find((o) => o.id === orderRes.orderId);
      assert.equal(dDone?.dispatchStatus, 'delivered');
      assert.ok(dDone?.deliveredAtMs);
      assert.equal(oDone?.status, 'completed');
      assert.ok(oDone?.saleId);
      assert.equal(
        sales.filter((s) => s.onlineOrderId === orderRes.orderId).length,
        1,
      );

      // Sincronia reversa: pedido alterado na Central de Pedidos sincroniza o despacho ativo automaticamente
      const order2 = await demoMutations.createPublicOrder({
        customerName: 'Bruno Reverso',
        customerPhone: '(92) 99555-7788',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Rua Recife, 88',
        deliveryReference: '',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: '',
        items: [{ kind: 'combo', id: 'demo_combo_1', quantity: 1 }],
      });
      const d2Id = demoMutations.assignDeliveryCourier(order2.orderId, cId, '', 'op@mgw.com');
      demoMutations.respondDeliveryDispatch(d2Id, 'accept', '', 'op@mgw.com');
      demoMutations.transitionOrderStatus(order2.orderId, 'preparing', '');
      assert.equal(dispatches.find((d) => d.id === d2Id)?.dispatchStatus, 'preparing');
      demoMutations.transitionOrderStatus(order2.orderId, 'ready', '');
      assert.equal(dispatches.find((d) => d.id === d2Id)?.dispatchStatus, 'ready_for_dispatch');
      demoMutations.transitionOrderStatus(order2.orderId, 'out_for_delivery', '');
      assert.equal(dispatches.find((d) => d.id === d2Id)?.dispatchStatus, 'out_for_delivery');
      demoMutations.transitionOrderStatus(order2.orderId, 'completed', '');
      assert.equal(dispatches.find((d) => d.id === d2Id)?.dispatchStatus, 'delivered');
      assert.equal(
        sales.filter((s) => s.onlineOrderId === order2.orderId).length,
        1,
      );

      // Cancelamento do pedido na Central de Pedidos cancela o despacho ativo
      const order3 = await demoMutations.createPublicOrder({
        customerName: 'Caio Cancelado',
        customerPhone: '(92) 99666-8899',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Rua Manaus, 10',
        deliveryReference: '',
        paymentMethod: 'Pix',
        changeFor: null,
        customerNote: '',
        items: [{ kind: 'combo', id: 'demo_combo_1', quantity: 1 }],
      });
      const d3Id = demoMutations.assignDeliveryCourier(order3.orderId, cId, '', 'op@mgw.com');
      demoMutations.transitionOrderStatus(order3.orderId, 'cancelled', 'Cliente desistiu');
      assert.equal(dispatches.find((d) => d.id === d3Id)?.dispatchStatus, 'delivery_cancelled');
    } finally {
      unsub();
    }
  });
});

test('10. KPIs, 4 filtros de busca, dashboard, ações contextuais e WhatsApp dispatch URL funcionam corretamente', () => {
  const now = new Date('2026-11-25T15:00:00Z').getTime();
  const todayStr = getLocalTodayDate(new Date(now));
  const oldMs = now - 10 * 24 * 60 * 60 * 1000;

  const c1 = makeCourier({
    id: 'c1',
    name: 'Lucas Silva',
    phone: '(92) 99111-1111',
    courierType: 'own',
  });
  const c2 = makeCourier({
    id: 'c2',
    name: 'Marcos Costa',
    phone: '(92) 99222-2222',
    courierType: 'outsourced',
  });

  const o1 = makeOrder({ id: 'o1', orderNumber: 1, customerName: 'Cliente 1', status: 'accepted' });
  const o2 = makeOrder({ id: 'o2', orderNumber: 2, customerName: 'Cliente 2', status: 'ready' });
  const o3 = makeOrder({ id: 'o3', orderNumber: 3, customerName: 'Cliente 3', status: 'out_for_delivery' });
  const o4 = makeOrder({ id: 'o4', orderNumber: 4, customerName: 'Cliente 4', status: 'completed' });
  const o5 = makeOrder({ id: 'o5', orderNumber: 5, customerName: 'Cliente 5 Antigo', status: 'completed' });

  const dispatches: DeliveryDispatchRecord[] = [
    makeDispatch({
      id: 'd2',
      orderId: 'o2',
      courierId: 'c1',
      dispatchStatus: 'awaiting_acceptance',
      assignedAtMs: now - 300_000,
    }),
    makeDispatch({
      id: 'd3',
      orderId: 'o3',
      courierId: 'c2',
      courierTypeSnapshot: 'outsourced',
      courierNameSnapshot: 'Marcos Costa',
      dispatchStatus: 'out_for_delivery',
      assignedAtMs: now - 900_000,
    }),
    makeDispatch({
      id: 'd4',
      orderId: 'o4',
      courierId: 'c1',
      dispatchStatus: 'delivered',
      assignedAtMs: now - 3_600_000,
      deliveredAtMs: now - 1_800_000,
    }),
    makeDispatch({
      id: 'd5',
      orderId: 'o5',
      courierId: 'c2',
      dispatchStatus: 'delivered',
      assignedAtMs: oldMs,
      deliveredAtMs: oldMs + 600_000,
    }),
  ];

  const kpis = computeDeliveryDispatchKpis([o1, o2, o3, o4, o5], dispatches, [c1, c2], todayStr, now);
  assert.equal(kpis.awaitingCourierCount, 1);
  assert.equal(kpis.awaitingAcceptanceCount, 1);
  assert.equal(kpis.inProgressCount, 1);
  assert.equal(kpis.completedTodayCount, 1);
  assert.equal(kpis.availableCouriersCount, 0);
  assert.equal(kpis.occupiedCouriersCount, 2);

  const dashboardSummary = computeDeliveryDashboardSummary(
    [o1, o2, o3, o4, o5],
    baseMenuSettings,
    todayStr,
    8,
    [],
    [c1, c2],
    dispatches,
  );
  assert.equal(dashboardSummary.awaitingDispatchCount, 1);
  assert.equal(dashboardSummary.dispatchModuleReady, true);

  const entries = buildDispatchTrackingEntries({
    orders: [o1, o2, o3, o4, o5],
    dispatches,
    couriers: [c1, c2],
    history: [],
    nowMs: now,
  });

  // Filtro: statusFilter = 'active'
  assert.deepEqual(
    filterDispatchTrackingEntries(entries, {
      statusFilter: 'active',
      courierIdFilter: 'all',
      periodFilter: 'all',
      orderNumberQuery: '',
      referenceDate: todayStr,
      nowMs: now,
    }).map((e) => e.dispatch.id),
    ['d2', 'd3'],
  );

  // Filtro: courierIdFilter
  assert.deepEqual(
    filterDispatchTrackingEntries(entries, {
      statusFilter: 'all',
      courierIdFilter: 'c2',
      periodFilter: 'all',
      orderNumberQuery: '',
      referenceDate: todayStr,
      nowMs: now,
    }).map((e) => e.dispatch.id),
    ['d3', 'd5'],
  );

  // Filtro: periodFilter = 'today'
  assert.deepEqual(
    filterDispatchTrackingEntries(entries, {
      statusFilter: 'all',
      courierIdFilter: 'all',
      periodFilter: 'today',
      orderNumberQuery: '',
      referenceDate: todayStr,
      nowMs: now,
    }).map((e) => e.dispatch.id),
    ['d2', 'd3', 'd4'],
  );

  // Filtro: orderNumberQuery (#0003)
  assert.deepEqual(
    filterDispatchTrackingEntries(entries, {
      statusFilter: 'all',
      courierIdFilter: 'all',
      periodFilter: 'all',
      orderNumberQuery: '0003',
      referenceDate: todayStr,
      nowMs: now,
    }).map((e) => e.dispatch.id),
    ['d3'],
  );

  assert.equal(formatElapsedDurationLabel(30_000), '< 1 min');
  assert.equal(formatElapsedDurationLabel(15 * 60_000), '15 min');
  assert.equal(formatElapsedDurationLabel(65 * 60_000), '1h 05min');

  const waUrl = buildCourierWhatsappDispatchUrl({
    courierPhone: '(92) 99111-1111',
    courierName: 'Lucas',
    order: o2,
    storeName: 'MGW Burger',
  });
  assert.ok(waUrl?.startsWith('https://wa.me/5592991111111?text='));

  const acceptedActions = getNextDispatchActions('delivery_accepted', 'ready');
  assert.equal(acceptedActions[0].nextStatus, 'out_for_delivery');
  assert.equal(getNextDispatchActions('delivered').length, 0);
});

test('11. Migration SQL 20261125160000 e mappers garantem isolamento multi-tenant, índice parcial único, RLS e RPCs seguras', () => {
  const sql = readFileSync(
    'supabase/migrations/20261125160000_delivery_dispatch_center.sql',
    'utf8',
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS courier_type text NOT NULL DEFAULT 'own'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_dispatches/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_dispatch_history/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_dispatches_active_order/);
  assert.match(sql, /ALTER TABLE public\.delivery_dispatches ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.delivery_dispatch_history ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /public\.has_active_tenant_access\(tenant_id\)/);
  assert.match(sql, /public\.has_tenant_role\(tenant_id, ARRAY\['owner', 'admin', 'manager'\]\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.assign_delivery_courier/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reassign_delivery_courier/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cancel_delivery_dispatch/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.respond_delivery_dispatch/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.advance_delivery_dispatch_status/);
  assert.match(sql, /SET search_path = pg_catalog, public/);
  assert.match(sql, /trg_sync_delivery_dispatch_from_online_order/);
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.delivery_dispatches/);

  const mappedDispatch = mapDeliveryDispatchRow({
    id: 'disp-1',
    tenant_id: 'tenant-a',
    order_id: 'ord-1',
    courier_id: 'cour-1',
    dispatch_status: 'awaiting_acceptance',
    courier_name_snapshot: 'Lucas',
    courier_phone_snapshot: '(92) 99111-1111',
    courier_type_snapshot: 'outsourced',
    assigned_by_user_id: 'u-1',
    assigned_by_email: 'owner@mgw.com',
    assigned_at: '2026-11-25T12:00:00Z',
    accepted_at: null,
    dispatched_at: null,
    delivered_at: null,
    rejected_at: null,
    cancelled_at: null,
    rejection_reason: '',
    cancellation_reason: '',
    notes: 'Sem troco',
    created_at: '2026-11-25T12:00:00Z',
    updated_at: '2026-11-25T12:00:00Z',
  });
  assert.equal(mappedDispatch.courierTypeSnapshot, 'outsourced');
  assert.equal(mappedDispatch.dispatchStatus, 'awaiting_acceptance');

  const mappedHistory = mapDeliveryDispatchHistoryRow({
    id: 'dh-1',
    tenant_id: 'tenant-a',
    dispatch_id: 'disp-1',
    order_id: 'ord-1',
    courier_id: 'cour-1',
    courier_name: 'Lucas',
    from_status: 'awaiting_dispatch',
    to_status: 'courier_assigned',
    actor_user_id: 'u-1',
    actor_email: 'owner@mgw.com',
    actor_type: 'admin',
    reason: 'Despacho inicial',
    created_at: '2026-11-25T12:00:00Z',
  });
  assert.equal(mappedHistory.toStatus, 'courier_assigned');
  assert.equal(mappedHistory.actorType, 'admin');
});

test('12. Renderização SSR: AppShell com RBAC, DeliveryDashboardView ativo, DeliveryDispatchView (loading/empty/populated) e DeliveryCouriersView com ocupação', () => {
  assert.equal(hasTenantPermission('staff', 'delivery:view'), false);
  assert.equal(hasTenantPermission('owner', 'delivery:view'), true);
  assert.equal(hasTenantPermission('admin', 'delivery:view'), true);
  assert.equal(hasTenantPermission('manager', 'delivery:view'), true);

  const shellHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'delivery_dispatch',
      activeSettingsTab: 'shop',
      onNavigate: () => {},
      canViewDashboard: true,
      canAccessDelivery: true,
      canReadSales: true,
      canCreateSales: true,
      canReadExpenses: true,
      canCreateExpenses: true,
      canViewReports: true,
      canAccessSettingsRoute: true,
      canWriteSettings: true,
      canWriteCatalog: true,
      unviewedOrdersCount: 0,
      activeTenant: baseTenant,
      tenants: [baseTenant],
      establishmentName: 'MGW Burger',
      userEmail: 'owner@mgw.com',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Conteúdo Despacho'),
    }),
  );
  assert.match(shellHtml, /Central de despacho/);
  assert.match(shellHtml, /Central de Despacho · MGW Delivery/);

  const now = Date.now();
  const order1 = makeOrder({
    id: 'o1',
    orderNumber: 21,
    customerName: 'Pedro Souza',
    status: 'ready',
    createdAtMs: now - 120_000,
    updatedAtMs: now - 60_000,
  });
  const courier1 = makeCourier({
    id: 'c1',
    name: 'Lucas Motoboy',
    phone: '(92) 99123-4567',
    courierType: 'outsourced',
  });
  const activeDispatch = makeDispatch({
    id: 'd1',
    orderId: 'o-other',
    courierId: 'c1',
    courierNameSnapshot: 'Lucas Motoboy',
    courierTypeSnapshot: 'outsourced',
    dispatchStatus: 'out_for_delivery',
    assignedAtMs: now - 300_000,
    createdAtMs: now - 300_000,
    updatedAtMs: now - 60_000,
  });
  const otherOrder = makeOrder({
    id: 'o-other',
    orderNumber: 20,
    customerName: 'Julia Lima',
    status: 'out_for_delivery',
    createdAtMs: now - 600_000,
    updatedAtMs: now - 60_000,
  });

  const dashboardHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Burger',
      orders: [order1, otherOrder],
      couriers: [courier1],
      dispatches: [activeDispatch],
      digitalMenuSettings: baseMenuSettings,
      onOpenDispatch: () => {},
    }),
  );
  assert.match(dashboardHtml, /Central de despacho/);
  assert.match(dashboardHtml, /1 pedido\(s\) aguardando despacho/);
  assert.match(dashboardHtml, />Abrir</);

  const loadingHtml = renderToStaticMarkup(
    createElement(DeliveryDispatchView, {
      establishmentName: 'MGW Burger',
      orders: [],
      couriers: [],
      dispatches: [],
      dispatchHistory: [],
      digitalMenuSettings: baseMenuSettings,
      isLoading: true,
      onAssignCourier: async () => {},
      onReassignCourier: async () => {},
      onCancelDispatch: async () => {},
      onRespondDispatch: async () => {},
      onAdvanceDispatchStatus: async () => {},
    }),
  );
  assert.match(loadingHtml, /Carregando Central de Despacho do MGW Delivery/);

  const emptyHtml = renderToStaticMarkup(
    createElement(DeliveryDispatchView, {
      establishmentName: 'MGW Burger',
      orders: [],
      couriers: [],
      dispatches: [],
      dispatchHistory: [],
      digitalMenuSettings: baseMenuSettings,
      errorMessage: 'Falha simulada',
      onAssignCourier: async () => {},
      onReassignCourier: async () => {},
      onCancelDispatch: async () => {},
      onRespondDispatch: async () => {},
      onAdvanceDispatchStatus: async () => {},
    }),
  );
  assert.match(emptyHtml, /Nenhum pedido aguardando atribuição/);
  assert.match(emptyHtml, /Falha simulada/);

  const populatedHtml = renderToStaticMarkup(
    createElement(DeliveryDispatchView, {
      establishmentName: 'MGW Burger',
      orders: [order1, otherOrder],
      couriers: [courier1],
      dispatches: [activeDispatch],
      dispatchHistory: [],
      digitalMenuSettings: baseMenuSettings,
      onAssignCourier: async () => {},
      onReassignCourier: async () => {},
      onCancelDispatch: async () => {},
      onRespondDispatch: async () => {},
      onAdvanceDispatchStatus: async () => {},
    }),
  );
  assert.match(populatedHtml, /Central de Despacho/);
  assert.match(populatedHtml, /#0021/);
  assert.match(populatedHtml, /Pedro Souza/);
  assert.match(populatedHtml, /#0020/);
  assert.match(populatedHtml, /Julia Lima/);
  assert.match(populatedHtml, /Lucas Motoboy/);
  assert.match(populatedHtml, /Terceirizado/);

  const couriersHtml = renderToStaticMarkup(
    createElement(DeliveryCouriersView, {
      establishmentName: 'MGW Burger',
      couriers: [courier1],
      dispatches: [activeDispatch],
      onCreateCourier: async () => '',
      onUpdateCourier: async () => {},
      onToggleCourierStatus: async () => {},
      onToggleCourierAvailability: async () => {},
      onDeleteCourier: async () => {},
    }),
  );
  assert.match(couriersHtml, /Terceirizado/);
  assert.match(couriersHtml, /Ocupado/);
});
