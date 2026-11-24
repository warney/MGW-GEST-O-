import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicMenuView } from '../components/PublicMenuView';
import { PublicOrderTrackingView } from '../components/PublicOrderTrackingView';
import type {
  PublicDigitalMenuPayload,
  PublicOrderTrackingRecord,
} from '../types/finance';
import { parsePublicUrlRoute } from './publicRoutes';
import {
  buildActiveOrdersStorageKey,
  extractStepTimestamps,
  readActiveTrackedOrders,
  reconcileActiveTrackedOrders,
  removeTrackedOrder,
  type StoredTrackedOrder,
  upsertTrackedOrder,
} from './orderTrackingRecovery';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function makeTrackingOrder(
  overrides: Partial<PublicOrderTrackingRecord> = {},
): PublicOrderTrackingRecord {
  const baseMs = new Date(2026, 10, 24, 22, 11, 0).getTime();
  return {
    orderId: 'ord-14',
    orderNumber: 14,
    orderCode: '#0014',
    status: 'preparing',
    fulfillmentType: 'delivery',
    customerName: 'Gabriel Silva',
    deliveryAddress: 'Rua Maria Azevedo Ramos, 964',
    deliveryReference: 'Casa verde',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: 'Caprichar no molho',
    subtotalAmount: 15,
    deliveryFee: 0,
    totalAmount: 15,
    rejectionReason: '',
    storeName: 'MGW Burger',
    storeSlug: 'mgw-burger',
    storeWhatsapp: '92981112510',
    storeAddress: 'Rua Maria Azevedo Ramos 964',
    storePixKey: 'mgw@pix.com',
    createdAtMs: baseMs,
    updatedAtMs: baseMs + 120_000,
    items: [
      {
        id: 'it-1',
        itemKind: 'combo',
        refId: 'combo-1',
        itemName: 'COMBO 1',
        quantity: 1,
        unitPrice: 15,
        lineTotal: 15,
        selectedAddons: [],
        itemNote: '',
      },
    ],
    statusHistory: [
      {
        id: 'h-1',
        fromStatus: null,
        toStatus: 'received',
        reason: '',
        createdAtMs: baseMs,
      },
      {
        id: 'h-2',
        fromStatus: 'received',
        toStatus: 'accepted',
        reason: '',
        createdAtMs: baseMs + 60_000,
      },
      {
        id: 'h-3',
        fromStatus: 'accepted',
        toStatus: 'preparing',
        reason: '',
        createdAtMs: baseMs + 120_000,
      },
    ],
    ...overrides,
  };
}

function makeStorePayload(slug: string, name: string): PublicDigitalMenuPayload {
  return {
    found: true,
    store: {
      slug,
      isActive: true,
      isOpen: true,
      storeName: name,
      description: `Cardápio oficial ${name}`,
      phoneWhatsapp: '92981112510',
      address: 'Rua Principal, 100',
      openingHours: '18h às 23h',
      pixKey: '',
      deliveryFee: 5,
      minimumOrderAmount: 0,
      acceptsDelivery: true,
      acceptsPickup: true,
      logoUrl: `https://cdn.example.com/${slug}-logo.png`,
      bannerUrl: `https://cdn.example.com/${slug}-banner.jpg`,
    },
    combos: [
      {
        id: 'combo-1',
        name: 'COMBO 1',
        description: '1 X-Salada + 1 Refrigerante 250 ml',
        salePrice: 15,
        imageUrl: `https://cdn.example.com/${slug}-combo1.jpg`,
        items: [],
      },
    ],
    products: [],
  };
}

