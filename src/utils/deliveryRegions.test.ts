import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell.tsx';
import { DeliveryDashboardView } from '../components/DeliveryDashboardView.tsx';
import { DeliveryRegionsView } from '../components/DeliveryRegionsView.tsx';
import { PublicMenuView } from '../components/PublicMenuView.tsx';
import type {
  DeliveryPricingSettings,
  DeliveryRegionRecord,
  DigitalMenuSettings,
  OnlineOrderRecord,
  PublicDigitalMenuPayload,
  TenantContext,
} from '../types/finance.ts';
import {
  buildCityRegionsHierarchy,
  computeDeliveryRegionsKpis,
  DEFAULT_DELIVERY_PRICING_SETTINGS,
  formatDeliveryFeeRuleLabel,
  formatRegionScheduleSummary,
  getPublicServedNeighborhoodOptions,
  isDeliveryRegionOpenAtTime,
  normalizeDeliveryGeoText,
  parseNeighborhoodListInput,
  resolveDeliveryCoverageAndFee,
  validateDeliveryPricingSettingsInput,
  validateDeliveryRegionInput,
} from './deliveryRegions.ts';
import {
  computeCartSummary,
  DEFAULT_DIGITAL_MENU_SETTINGS,
  validateCheckoutPayload,
} from './onlineOrders.ts';

const baseTenant: TenantContext = {
  tenantId: 'tenant-1',
  slug: 'mgw-lanches',
  name: 'MGW Lanches',
  role: 'owner',
  isFounderAccount: true,
  billingExempt: true,
  subscriptionStatus: 'exempt',
  graceUntil: null,
  onboardingCompleted: true,
  accessAllowed: true,
};

const baseMenuSettings: DigitalMenuSettings = {
  tenantId: 'tenant-1',
  ...DEFAULT_DIGITAL_MENU_SETTINGS,
  slug: 'mgw-lanches',
  storeName: 'MGW Lanches',
  deliveryFee: 6,
  minimumOrderAmount: 20,
  acceptsDelivery: true,
  acceptsPickup: true,
  isActive: true,
  isOpen: true,
};

const basePricing: DeliveryPricingSettings = {
  tenantId: 'tenant-1',
  ...DEFAULT_DELIVERY_PRICING_SETTINGS,
  pricingMode: 'by_neighborhood',
  defaultFeeEnabled: false,
  defaultDeliveryFee: 8,
  defaultMinimumOrderAmount: 20,
  defaultEstimatedTime: '40 - 55 min',
  freeDeliveryEnabled: true,
  freeDeliveryMinAmount: 100,
};

function makeRegion(
  overrides: Partial<DeliveryRegionRecord> = {},
): DeliveryRegionRecord {
  return {
    id: 'reg-1',
    tenantId: 'tenant-1',
    name: 'Zona Centro',
    city: 'Manaus',
    neighborhoods: ['Centro', 'Nossa Senhora das Graças'],
    description: 'Entrega expressa central',
    deliveryFee: 5,
    minimumOrderAmount: 25,
    estimatedTime: '25 - 35 min',
    status: 'active',
    isTemporarilySuspended: false,
    suspensionReason: '',
    scheduleEnabled: false,
    scheduleDays: [0, 1, 2, 3, 4, 5, 6],
    scheduleStart: '18:00',
    scheduleEnd: '23:30',
    notes: '',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
    ...overrides,
  };
}

function makeOrder(
  overrides: Partial<OnlineOrderRecord> = {},
): OnlineOrderRecord {
  return {
    id: 'ord-1',
    tenantId: 'tenant-1',
    orderNumber: 15,
    orderCode: '#0015',
    tokenHash: 'tok-1',
    status: 'received',
    fulfillmentType: 'delivery',
    customerName: 'Maria Souza',
    customerPhone: '92999990001',
    deliveryAddress: 'Av. Eduardo Ribeiro, 100',
    deliveryReference: 'Ao lado do teatro',
    deliveryRegionId: 'reg-1',
    deliveryRegionName: 'Zona Centro',
    deliveryNeighborhood: 'Centro',
    deliveryCity: 'Manaus',
    deliveryBaseFee: 5,
    deliveryFeeRule: 'neighborhood',
    deliveryMinimumOrderApplied: 25,
    deliveryFreeApplied: false,
    deliveryFreeThresholdApplied: 100,
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: 60,
    deliveryFee: 5,
    totalAmount: 65,
    rejectionReason: '',
    viewedAtMs: null,
    acceptedAtMs: null,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs: null,
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    items: [],
    statusHistory: [],
    ...overrides,
  };
}

