import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell.tsx';
import { DeliveryCustomersView } from '../components/DeliveryCustomersView.tsx';
import { DeliveryDashboardView } from '../components/DeliveryDashboardView.tsx';
import {
  buildDeliveryCustomerAddressPayloadForSupabase,
  buildDeliveryCustomerPayloadForSupabase,
  mapDeliveryCustomerAddressRow,
  mapDeliveryCustomerClassificationSettingsRow,
  mapDeliveryCustomerRow,
} from '../services/supabaseMappers.ts';
import type {
  DeliveryCustomerAddressRecord,
  DeliveryCustomerClassificationConfig,
  DeliveryCustomerRecord,
  DigitalMenuSettings,
  OnlineOrderRecord,
  TenantContext,
} from '../types/finance.ts';
import {
  classifyDeliveryCustomer,
  computeDeliveryCustomersKpis,
  DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
  enrichDeliveryCustomersWithMetrics,
  filterAndSortDeliveryCustomers,
  findDuplicateCustomerByPhone,
  formatCepBR,
  formatCustomerPhoneBR,
  formatPhoneMaskInput,
  isValidCustomerPhone,
  isValidOptionalCpf,
  normalizeClassificationConfig,
  normalizeCustomerPhone,
  paginateDeliveryCustomers,
} from './deliveryCustomers.ts';
import { computeDeliveryDashboardSummary } from './deliveryDashboard.ts';
import { getLocalTodayDate } from './finance.ts';
import { DEFAULT_DIGITAL_MENU_SETTINGS } from './onlineOrders.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function makeCustomer(
  overrides: Partial<DeliveryCustomerRecord> & { id: string; name: string; phone: string },
): DeliveryCustomerRecord {
  return {
    tenantId: 'tenant-a',
    normalizedPhone: normalizeCustomerPhone(overrides.phone),
    email: '',
    cpf: '',
    birthDate: null,
    notes: '',
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function makeAddress(
  overrides: Partial<DeliveryCustomerAddressRecord> & {
    id: string;
    customerId: string;
    street: string;
  },
): DeliveryCustomerAddressRecord {
  return {
    tenantId: 'tenant-a',
    label: 'Casa',
    cep: '69000-000',
    number: '100',
    neighborhood: 'Centro',
    complement: '',
    reference: '',
    city: 'Manaus',
    state: 'AM',
    isPrimary: true,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function makeOrder(
  overrides: Partial<OnlineOrderRecord> & {
    id: string;
    orderNumber: number;
    customerName: string;
    customerPhone: string;
    totalAmount: number;
    createdAtMs: number;
  },
): OnlineOrderRecord {
  return {
    tenantId: 'tenant-a',
    customerId: null,
    orderCode: `#${String(overrides.orderNumber).padStart(4, '0')}`,
    tokenHash: `hash-${overrides.id}`,
    status: 'completed',
    fulfillmentType: 'delivery',
    deliveryAddress: 'Rua Principal, 100',
    deliveryReference: '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: Math.max(0, overrides.totalAmount - 5),
    deliveryFee: 5,
    rejectionReason: '',
    viewedAtMs: overrides.createdAtMs,
    acceptedAtMs: overrides.createdAtMs,
    preparingAtMs: overrides.createdAtMs,
    readyAtMs: overrides.createdAtMs,
    dispatchedAtMs: overrides.createdAtMs,
    completedAtMs: overrides.createdAtMs,
    cancelledAtMs: null,
    saleId: null,
    updatedAtMs: overrides.createdAtMs,
    items: [
      {
        id: `${overrides.id}-item-1`,
        itemKind: 'combo',
        refId: 'combo-1',
        itemName: 'COMBO 1',
        quantity: 1,
        unitPrice: overrides.totalAmount,
        lineTotal: overrides.totalAmount,
        estimatedUnitCost: 12,
        xSaladasPerUnit: 1,
        components: [],
        selectedAddons: [],
        itemNote: '',
      },
    ],
    statusHistory: [],
    ...overrides,
  };
}

test('1. Phone normalization, masking, formatting, CEP and optional CPF validation', () => {
  assert.equal(normalizeCustomerPhone('(92) 98111-2510'), '5592981112510');
  assert.equal(normalizeCustomerPhone('+55 92 98111-2510'), '5592981112510');
  assert.equal(normalizeCustomerPhone('9232345678'), '559232345678');
  assert.equal(formatCustomerPhoneBR('5592981112510'), '(92) 98111-2510');
  assert.equal(formatCustomerPhoneBR('9232345678'), '(92) 3234-5678');
  assert.equal(formatPhoneMaskInput('92981112510'), '(92) 98111-2510');
  assert.equal(formatCepBR('69055010'), '69055-010');

  assert.equal(isValidCustomerPhone('(92) 98111-2510'), true);
  assert.equal(isValidCustomerPhone('12345'), false);

  assert.equal(isValidOptionalCpf(''), true);
  assert.equal(isValidOptionalCpf('52998224725'), true);
  assert.equal(isValidOptionalCpf('11111111111'), false);
  assert.equal(isValidOptionalCpf('12345678900'), false);
});

test('2. Manual customer validation, duplicate phone prevention, and Supabase mapper roundtrip', () => {
  const existing = [
    makeCustomer({
      id: 'c1',
      name: 'Maria Oliveira',
      phone: '(92) 99123-4567',
    }),
  ];

  // Mesmo número em outro formato deve acusar duplicidade no tenant
  const dup = findDuplicateCustomerByPhone(existing, '5592991234567');
  assert.equal(dup?.id, 'c1');
  // Na edição do próprio registro, não deve bloquear
  assert.equal(findDuplicateCustomerByPhone(existing, '5592991234567', 'c1'), null);

  assert.throws(() =>
    buildDeliveryCustomerPayloadForSupabase({
      name: 'A',
      phone: '(92) 99123-4567',
    }),
  );
  assert.throws(() =>
    buildDeliveryCustomerPayloadForSupabase({
      name: 'Ana Silva',
      phone: '(92) 99123-4567',
      cpf: '111.111.111-11',
    }),
  );

  const payload = buildDeliveryCustomerPayloadForSupabase({
    name: 'Carlos Eduardo',
    phone: '(92) 99888-7766',
    email: 'CARLOS@EXAMPLE.COM',
    cpf: '529.982.247-25',
    birthDate: '1994-05-12',
    notes: 'Sem cebola',
  });
  assert.equal(payload.normalized_phone, '5592998887766');
  assert.equal(payload.email, 'carlos@example.com');
  assert.equal(payload.cpf, '52998224725');

  const mapped = mapDeliveryCustomerRow({
    id: 'c2',
    tenant_id: 'tenant-a',
    name: payload.name,
    phone: payload.phone,
    normalized_phone: payload.normalized_phone,
    email: payload.email,
    cpf: payload.cpf,
    birth_date: payload.birth_date,
    notes: payload.notes,
    created_at: '2026-11-20T12:00:00.000Z',
    updated_at: '2026-11-21T12:00:00.000Z',
  });
  assert.equal(mapped.name, 'Carlos Eduardo');
  assert.equal(mapped.normalizedPhone, '5592998887766');
  assert.equal(mapped.birthDate, '1994-05-12');

  const addrPayload = buildDeliveryCustomerAddressPayloadForSupabase({
    label: 'Trabalho',
    cep: '69055010',
    street: 'Av. Djalma Batista',
    number: '1200',
    neighborhood: 'Chapada',
    complement: 'Sala 4',
    reference: 'Em frente ao shopping',
    city: 'Manaus',
    state: 'am',
    isPrimary: true,
  });
  assert.equal(addrPayload.cep, '69055-010');
  assert.equal(addrPayload.state, 'AM');

  const mappedAddr = mapDeliveryCustomerAddressRow({
    id: 'a1',
    tenant_id: 'tenant-a',
    customer_id: 'c2',
    ...addrPayload,
    created_at: '2026-11-20T12:00:00.000Z',
    updated_at: '2026-11-20T12:00:00.000Z',
  });
  assert.equal(mappedAddr.isPrimary, true);
  assert.equal(mappedAddr.state, 'AM');

  const mappedCfg = mapDeliveryCustomerClassificationSettingsRow({
    tenant_id: 'tenant-a',
    recurring_min_orders: 4,
    vip_min_orders: 8,
    vip_min_spent: 450,
    inactive_days: 60,
  });
  assert.deepEqual(mappedCfg, {
    recurringMinOrders: 4,
    vipMinOrders: 8,
    vipMinSpent: 450,
    inactiveDays: 60,
  });
});

test('3. Auto-identification by phone, purchase history exclusion of cancelled/rejected, deduplication, and multi-address primary handling', () => {
  const nowMs = Date.UTC(2026, 10, 24, 15, 0, 0);
  const cust1 = makeCustomer({
    id: 'c1',
    name: 'João Santos',
    phone: '92991000001',
    createdAtMs: nowMs - 20 * DAY_MS,
  });
  const cust2 = makeCustomer({
    id: 'c2',
    name: 'Ana Costa',
    phone: '(92) 99100-0002',
    createdAtMs: nowMs - 60 * DAY_MS,
  });

  const addresses: DeliveryCustomerAddressRecord[] = [
    makeAddress({
      id: 'a1',
      customerId: 'c1',
      label: 'Casa',
      street: 'Rua Antiga',
      number: '10',
      isPrimary: false,
      createdAtMs: nowMs - 20 * DAY_MS,
    }),
    makeAddress({
      id: 'a2',
      customerId: 'c1',
      label: 'Trabalho',
      street: 'Av. Nova',
      number: '500',
      isPrimary: true,
      createdAtMs: nowMs - 5 * DAY_MS,
    }),
  ];

  // Pedidos: 1 vinculado por customerId, 2 vinculados pelo mesmo telefone normalizado,
  // 1 cancelado e 1 recusado que NAO devem entrar nos totais, mais um duplicado no array
  const validOrd1 = makeOrder({
    id: 'o1',
    orderNumber: 1,
    customerId: 'c1',
    customerName: 'João S.',
    customerPhone: '5592991000001',
    deliveryAddress: 'Rua Antiga, 10', // snapshot histórico preservado
    totalAmount: 45,
    createdAtMs: nowMs - 10 * DAY_MS,
  });
  const validOrd2 = makeOrder({
    id: 'o2',
    orderNumber: 2,
    customerId: null,
    customerName: 'João Santos',
    customerPhone: '(92) 99100-0001',
    deliveryAddress: 'Av. Nova, 500',
    totalAmount: 55,
    createdAtMs: nowMs - 2 * DAY_MS,
  });
  const validOrd3 = makeOrder({
    id: 'o3',
    orderNumber: 3,
    customerId: 'c1',
    customerName: 'João Santos',
    customerPhone: '92991000001',
    totalAmount: 50,
    createdAtMs: nowMs - 1 * DAY_MS,
  });
  const cancelledOrd = makeOrder({
    id: 'o4',
    orderNumber: 4,
    customerId: 'c1',
    customerName: 'João Santos',
    customerPhone: '92991000001',
    status: 'cancelled',
    totalAmount: 250,
    createdAtMs: nowMs - 5000,
  });
  const rejectedOrd = makeOrder({
    id: 'o5',
    orderNumber: 5,
    customerId: 'c1',
    customerName: 'João Santos',
    customerPhone: '92991000001',
    status: 'rejected',
    totalAmount: 199,
    createdAtMs: nowMs - 3000,
  });
  const oldAnaOrder = makeOrder({
    id: 'o6',
    orderNumber: 6,
    customerId: 'c2',
    customerName: 'Ana Costa',
    customerPhone: '92991000002',
    totalAmount: 350, // seria VIP pelo valor, mas está inativa há 50 dias
    createdAtMs: nowMs - 50 * DAY_MS,
  });

  const enriched = enrichDeliveryCustomersWithMetrics(
    [cust1, cust2],
    addresses,
    [validOrd1, validOrd2, validOrd2, validOrd3, cancelledOrd, rejectedOrd, oldAnaOrder],
    DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
    nowMs,
  );

  const joao = enriched.find((x) => x.customer.id === 'c1')!;
  assert.equal(joao.validOrdersCount, 3);
  assert.equal(joao.cancelledOrdersCount, 2);
  assert.equal(joao.orders.length, 5); // histórico completo deduplicado
  assert.equal(joao.totalSpent, 150);
  assert.equal(joao.averageTicket, 50);
  assert.equal(joao.firstOrderAtMs, nowMs - 10 * DAY_MS);
  assert.equal(joao.lastOrderAtMs, nowMs - 1 * DAY_MS);
  assert.equal(joao.classification, 'recurring');
  assert.equal(joao.primaryAddress?.id, 'a2');
  // Trocar endereço principal não altera o endereço histórico do pedido o1
  assert.equal(joao.orders.find((o) => o.id === 'o1')?.deliveryAddress, 'Rua Antiga, 10');

  // Ana comprou R$ 350 há 50 dias -> inativa prevalece sobre VIP
  const ana = enriched.find((x) => x.customer.id === 'c2')!;
  assert.equal(ana.classification, 'inactive');

  const kpis = computeDeliveryCustomersKpis(enriched);
  assert.equal(kpis.totalCustomers, 2);
  assert.equal(kpis.newCustomers, 0);
  assert.equal(kpis.recurringCustomers, 1);
  assert.equal(kpis.inactiveCustomers, 1);
});

test('4. Classification precedence & custom criteria configuration', () => {
  const nowMs = Date.UTC(2026, 10, 24, 15, 0, 0);
  const customCfg: DeliveryCustomerClassificationConfig = normalizeClassificationConfig({
    recurringMinOrders: 2,
    vipMinOrders: 4,
    vipMinSpent: 200,
    inactiveDays: 30,
  });

  assert.equal(
    classifyDeliveryCustomer({
      validOrdersCount: 0,
      totalSpent: 0,
      lastOrderAtMs: null,
      nowMs,
      config: customCfg,
    }),
    'new',
  );
  assert.equal(
    classifyDeliveryCustomer({
      validOrdersCount: 1,
      totalSpent: 50,
      lastOrderAtMs: nowMs - 5 * DAY_MS,
      nowMs,
      config: customCfg,
    }),
    'new',
  );
  assert.equal(
    classifyDeliveryCustomer({
      validOrdersCount: 2,
      totalSpent: 90,
      lastOrderAtMs: nowMs - 5 * DAY_MS,
      nowMs,
      config: customCfg,
    }),
    'recurring',
  );
  assert.equal(
    classifyDeliveryCustomer({
      validOrdersCount: 1,
      totalSpent: 220,
      lastOrderAtMs: nowMs - 5 * DAY_MS,
      nowMs,
      config: customCfg,
    }),
    'vip',
  );
  assert.equal(
    classifyDeliveryCustomer({
      validOrdersCount: 10,
      totalSpent: 900,
      lastOrderAtMs: nowMs - 31 * DAY_MS,
      nowMs,
      config: customCfg,
    }),
    'inactive',
  );
});

test('5. Search (name, partial phone, formatted phone), filter, sort, and pagination', () => {
  const nowMs = Date.UTC(2026, 10, 24, 15, 0, 0);
  const list = enrichDeliveryCustomersWithMetrics(
    [
      makeCustomer({ id: 'c1', name: 'Bruna Lima', phone: '(92) 98111-0001', createdAtMs: nowMs - 1000 }),
      makeCustomer({ id: 'c2', name: 'Alberto Souza', phone: '(92) 98222-0002', createdAtMs: nowMs - 5000 }),
      makeCustomer({ id: 'c3', name: 'Carla Mendes', phone: '(92) 98333-0003', createdAtMs: nowMs - 2000 }),
    ],
    [],
    [
      makeOrder({ id: 'o1', orderNumber: 1, customerId: 'c2', customerName: 'Alberto', customerPhone: '92982220002', totalAmount: 30, createdAtMs: nowMs - 100 }),
      makeOrder({ id: 'o2', orderNumber: 2, customerId: 'c2', customerName: 'Alberto', customerPhone: '92982220002', totalAmount: 30, createdAtMs: nowMs - 90 }),
      makeOrder({ id: 'o3', orderNumber: 3, customerId: 'c2', customerName: 'Alberto', customerPhone: '92982220002', totalAmount: 30, createdAtMs: nowMs - 80 }),
      makeOrder({ id: 'o4', orderNumber: 4, customerId: 'c1', customerName: 'Bruna', customerPhone: '92981110001', totalAmount: 20, createdAtMs: nowMs - 10 }),
    ],
    DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
    nowMs,
  );

  // Busca por nome
  assert.deepEqual(
    filterAndSortDeliveryCustomers(list, {
      searchQuery: 'alberto',
      classificationFilter: 'all',
      sortBy: 'name',
    }).map((i) => i.customer.id),
    ['c2'],
  );

  // Busca por telefone formatado ou só dígitos
  assert.deepEqual(
    filterAndSortDeliveryCustomers(list, {
      searchQuery: '(92) 98333',
      classificationFilter: 'all',
      sortBy: 'name',
    }).map((i) => i.customer.id),
    ['c3'],
  );

  // Ordenação alfabética
  assert.deepEqual(
    filterAndSortDeliveryCustomers(list, {
      searchQuery: '',
      classificationFilter: 'all',
      sortBy: 'name',
    }).map((i) => i.customer.id),
    ['c2', 'c1', 'c3'],
  );

  // Ordenação por maior número de pedidos
  assert.deepEqual(
    filterAndSortDeliveryCustomers(list, {
      searchQuery: '',
      classificationFilter: 'all',
      sortBy: 'ordersCount',
    }).map((i) => i.customer.id),
    ['c2', 'c1', 'c3'],
  );

  // Filtro por recorrentes
  assert.deepEqual(
    filterAndSortDeliveryCustomers(list, {
      searchQuery: '',
      classificationFilter: 'recurring',
      sortBy: 'lastPurchase',
    }).map((i) => i.customer.id),
    ['c2'],
  );

  // Paginação determinística
  const page2 = paginateDeliveryCustomers(['a', 'b', 'c', 'd', 'e'], 2, 2);
  assert.deepEqual(page2.items, ['c', 'd']);
  assert.equal(page2.totalPages, 3);
  assert.equal(page2.currentPage, 2);
});

test('6. Strict multi-tenant isolation: identical phones across different tenants never merge', () => {
  const nowMs = Date.UTC(2026, 10, 24, 15, 0, 0);
  const custA = makeCustomer({
    id: 'ca',
    tenantId: 'tenant-a',
    name: 'Cliente Loja A',
    phone: '92999990000',
  });
  const custB = makeCustomer({
    id: 'cb',
    tenantId: 'tenant-b',
    name: 'Cliente Loja B',
    phone: '92999990000',
  });
  const ordA = makeOrder({
    id: 'oa',
    tenantId: 'tenant-a',
    customerId: 'ca',
    orderNumber: 1,
    customerName: 'Cliente Loja A',
    customerPhone: '92999990000',
    totalAmount: 75,
    createdAtMs: nowMs - 1000,
  });
  const ordB = makeOrder({
    id: 'ob',
    tenantId: 'tenant-b',
    customerId: null, // mesmo sem customerId, só deve vincular no tenant-b
    orderNumber: 1,
    customerName: 'Cliente Loja B',
    customerPhone: '92999990000',
    totalAmount: 120,
    createdAtMs: nowMs - 500,
  });

  const tenantAEnriched = enrichDeliveryCustomersWithMetrics([custA], [], [ordA, ordB]);
  assert.equal(tenantAEnriched[0].validOrdersCount, 1);
  assert.equal(tenantAEnriched[0].totalSpent, 75);

  const tenantBEnriched = enrichDeliveryCustomersWithMetrics([custB], [], [ordA, ordB]);
  assert.equal(tenantBEnriched[0].validOrdersCount, 1);
  assert.equal(tenantBEnriched[0].totalSpent, 120);
});

test('7. SQL migration security, RLS, unique constraints, and atomic checkout integration invariants', () => {
  const sql = readFileSync(
    'supabase/migrations/20261124150000_delivery_customers_module.sql',
    'utf8',
  );

  // Tabelas, índices e coluna customer_id
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_customers/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_customer_addresses/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_customer_classification_settings/);
  assert.match(sql, /uniq_delivery_customers_tenant_phone/);
  assert.match(sql, /ON public\.delivery_customers \(tenant_id, normalized_phone\)/);
  assert.match(sql, /uniq_delivery_customer_primary_address/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public\.delivery_customers\(id\)/);

  // RLS e bloqueio completo de anon
  assert.match(sql, /ALTER TABLE public\.delivery_customers ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.delivery_customers FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.delivery_customer_addresses FROM PUBLIC, anon/);
  assert.match(sql, /public\.has_active_tenant_access\(tenant_id\)/);
  assert.match(sql, /public\.has_tenant_role\(tenant_id, ARRAY\['owner', 'admin', 'manager'\]\)/);

  // Concorrência segura no upsert e preservação de create_public_online_order
  assert.match(sql, /ON CONFLICT \(tenant_id, normalized_phone\) DO UPDATE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.upsert_delivery_customer_from_order\(.*\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /public\.is_tenant_billing_active\(v_menu\.tenant_id\)/);
  assert.match(sql, /v_customer_id := public\.upsert_delivery_customer_from_order\(/);
  assert.match(sql, /'customerId',\s*v_customer_id/);
});

test('8. SSR integration: AppShell navigation, DeliveryDashboardView KPI link, and DeliveryCustomersView desktop/mobile rendering', () => {
  const shellHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'delivery_customers',
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
      children: createElement('div', null, 'Clientes Route'),
    }),
  );
  assert.match(shellHtml, /MGW DELIVERY/);
  assert.match(shellHtml, /Clientes/);
  assert.match(shellHtml, /aria-current="page"/);

  const staffShellHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'dashboard',
      activeSettingsTab: 'shop',
      onNavigate: () => {},
      canViewDashboard: true,
      canAccessDelivery: false,
      canReadSales: false,
      canCreateSales: true,
      canReadExpenses: false,
      canCreateExpenses: false,
      canViewReports: false,
      canAccessSettingsRoute: false,
      canWriteSettings: false,
      unviewedOrdersCount: 0,
      activeTenant: { ...baseTenant, role: 'staff' },
      tenants: [{ ...baseTenant, role: 'staff' }],
      establishmentName: 'MGW Burger',
      userEmail: 'staff@mgw.com',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Staff Route'),
    }),
  );
  assert.doesNotMatch(staffShellHtml, /MGW DELIVERY/);

  const customers = [
    makeCustomer({ id: 'c1', name: 'Lucas Ferreira', phone: '(92) 99123-1111' }),
    makeCustomer({ id: 'c2', name: 'Juliana Alves', phone: '(92) 99123-2222' }),
  ];
  const addresses = [
    makeAddress({ id: 'a1', customerId: 'c1', street: 'Rua das Acácias', number: '45' }),
  ];
  const orders = [
    makeOrder({
      id: 'o1',
      orderNumber: 12,
      customerId: 'c1',
      customerName: 'Lucas Ferreira',
      customerPhone: '92991231111',
      totalAmount: 68.5,
      createdAtMs: Date.now() - 3600_000,
    }),
  ];

  const today = getLocalTodayDate();
  const dashSummary = computeDeliveryDashboardSummary([], baseMenuSettings, today, 8, customers);
  assert.equal(dashSummary.registeredCustomersCount, 2);

  const dashHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Burger',
      orders,
      customers,
      digitalMenuSettings: baseMenuSettings,
      onOpenCustomers: () => {},
    }),
  );
  assert.match(dashHtml, /Ver carteira de clientes/);
  assert.match(dashHtml, /2 cliente\(s\) cadastrado\(s\)/);

  const customersHtml = renderToStaticMarkup(
    createElement(DeliveryCustomersView, {
      establishmentName: 'MGW Burger',
      customers,
      addresses,
      orders,
      classificationConfig: DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
      digitalMenuSettings: baseMenuSettings,
      onCreateCustomer: async () => 'c3',
      onUpdateCustomer: async () => {},
      onSaveAddress: async () => {},
      onDeleteAddress: async () => {},
      onSetPrimaryAddress: async () => {},
      onSaveClassificationConfig: async () => {},
      onMarkOrderViewed: async () => {},
      onTransitionOrderStatus: async () => {},
    }),
  );

  assert.match(customersHtml, /Total de clientes cadastrados/);
  assert.match(customersHtml, /Clientes novos/);
  assert.match(customersHtml, /Clientes recorrentes/);
  assert.match(customersHtml, /Clientes inativos/);
  assert.match(customersHtml, /Lucas Ferreira/);
  assert.match(customersHtml, /Juliana Alves/);
  assert.match(customersHtml, /Rua das Acácias/);
  assert.match(customersHtml, /\+ Novo cliente/);

  const emptyCustomersHtml = renderToStaticMarkup(
    createElement(DeliveryCustomersView, {
      establishmentName: 'MGW Burger',
      customers: [],
      addresses: [],
      orders: [],
      classificationConfig: DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
      digitalMenuSettings: baseMenuSettings,
      onCreateCustomer: async () => 'c-new',
      onUpdateCustomer: async () => {},
      onSaveAddress: async () => {},
      onDeleteAddress: async () => {},
      onSetPrimaryAddress: async () => {},
      onSaveClassificationConfig: async () => {},
      onMarkOrderViewed: async () => {},
      onTransitionOrderStatus: async () => {},
    }),
  );
  assert.match(emptyCustomersHtml, /Nenhum cliente cadastrado ainda/);
});