test('Cenários 1 a 5: Salvar pedido ativo, recuperar após saída/reload, preservar múltiplos pedidos sem duplicar e reabrir link por token', () => {
  const storage = createMemoryStorage();
  const now = Date.now();

  const order14: StoredTrackedOrder = {
    trackingToken: 'tok-secret-order-0014-abcdef',
    storeSlug: 'sabor-da-villa',
    orderNumber: 14,
    orderCode: '#0014',
    status: 'received',
    fulfillmentType: 'delivery',
    totalAmount: 45,
    createdAtMs: now - 60_000,
    updatedAtMs: now - 60_000,
  };

  upsertTrackedOrder('sabor-da-villa', order14, storage, now);
  // Atualizar o mesmo token não cria duplicata
  upsertTrackedOrder(
    'sabor-da-villa',
    { ...order14, status: 'preparing', updatedAtMs: now },
    storage,
    now,
  );

  // Segundo pedido simultâneo na mesma loja não sobrescreve o primeiro
  const order15: StoredTrackedOrder = {
    trackingToken: 'tok-secret-order-0015-ghijkl',
    storeSlug: 'sabor-da-villa',
    orderNumber: 15,
    orderCode: '#0015',
    status: 'accepted',
    fulfillmentType: 'pickup',
    totalAmount: 22,
    createdAtMs: now,
    updatedAtMs: now,
  };
  upsertTrackedOrder('sabor-da-villa', order15, storage, now);

  // Simula recarregamento/reabertura do navegador lendo novamente do Storage
  const recovered = readActiveTrackedOrders('sabor-da-villa', storage, now);
  assert.equal(recovered.length, 2);
  assert.equal(recovered[0].orderNumber, 15);
  assert.equal(recovered[1].orderNumber, 14);
  assert.equal(recovered[1].status, 'preparing');

  // Rota por token seguro preserva acesso direto (inclusive links salvos/WhatsApp)
  assert.deepEqual(
    parsePublicUrlRoute('/cardapio/pedido/tok-secret-order-0014-abcdef'),
    { kind: 'tracking', token: 'tok-secret-order-0014-abcdef' },
  );
  assert.deepEqual(
    parsePublicUrlRoute('/pedido/tok-secret-order-0014-abcdef'),
    { kind: 'tracking', token: 'tok-secret-order-0014-abcdef' },
  );

  // Cardápio exibe banner destacado de recuperação de pedidos ativos
  const menuHtml = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'sabor-da-villa',
      onOrderCreated: () => {},
      initialPayload: makeStorePayload('sabor-da-villa', 'Sabor da Villa'),
      initialActiveOrders: recovered,
    }),
  );

  assert.ok(menuHtml.includes('data-testid="active-orders-recovery-banner"'));
  assert.ok(menuHtml.includes('Você tem 2 pedidos em andamento'));
  assert.ok(menuHtml.includes('Pedido #0015'));
  assert.ok(menuHtml.includes('Pedido #0014'));
  assert.ok(menuHtml.includes('Em preparação'));
  assert.ok(menuHtml.includes('Aceito'));
  assert.ok(menuHtml.includes('Acompanhar pedido'));
});