test('geo normalization and neighborhood list parsing remove accents, duplicates, and noise', () => {
  assert.equal(normalizeDeliveryGeoText('  São   José dos Campos '), 'sao jose dos campos');
  assert.deepEqual(
    parseNeighborhoodListInput('Centro, São José; centro\n  Cidade Nova , A, sao jose'),
    ['Centro', 'São José', 'Cidade Nova'],
  );
});

test('validateDeliveryRegionInput blocks duplicate neighborhoods in same city and validates rules', () => {
  const existing = [
    makeRegion({ id: 'reg-1', name: 'Centro Expandido', city: 'Manaus', neighborhoods: ['Centro', 'Praça 14'] }),
  ];

  const dupSameCity = validateDeliveryRegionInput(
    {
      name: 'Nova Região',
      city: 'manaus',
      neighborhoods: ['centro', 'Adrianópolis'],
      description: '',
      deliveryFee: 7,
      minimumOrderAmount: 20,
      estimatedTime: '30 min',
      status: 'active',
      isTemporarilySuspended: false,
      suspensionReason: '',
      scheduleEnabled: false,
      scheduleDays: [0, 1, 2, 3, 4, 5, 6],
      scheduleStart: '18:00',
      scheduleEnd: '23:00',
      notes: '',
    },
    existing,
  );
  assert.equal(dupSameCity.valid, false);
  assert.match(dupSameCity.error || '', /já está cadastrado/i);

  // Mesmo nome de bairro em outro município deve ser permitido
  const diffCity = validateDeliveryRegionInput(
    {
      name: 'Centro Iranduba',
      city: 'Iranduba',
      neighborhoods: ['Centro'],
      description: '',
      deliveryFee: 12,
      minimumOrderAmount: 30,
      estimatedTime: '45 min',
      status: 'active',
      isTemporarilySuspended: false,
      suspensionReason: '',
      scheduleEnabled: false,
      scheduleDays: [0, 1, 2, 3, 4, 5, 6],
      scheduleStart: '18:00',
      scheduleEnd: '23:00',
      notes: '',
    },
    existing,
  );
  assert.equal(diffCity.valid, true);

  // Edição da própria região não bloqueia seus próprios bairros
  const editSameRegion = validateDeliveryRegionInput(
    {
      name: 'Centro Atualizado',
      city: 'Manaus',
      neighborhoods: ['Centro', 'Praça 14'],
      description: '',
      deliveryFee: 6,
      minimumOrderAmount: 20,
      estimatedTime: '30 min',
      status: 'active',
      isTemporarilySuspended: false,
      suspensionReason: '',
      scheduleEnabled: false,
      scheduleDays: [0, 1, 2, 3, 4, 5, 6],
      scheduleStart: '18:00',
      scheduleEnd: '23:00',
      notes: '',
    },
    existing,
    'reg-1',
  );
  assert.equal(editSameRegion.valid, true);

  // Validação de configurações gerais
  assert.equal(
    validateDeliveryPricingSettingsInput({
      ...basePricing,
      freeDeliveryEnabled: true,
      freeDeliveryMinAmount: 0,
    }).valid,
    false,
  );
  assert.equal(validateDeliveryPricingSettingsInput(basePricing).valid, true);
});

test('isDeliveryRegionOpenAtTime supports daytime and overnight schedules with timezone', () => {
  const overnightRegion = makeRegion({
    scheduleEnabled: true,
    scheduleDays: [5, 6], // Sexta e Sábado
    scheduleStart: '18:00',
    scheduleEnd: '02:00',
  });

  // Sexta 20:00 America/Manaus (-04:00) => 2026-11-28T00:00:00Z é sexta 20:00 Manaus
  const fridayNight = new Date('2026-11-28T00:00:00Z');
  assert.equal(
    isDeliveryRegionOpenAtTime(overnightRegion, fridayNight, 'America/Manaus'),
    true,
  );

  // Domingo 01:30 America/Manaus => pertencente à janela de Sábado 18:00-02:00
  const sundayEarlyMorning = new Date('2026-11-29T05:30:00Z');
  assert.equal(
    isDeliveryRegionOpenAtTime(overnightRegion, sundayEarlyMorning, 'America/Manaus'),
    true,
  );

  // Domingo 10:00 America/Manaus => fechado
  const sundayMorning = new Date('2026-11-29T14:00:00Z');
  assert.equal(
    isDeliveryRegionOpenAtTime(overnightRegion, sundayMorning, 'America/Manaus'),
    false,
  );

  assert.match(formatRegionScheduleSummary(overnightRegion), /Sex, Sáb · 18:00 às 02:00/);
});

test('resolveDeliveryCoverageAndFee enforces region fee, free delivery, schedule, suspension, and fallback', () => {
  const regions: DeliveryRegionRecord[] = [
    makeRegion({
      id: 'reg-centro',
      name: 'Centro',
      city: 'Manaus',
      neighborhoods: ['Centro', 'Aparecida'],
      deliveryFee: 5,
      minimumOrderAmount: 25,
      estimatedTime: '25 - 35 min',
    }),
    makeRegion({
      id: 'reg-suspensa',
      name: 'Zona Leste',
      city: 'Manaus',
      neighborhoods: ['Coroado'],
      deliveryFee: 9,
      isTemporarilySuspended: true,
      suspensionReason: 'Chuva intensa',
    }),
    makeRegion({
      id: 'reg-inativa',
      name: 'Distrito',
      city: 'Manaus',
      neighborhoods: ['Distrito Industrial'],
      deliveryFee: 12,
      status: 'inactive',
    }),
    makeRegion({
      id: 'reg-horario',
      name: 'Ponta Negra',
      city: 'Manaus',
      neighborhoods: ['Ponta Negra'],
      deliveryFee: 15,
      scheduleEnabled: true,
      scheduleDays: [0, 1, 2, 3, 4, 5, 6],
      scheduleStart: '18:00',
      scheduleEnd: '22:00',
    }),
  ];

  // 1) Retirada no balcão
  const pickup = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'pickup',
    subtotal: 40,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
  });
  assert.equal(pickup.available, true);
  assert.equal(pickup.appliedDeliveryFee, 0);
  assert.equal(pickup.feeRule, 'pickup');

  // 2) Bairro atendido abaixo do frete grátis (subtotal 60 < 100)
  const matched = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    neighborhood: 'aparecida',
    subtotal: 60,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
  });
  assert.equal(matched.available, true);
  assert.equal(matched.appliedDeliveryFee, 5);
  assert.equal(matched.minimumOrderAmount, 25);
  assert.equal(matched.freeDeliveryApplied, false);
  assert.equal(matched.missingForFreeDelivery, 40);
  assert.equal(matched.feeRule, 'neighborhood');

  // 3) Mesmo bairro atingindo entrega grátis (>= 100)
  const freeMatched = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    address: 'Rua 10 de Julho, 50 - Centro',
    subtotal: 120,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
  });
  assert.equal(freeMatched.available, true);
  assert.equal(freeMatched.matchedRegion?.id, 'reg-centro');
  assert.equal(freeMatched.baseDeliveryFee, 5);
  assert.equal(freeMatched.appliedDeliveryFee, 0);
  assert.equal(freeMatched.freeDeliveryApplied, true);

  // 4) Região suspensa bloqueia entrega
  const suspended = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    neighborhood: 'Coroado',
    subtotal: 80,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
  });
  assert.equal(suspended.available, false);
  assert.equal(suspended.reasonCode, 'region_suspended');
  assert.match(suspended.message, /Chuva intensa/);

  // 5) Região inativa bloqueia entrega
  const inactive = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    neighborhood: 'Distrito Industrial',
    subtotal: 80,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
  });
  assert.equal(inactive.available, false);
  assert.equal(inactive.reasonCode, 'region_inactive');

  // 6) Região fora do horário bloqueia entrega
  const noonManaus = new Date('2026-11-27T16:00:00Z'); // 12:00 Manaus
  const outsideHours = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    neighborhood: 'Ponta Negra',
    subtotal: 80,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
    timezone: 'America/Manaus',
    nowDate: noonManaus,
  });
  assert.equal(outsideHours.available, false);
  assert.equal(outsideHours.reasonCode, 'outside_schedule');

  // 7) Fora de cobertura sem fallback vs com fallback padrão
  const outsideStrict = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    neighborhood: 'Tarumã',
    subtotal: 50,
    menuSettings: baseMenuSettings,
    pricingSettings: basePricing,
    regions,
  });
  assert.equal(outsideStrict.available, false);
  assert.equal(outsideStrict.reasonCode, 'outside_coverage');

  const outsideFallback = resolveDeliveryCoverageAndFee({
    fulfillmentType: 'delivery',
    neighborhood: 'Tarumã',
    subtotal: 50,
    menuSettings: baseMenuSettings,
    pricingSettings: { ...basePricing, defaultFeeEnabled: true, defaultDeliveryFee: 11 },
    regions,
  });
  assert.equal(outsideFallback.available, true);
  assert.equal(outsideFallback.reasonCode, 'default_fallback');
  assert.equal(outsideFallback.appliedDeliveryFee, 11);
  assert.equal(outsideFallback.feeRule, 'default_fallback');

  // 8) computeCartSummary + validateCheckoutPayload com coverageResolution
  const summary = computeCartSummary(
    [{ kind: 'product', id: 'p1', quantity: 2, note: '' }],
    [
      {
        id: 'p1',
        name: 'X-Salada',
        category: 'Lanche',
        unitPrice: 20,
        countsAsXSalada: true,
      },
    ],
    [],
    baseMenuSettings,
    'delivery',
    matched,
  );
  assert.equal(summary.subtotal, 40);
  assert.equal(summary.deliveryFee, 5);
  assert.equal(summary.totalAmount, 45);

  const blockedCheckout = validateCheckoutPayload(
    {
      customerName: 'João Teste',
      customerPhone: '92999991111',
      fulfillmentType: 'delivery',
      deliveryAddress: 'Rua A, 123',
      deliveryReference: '',
      paymentMethod: 'Pix',
      changeFor: null,
      customerNote: '',
    },
    summary,
    baseMenuSettings,
    outsideStrict,
  );
  assert.equal(blockedCheckout.valid, false);
  assert.match(blockedCheckout.error || '', /Tarumã/);
});