test('Cenários 6, 7 e 8: Reconcilia mudança de status offline e remove pedidos concluídos ou cancelados da lista ativa', async () => {
  const storage = createMemoryStorage();
  const now = Date.now();

  upsertTrackedOrder(
    'sabor-da-villa',
    {
      trackingToken: 'tok-preparing-111111',
      storeSlug: 'sabor-da-villa',
      orderNumber: 20,
      orderCode: '#0020',
      status: 'received',
      fulfillmentType: 'delivery',
      totalAmount: 30,
      createdAtMs: now - 30_000,
      updatedAtMs: now - 30_000,
    },
    storage,
    now,
  );
  upsertTrackedOrder(
    'sabor-da-villa',
    {
      trackingToken: 'tok-completed-222222',
      storeSlug: 'sabor-da-villa',
      orderNumber: 19,
      orderCode: '#0019',
      status: 'out_for_delivery',
      fulfillmentType: 'delivery',
      totalAmount: 42,
      createdAtMs: now - 90_000,
      updatedAtMs: now - 90_000,
    },
    storage,
    now,
  );
  upsertTrackedOrder(
    'sabor-da-villa',
    {
      trackingToken: 'tok-cancelled-333333',
      storeSlug: 'sabor-da-villa',
      orderNumber: 18,
      orderCode: '#0018',
      status: 'accepted',
      fulfillmentType: 'pickup',
      totalAmount: 18,
      createdAtMs: now - 120_000,
      updatedAtMs: now - 120_000,
    },
    storage,
    now,
  );

  // Enquanto o cliente estava fora, #0020 foi para ready, #0019 foi completed e #0018 cancelled
  const reconciled = await reconcileActiveTrackedOrders(
    'sabor-da-villa',
    async (tok) => {
      if (tok === 'tok-preparing-111111') {
        return makeTrackingOrder({
          storeSlug: 'sabor-da-villa',
          orderNumber: 20,
          orderCode: '#0020',
          status: 'ready',
        });
      }
      if (tok === 'tok-completed-222222') {
        return makeTrackingOrder({
          storeSlug: 'sabor-da-villa',
          orderNumber: 19,
          orderCode: '#0019',
          status: 'completed',
        });
      }
      if (tok === 'tok-cancelled-333333') {
        return makeTrackingOrder({
          storeSlug: 'sabor-da-villa',
          orderNumber: 18,
          orderCode: '#0018',
          status: 'cancelled',
          rejectionReason: 'Cliente solicitou cancelamento',
        });
      }
      return null;
    },
    storage,
    now,
  );

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].orderNumber, 20);
  assert.equal(reconciled[0].status, 'ready');

  // Verificar também remoção manual e falha transitória preservando cache
  upsertTrackedOrder(
    'sabor-da-villa',
    {
      trackingToken: 'tok-transient-444444',
      storeSlug: 'sabor-da-villa',
      orderNumber: 21,
      orderCode: '#0021',
      status: 'preparing',
      fulfillmentType: 'delivery',
      totalAmount: 50,
      createdAtMs: now,
      updatedAtMs: now,
    },
    storage,
    now,
  );

  const afterNetworkDrop = await reconcileActiveTrackedOrders(
    'sabor-da-villa',
    async () => {
      throw new Error('Offline');
    },
    storage,
    now,
  );
  assert.equal(afterNetworkDrop.length, 2);

  const afterManualRemoval = removeTrackedOrder(
    'sabor-da-villa',
    'tok-transient-444444',
    storage,
    now,
  );
  assert.equal(afterManualRemoval.length, 1);
});

test('Cenários 9 e 10: Isolamento estrito entre dois estabelecimentos com pedidos simultâneos', async () => {
  const storage = createMemoryStorage();
  const now = Date.now();

  assert.notEqual(
    buildActiveOrdersStorageKey('pizzaria-aurora'),
    buildActiveOrdersStorageKey('mgw-burger'),
  );

  upsertTrackedOrder(
    'pizzaria-aurora',
    {
      trackingToken: 'tok-aurora-aaaaaaa1',
      storeSlug: 'pizzaria-aurora',
      orderNumber: 7,
      orderCode: '#0007',
      status: 'preparing',
      fulfillmentType: 'delivery',
      totalAmount: 65,
      createdAtMs: now,
      updatedAtMs: now,
    },
    storage,
    now,
  );

  upsertTrackedOrder(
    'mgw-burger',
    {
      trackingToken: 'tok-mgw-bbbbbbbb2',
      storeSlug: 'mgw-burger',
      orderNumber: 14,
      orderCode: '#0014',
      status: 'out_for_delivery',
      fulfillmentType: 'delivery',
      totalAmount: 34,
      createdAtMs: now,
      updatedAtMs: now,
    },
    storage,
    now,
  );

  const auroraOrders = readActiveTrackedOrders('pizzaria-aurora', storage, now);
  const mgwOrders = readActiveTrackedOrders('mgw-burger', storage, now);
  assert.equal(auroraOrders.length, 1);
  assert.equal(auroraOrders[0].trackingToken, 'tok-aurora-aaaaaaa1');
  assert.equal(mgwOrders.length, 1);
  assert.equal(mgwOrders[0].trackingToken, 'tok-mgw-bbbbbbbb2');

  // Reconciliação rejeita token cuja loja retornada pelo servidor não corresponde ao slug atual
  const crossTenantCheck = await reconcileActiveTrackedOrders(
    'pizzaria-aurora',
    async () => makeTrackingOrder({ storeSlug: 'mgw-burger', status: 'preparing' }),
    storage,
    now,
  );
  assert.equal(crossTenantCheck.length, 0);
});