test('KPIs, city hierarchy, served options, and historical snapshots stay consistent', () => {
  const regions: DeliveryRegionRecord[] = [
    makeRegion({ id: 'reg-1', name: 'Centro', city: 'Manaus', neighborhoods: ['Centro', 'Aparecida'], deliveryFee: 5 }),
    makeRegion({ id: 'reg-2', name: 'Zona Norte', city: 'Manaus', neighborhoods: ['Cidade Nova'], deliveryFee: 9, isTemporarilySuspended: true }),
    makeRegion({ id: 'reg-3', name: 'Cacau Pirêra', city: 'Iranduba', neighborhoods: ['Cacau Pirêra'], deliveryFee: 14, status: 'inactive' }),
  ];

  const orders: OnlineOrderRecord[] = [
    makeOrder({ id: 'o1', deliveryRegionId: 'reg-1', deliveryRegionName: 'Centro', totalAmount: 65 }),
    // Região já excluída do cadastro, mas preservada via snapshot no pedido histórico
    makeOrder({
      id: 'o2',
      deliveryRegionId: null,
      deliveryRegionName: 'Região Antiga',
      deliveryNeighborhood: 'Educandos',
      deliveryCity: 'Manaus',
      totalAmount: 55,
    }),
  ];

  const kpis = computeDeliveryRegionsKpis(regions, orders);
  assert.equal(kpis.totalRegionsCount, 3);
  assert.equal(kpis.activeRegionsCount, 1);
  assert.equal(kpis.temporarilySuspendedCount, 1);
  assert.equal(kpis.inactiveRegionsCount, 1);
  assert.equal(kpis.suspendedRegionsCount, 2);
  assert.equal(kpis.totalNeighborhoodsCount, 4);
  assert.equal(kpis.averageDeliveryFee, 5);
  assert.equal(kpis.deliveryOrdersWithRegionCount, 2);
  assert.ok(kpis.ordersByRegion.some((m) => m.regionName === 'Região Antiga' && m.ordersCount === 1));

  const hierarchy = buildCityRegionsHierarchy(regions);
  assert.equal(hierarchy.length, 2);
  assert.equal(hierarchy[0].city, 'Iranduba');
  assert.equal(hierarchy[1].city, 'Manaus');
  assert.equal(hierarchy[1].neighborhoodsCount, 3);

  const publicOptions = getPublicServedNeighborhoodOptions(regions);
  assert.equal(publicOptions.length, 4);
  assert.equal(formatDeliveryFeeRuleLabel('neighborhood', false), 'Taxa por bairro');
  assert.equal(formatDeliveryFeeRuleLabel('neighborhood', true), 'Entrega grátis (valor mínimo atingido)');
});

test('DeliveryRegionsView, DeliveryDashboardView, AppShell, and PublicMenuView render Etapa 5 UI cleanly', () => {
  const regions = [
    makeRegion({ id: 'reg-1', name: 'Centro', city: 'Manaus', neighborhoods: ['Centro', 'Aparecida'], deliveryFee: 5 }),
  ];
  const orders = [makeOrder()];

  const regionsHtml = renderToStaticMarkup(
    createElement(DeliveryRegionsView, {
      establishmentName: 'MGW Lanches',
      regions,
      pricingSettings: basePricing,
      orders,
      digitalMenuSettings: baseMenuSettings,
      onCreateRegion: async () => 'reg-new',
      onUpdateRegion: async () => {},
      onToggleRegionStatus: async () => {},
      onToggleRegionSuspension: async () => {},
      onDeleteRegion: async () => {},
      onSavePricingSettings: async () => {},
    }),
  );
  assert.match(regionsHtml, /Regiões e Taxas de Entrega/);
  assert.match(regionsHtml, /Zona Centro|Centro/);
  assert.match(regionsHtml, /Manaus/);
  assert.match(regionsHtml, /Aparecida/);
  assert.match(regionsHtml, /Entrega grátis automática a partir de um valor mínimo/);

  const dashHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Lanches',
      orders,
      regions,
      digitalMenuSettings: baseMenuSettings,
      onOpenRegions: () => {},
    }),
  );
  assert.match(dashHtml, /1 ativa\(s\) · 1 região\(ões\)/);

  const shellHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'delivery_regions',
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
      establishmentName: 'MGW Lanches',
      userEmail: 'owner@mgw.com',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Regiões'),
    }),
  );
  assert.match(shellHtml, /Regiões e taxas/);
  assert.match(shellHtml, /aria-current="page"/);

  const initialPayload: PublicDigitalMenuPayload = {
    found: true,
    store: {
      ...DEFAULT_DIGITAL_MENU_SETTINGS,
      slug: 'mgw-lanches',
      storeName: 'MGW Lanches',
      deliveryFee: 6,
      minimumOrderAmount: 20,
      acceptsDelivery: true,
      acceptsPickup: true,
      isActive: true,
      isOpen: true,
      timezone: 'America/Manaus',
    },
    products: [],
    combos: [],
    deliveryPricing: {
      pricingMode: 'by_neighborhood',
      defaultFeeEnabled: false,
      defaultDeliveryFee: 8,
      defaultMinimumOrderAmount: 20,
      defaultEstimatedTime: '40 min',
      freeDeliveryEnabled: true,
      freeDeliveryMinAmount: 100,
    },
    deliveryRegions: [
      {
        id: 'reg-1',
        name: 'Centro',
        city: 'Manaus',
        neighborhoods: ['Centro'],
        description: '',
        deliveryFee: 5,
        minimumOrderAmount: 25,
        estimatedTime: '25 - 35 min',
        status: 'active',
        isTemporarilySuspended: false,
        suspensionReason: '',
        scheduleEnabled: false,
        scheduleDays: [0, 1, 2, 3, 4, 5, 6],
        scheduleStart: '18:00',
        scheduleEnd: '23:00',
      },
      {
        id: 'reg-2',
        name: 'Zona Norte',
        city: 'Manaus',
        neighborhoods: ['Cidade Nova'],
        description: '',
        deliveryFee: 9,
        minimumOrderAmount: 30,
        estimatedTime: '35 - 50 min',
        status: 'active',
        isTemporarilySuspended: false,
        suspensionReason: '',
        scheduleEnabled: false,
        scheduleDays: [0, 1, 2, 3, 4, 5, 6],
        scheduleStart: '18:00',
        scheduleEnd: '23:00',
      },
    ],
  };

  const menuHtml = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'mgw-lanches',
      initialPayload,
      onOrderCreated: () => {},
    }),
  );
  assert.match(menuHtml, /por bairro/);
  assert.match(menuHtml, /Grátis acima de/);
});

test('Etapa 5 SQL migration creates regional tables, RLS, realtime, order snapshots, and public RPCs', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261125180000_delivery_regions_and_fees.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_regions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_pricing_settings/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /delivery_region_id uuid REFERENCES public\.delivery_regions/);
  assert.match(sql, /delivery_region_name text/);
  assert.match(sql, /delivery_neighborhood text/);
  assert.match(sql, /delivery_fee_rule text/);
  assert.match(sql, /delivery_free_applied boolean/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_public_digital_menu/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_public_online_order/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_public_order_by_token/);
});