test('PublicOrderTrackingView renderiza design dark-gold com identidade da loja, linha do tempo real, previsão honesta, cancelamento e WhatsApp', () => {
  const order = makeTrackingOrder({
    storeName: 'Pizzaria Aurora',
    storeSlug: 'pizzaria-aurora',
    orderNumber: 14,
    status: 'preparing',
    fulfillmentType: 'delivery',
  });
  const menuPayload = makeStorePayload('pizzaria-aurora', 'Pizzaria Aurora');

  const timestamps = extractStepTimestamps(order);
  assert.ok(timestamps.received);
  assert.ok(timestamps.accepted);
  assert.ok(timestamps.preparing);

  const html = renderToStaticMarkup(
    createElement(PublicOrderTrackingView, {
      token: 'tok-aurora-order-14',
      onBackToMenu: () => {},
      initialOrder: order,
      initialStoreMenu: menuPayload,
    }),
  );

  assert.ok(html.includes('Pizzaria Aurora'));
  assert.ok(html.includes('https://cdn.example.com/pizzaria-aurora-logo.png'));
  assert.ok(html.includes('https://cdn.example.com/pizzaria-aurora-banner.jpg'));
  assert.ok(html.includes('https://cdn.example.com/pizzaria-aurora-combo1.jpg'));
  assert.ok(html.includes('Pedido #0014'));
  assert.ok(html.includes('data-testid="tracking-current-status"'));
  assert.ok(html.includes('Em preparação'));
  assert.ok(html.includes('Seu pedido está sendo preparado!'));
  assert.ok(html.includes('Agora'));
  assert.ok(html.includes('Atualização em andamento'));
  assert.ok(html.includes('Resumo do Pedido'));
  assert.ok(html.includes('Qtd: 1'));
  assert.ok(html.includes('Falar com o estabelecimento no WhatsApp'));
  assert.ok(html.includes(encodeURIComponent('pedido #0014')));
  assert.ok(html.includes('Você pode voltar aqui a qualquer momento para acompanhar seu pedido.'));
  assert.ok(html.includes('Voltar para o cardápio'));
  assert.ok(html.includes('data-testid="tracking-pix-card"'));
  assert.ok(!html.includes('MGW Burger'));

  // Estado cancelado exibe alerta dedicado e oculta stepper de entrega
  const cancelledHtml = renderToStaticMarkup(
    createElement(PublicOrderTrackingView, {
      token: 'tok-cancelled',
      onBackToMenu: () => {},
      initialOrder: makeTrackingOrder({
        status: 'cancelled',
        rejectionReason: 'Falta de ingrediente',
      }),
      initialStoreMenu: menuPayload,
    }),
  );
  assert.ok(cancelledHtml.includes('Pedido cancelado'));
  assert.ok(cancelledHtml.includes('Falta de ingrediente'));
  assert.ok(cancelledHtml.includes('Pedido encerrado'));

  // Estado retirada mostra endereço do estabelecimento e retirada no local
  const pickupHtml = renderToStaticMarkup(
    createElement(PublicOrderTrackingView, {
      token: 'tok-pickup',
      onBackToMenu: () => {},
      initialOrder: makeTrackingOrder({
        status: 'ready_for_pickup',
        fulfillmentType: 'pickup',
        storeAddress: 'Av. Brasil, 500',
        deliveryAddress: '',
      }),
      initialStoreMenu: menuPayload,
    }),
  );
  assert.ok(pickupHtml.includes('Seu pedido está disponível para retirada!'));
  assert.ok(pickupHtml.includes('Retirada no balcão'));
  assert.ok(pickupHtml.includes('Av. Brasil, 500'));
  assert.ok(pickupHtml.includes('O pedido será retirado diretamente no local.'));
});
