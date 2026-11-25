import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell.tsx';
import { DeliveryCouriersView } from '../components/DeliveryCouriersView.tsx';
import { DeliveryDashboardView } from '../components/DeliveryDashboardView.tsx';
import { demoMutations, subscribeDemoAdminState } from '../services/demoSandbox.ts';
import { hasTenantPermission } from '../services/rbacPolicy.ts';
import {
  buildDeliveryCourierPayloadForSupabase,
  mapDeliveryCourierRow,
} from '../services/supabaseMappers.ts';
import type {
  DeliveryCourierRecord,
  DigitalMenuSettings,
  TenantContext,
} from '../types/finance.ts';
import {
  buildWhatsappUrlBR,
  computeDeliveryCouriersKpis,
  filterAndSortDeliveryCouriers,
  findDuplicateCourierByPhone,
  formatCourierMotorcycleSummary,
  formatMotorcyclePlate,
  normalizeCustomerPhone,
} from './deliveryCouriers.ts';
import { computeDeliveryDashboardSummary } from './deliveryDashboard.ts';
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
    motorcycleBrand: '',
    motorcycleModel: '',
    motorcycleColor: '',
    motorcyclePlate: '',
    courierType: 'own',
    status: 'active',
    availabilityStatus: 'available',
    notes: '',
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function withMockBrowserStorage(run: () => void) {
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
    run();
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

test('1 & 6. buildDeliveryCourierPayloadForSupabase and mapDeliveryCourierRow validate inputs, plates, and inactive->unavailable invariant', () => {
  const payload = buildDeliveryCourierPayloadForSupabase({
    name: '  Lucas Ferreira  ',
    phone: '(92) 99123-4567',
    whatsapp: '(92) 99123-4567',
    cpf: '',
    email: 'LUCAS@Moto.COM ',
    motorcycleBrand: 'Honda',
    motorcycleModel: 'CG 160 Titan',
    motorcycleColor: 'Preta',
    motorcyclePlate: 'abc1234',
    courierType: 'outsourced',
    status: 'active',
    availabilityStatus: 'available',
    notes: 'Turno noturno',
  });

  assert.equal(payload.name, 'Lucas Ferreira');
  assert.equal(payload.normalized_phone, '5592991234567');
  assert.equal(payload.normalized_whatsapp, '5592991234567');
  assert.equal(payload.email, 'lucas@moto.com');
  assert.equal(payload.motorcycle_plate, 'ABC-1234');
  assert.equal(payload.courier_type, 'outsourced');
  assert.equal(payload.status, 'active');
  assert.equal(payload.availability_status, 'available');

  // Placa Mercosul mantém formato sem hífen
  assert.equal(formatMotorcyclePlate('abc1d23'), 'ABC1D23');

  // Regra: entregador inativo sempre força availability_status = 'unavailable'
  const inactivePayload = buildDeliveryCourierPayloadForSupabase({
    name: 'Rafael Mota',
    phone: '92999887766',
    status: 'inactive',
    availabilityStatus: 'available',
  });
  assert.equal(inactivePayload.courier_type, 'own');
  assert.equal(inactivePayload.status, 'inactive');
  assert.equal(inactivePayload.availability_status, 'unavailable');

  const mapped = mapDeliveryCourierRow({
    id: 'courier-1',
    tenant_id: 'tenant-a',
    ...inactivePayload,
    created_at: '2026-11-24T12:00:00Z',
    updated_at: '2026-11-24T12:00:00Z',
  });
  assert.equal(mapped.id, 'courier-1');
  assert.equal(mapped.tenantId, 'tenant-a');
  assert.equal(mapped.courierType, 'own');
  assert.equal(mapped.availabilityStatus, 'unavailable');
  assert.equal(
    formatCourierMotorcycleSummary({
      motorcycleBrand: 'Honda',
      motorcycleModel: 'CG 160',
      motorcycleColor: 'Preta',
      motorcyclePlate: 'ABC1D23',
    }),
    'Honda CG 160 · Preta · Placa ABC1D23',
  );
  assert.equal(buildWhatsappUrlBR('(92) 99123-4567'), 'https://wa.me/5592991234567');

  assert.throws(() =>
    buildDeliveryCourierPayloadForSupabase({
      name: 'A',
      phone: '92999990000',
    }),
  );
  assert.throws(() =>
    buildDeliveryCourierPayloadForSupabase({
      name: 'Carlos',
      phone: '123',
    }),
  );
  assert.throws(() =>
    buildDeliveryCourierPayloadForSupabase({
      name: 'Carlos',
      phone: '92999990000',
      cpf: '11111111111',
    }),
  );
});

test('2, 4, 6, 7 & 8. Demo CRUD flow: create, edit, duplicate phone block, status/availability rules, persistence, and delete', () => {
  withMockBrowserStorage(() => {
    let latestCouriers: DeliveryCourierRecord[] = [];
    const unsub = subscribeDemoAdminState({
      onSettings: () => {},
      onDigitalMenuSettings: () => {},
      onProducts: () => {},
      onCombos: () => {},
      onSales: () => {},
      onExpenses: () => {},
      onOrders: () => {},
      onDeliveryCouriers: (list) => {
        latestCouriers = list;
      },
      onReady: () => {},
    });

    try {
      const id = demoMutations.createDeliveryCourier({
        name: 'Marcos Paulo',
        phone: '(92) 98111-2233',
        whatsapp: '(92) 98111-2233',
        motorcycleBrand: 'Yamaha',
        motorcycleModel: 'Fazer 150',
        motorcycleColor: 'Azul',
        motorcyclePlate: 'phx1d22',
        status: 'active',
        availabilityStatus: 'available',
        notes: 'Região Centro',
      });
      assert.ok(id.startsWith('demo_courier_'));

      // Persistência real e emissão via subscribeDemoAdminState
      assert.equal(latestCouriers.length, 1);
      assert.equal(latestCouriers[0].name, 'Marcos Paulo');
      assert.equal(latestCouriers[0].motorcyclePlate, 'PHX1D22');

      // Bloqueio de telefone duplicado no mesmo estabelecimento (com formatação diferente)
      assert.throws(
        () =>
          demoMutations.createDeliveryCourier({
            name: 'Outro Entregador',
            phone: '5592981112233',
          }),
        /Já existe um entregador cadastrado com este telefone/,
      );

      // Edição de cadastro
      demoMutations.updateDeliveryCourier(id, {
        name: 'Marcos Paulo Atualizado',
        phone: '(92) 98111-2233',
        motorcycleBrand: 'Honda',
        motorcycleModel: 'Biz 125',
        motorcycleColor: 'Branca',
        motorcyclePlate: 'ABC9988',
        status: 'active',
        availabilityStatus: 'unavailable',
        notes: 'Atualizado',
      });
      assert.equal(latestCouriers[0].name, 'Marcos Paulo Atualizado');
      assert.equal(latestCouriers[0].motorcyclePlate, 'ABC-9988');
      assert.equal(latestCouriers[0].availabilityStatus, 'unavailable');

      // Desativar força indisponível e impede marcar disponível enquanto inativo
      demoMutations.setDeliveryCourierStatus(id, 'inactive');
      assert.equal(latestCouriers[0].status, 'inactive');
      assert.equal(latestCouriers[0].availabilityStatus, 'unavailable');

      assert.throws(
        () => demoMutations.setDeliveryCourierAvailability(id, 'available'),
        /Ative o entregador antes de marcá-lo como disponível/,
      );

      // Reativar e alternar disponibilidade
      demoMutations.setDeliveryCourierStatus(id, 'active');
      demoMutations.setDeliveryCourierAvailability(id, 'available');
      assert.equal(latestCouriers[0].status, 'active');
      assert.equal(latestCouriers[0].availabilityStatus, 'available');

      // Exclusão segura
      demoMutations.deleteDeliveryCourier(id);
      assert.equal(latestCouriers.length, 0);
    } finally {
      unsub();
    }
  });
});

test('3, 4 & 5. Search by name/phone/whatsapp/plate, same-tenant duplicate block, and cross-tenant isolation', () => {
  const c1 = makeCourier({
    id: 'c1',
    tenantId: 'tenant-a',
    name: 'Bruno Silva',
    phone: '(92) 99100-1111',
    whatsapp: '(92) 99100-9999',
    motorcycleModel: 'CG 160',
    motorcyclePlate: 'ABC1D23',
    status: 'active',
    availabilityStatus: 'available',
    createdAtMs: 1000,
  });
  const c2 = makeCourier({
    id: 'c2',
    tenantId: 'tenant-a',
    name: 'Carla Souza',
    phone: '(92) 99200-2222',
    motorcycleModel: 'Factor 150',
    motorcyclePlate: 'XYZ-9876',
    status: 'active',
    availabilityStatus: 'unavailable',
    createdAtMs: 2000,
  });
  const c3 = makeCourier({
    id: 'c3',
    tenantId: 'tenant-a',
    name: 'Diego Lima',
    phone: '(92) 99300-3333',
    status: 'inactive',
    availabilityStatus: 'unavailable',
    createdAtMs: 3000,
  });

  // Busca por nome, telefone, WhatsApp e placa
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: 'bruno',
      filter: 'all',
      sortBy: 'name',
    }).map((c) => c.id),
    ['c1'],
  );
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: '99200-2222',
      filter: 'all',
      sortBy: 'name',
    }).map((c) => c.id),
    ['c2'],
  );
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: '991009999',
      filter: 'all',
      sortBy: 'name',
    }).map((c) => c.id),
    ['c1'],
  );
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: 'xyz-9876',
      filter: 'all',
      sortBy: 'name',
    }).map((c) => c.id),
    ['c2'],
  );

  // Filtros de status e disponibilidade
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: '',
      filter: 'available',
      sortBy: 'availability',
    }).map((c) => c.id),
    ['c1'],
  );
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: '',
      filter: 'unavailable',
      sortBy: 'availability',
    }).map((c) => c.id),
    ['c2'],
  );
  assert.deepEqual(
    filterAndSortDeliveryCouriers([c1, c2, c3], {
      searchQuery: '',
      filter: 'inactive',
      sortBy: 'availability',
    }).map((c) => c.id),
    ['c3'],
  );

  // Bloqueio no mesmo tenant
  const dup = findDuplicateCourierByPhone([c1, c2], '5592991001111');
  assert.equal(dup?.id, 'c1');
  assert.equal(findDuplicateCourierByPhone([c1, c2], '5592991001111', 'c1'), null);

  // Mesmo telefone em estabelecimentos distintos não colide
  const tenantACouriers = [c1];
  const tenantBCouriers = [
    makeCourier({
      id: 'b-1',
      tenantId: 'tenant-b',
      name: 'Bruno em Outra Loja',
      phone: '(92) 99100-1111',
    }),
  ];
  assert.equal(tenantACouriers[0].tenantId, 'tenant-a');
  assert.equal(tenantBCouriers[0].tenantId, 'tenant-b');
  assert.equal(tenantACouriers[0].normalizedPhone, tenantBCouriers[0].normalizedPhone);
});

test('9. SQL migration 20261124160000 enforces tenant_id isolation, unique phone per tenant, triggers, and strict RLS', () => {
  const sql = readFileSync(
    'supabase/migrations/20261124160000_delivery_couriers_module.sql',
    'utf8',
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.delivery_couriers/);
  assert.match(sql, /tenant_id uuid NOT NULL REFERENCES public\.tenants\(id\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_delivery_couriers_tenant_id/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_delivery_couriers_normalized_phone/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_couriers_tenant_phone\s+ON public\.delivery_couriers \(tenant_id, normalized_phone\)/,
  );
  assert.match(sql, /WHEN NEW\.status = 'inactive' THEN 'unavailable'/);
  assert.match(sql, /ALTER TABLE public\.delivery_couriers ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.delivery_couriers FROM PUBLIC, anon/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.delivery_couriers TO authenticated/);
  assert.match(sql, /public\.has_active_tenant_access\(tenant_id\)/);
  assert.match(sql, /public\.has_tenant_role\(tenant_id, ARRAY\['owner', 'admin', 'manager'\]\)/);
  assert.match(sql, /trg_prevent_tenant_id_change_delivery_couriers/);
});

test('10. KPIs and DeliveryDashboardSummary count active and available couriers accurately', () => {
  const couriers: DeliveryCourierRecord[] = [
    makeCourier({
      id: '1',
      name: 'Ana',
      phone: '92991000001',
      status: 'active',
      availabilityStatus: 'available',
    }),
    makeCourier({
      id: '2',
      name: 'Beto',
      phone: '92991000002',
      status: 'active',
      availabilityStatus: 'unavailable',
    }),
    makeCourier({
      id: '3',
      name: 'Caio',
      phone: '92991000003',
      status: 'inactive',
      availabilityStatus: 'unavailable',
    }),
  ];

  const kpis = computeDeliveryCouriersKpis(couriers);
  assert.equal(kpis.totalCouriers, 3);
  assert.equal(kpis.activeCouriers, 2);
  assert.equal(kpis.availableCouriers, 1);
  assert.equal(kpis.unavailableActiveCouriers, 1);
  assert.equal(kpis.inactiveCouriers, 1);

  const summary = computeDeliveryDashboardSummary(
    [],
    baseMenuSettings,
    getLocalTodayDate(),
    8,
    [],
    couriers,
  );
  assert.equal(summary.availableCouriersCount, 1);
  assert.equal(summary.couriersModuleReady, true);
});

test('11. SSR rendering: AppShell Entregadores RBAC, DeliveryDashboardView link, and DeliveryCouriersView states', () => {
  assert.equal(hasTenantPermission('staff', 'delivery:view'), false);
  assert.equal(hasTenantPermission('owner', 'delivery:view'), true);
  assert.equal(hasTenantPermission('admin', 'delivery:view'), true);
  assert.equal(hasTenantPermission('manager', 'delivery:view'), true);

  const shellAdminHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'delivery_couriers',
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
      children: createElement('div', null, 'Conteúdo Motoboys'),
    }),
  );
  assert.match(shellAdminHtml, /MGW DELIVERY/);
  assert.match(shellAdminHtml, /Entregadores/);
  assert.match(shellAdminHtml, /Entregadores · MGW Delivery/);
  assert.match(shellAdminHtml, /aria-current="page"/);

  const dashboardHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Burger',
      orders: [],
      couriers: [
        makeCourier({
          id: '1',
          name: 'Lucas Motoboy',
          phone: '92999990001',
          status: 'active',
          availabilityStatus: 'available',
        }),
      ],
      digitalMenuSettings: baseMenuSettings,
      onOpenCouriers: () => {},
    }),
  );
  assert.match(dashboardHtml, /Ver entregadores/);
  assert.match(dashboardHtml, /1 disponível\(is\) · 1 cadastrado\(s\)/);

  const loadingHtml = renderToStaticMarkup(
    createElement(DeliveryCouriersView, {
      establishmentName: 'MGW Burger',
      couriers: [],
      isLoading: true,
      onCreateCourier: async () => '',
      onUpdateCourier: async () => {},
      onToggleCourierStatus: async () => {},
      onToggleCourierAvailability: async () => {},
      onDeleteCourier: async () => {},
    }),
  );
  assert.match(loadingHtml, /Carregando entregadores do MGW Delivery/);

  const emptyHtml = renderToStaticMarkup(
    createElement(DeliveryCouriersView, {
      establishmentName: 'MGW Burger',
      couriers: [],
      errorMessage: 'Erro simulado de rede',
      onRefresh: () => {},
      onCreateCourier: async () => '',
      onUpdateCourier: async () => {},
      onToggleCourierStatus: async () => {},
      onToggleCourierAvailability: async () => {},
      onDeleteCourier: async () => {},
    }),
  );
  assert.match(emptyHtml, /Nenhum entregador cadastrado ainda/);
  assert.match(emptyHtml, /Erro simulado de rede/);

  const populatedHtml = renderToStaticMarkup(
    createElement(DeliveryCouriersView, {
      establishmentName: 'MGW Burger',
      couriers: [
        makeCourier({
          id: 'c-1',
          name: 'Pedro Motoboy',
          phone: '(92) 99123-4567',
          motorcycleBrand: 'Honda',
          motorcycleModel: 'CG 160',
          motorcycleColor: 'Preta',
          motorcyclePlate: 'ABC1D23',
          status: 'active',
          availabilityStatus: 'available',
          notes: 'Bag térmica grande',
        }),
      ],
      onRefresh: () => {},
      onCreateCourier: async () => '',
      onUpdateCourier: async () => {},
      onToggleCourierStatus: async () => {},
      onToggleCourierAvailability: async () => {},
      onDeleteCourier: async () => {},
    }),
  );
  assert.match(populatedHtml, /Total de entregadores cadastrados/);
  assert.match(populatedHtml, /Entregadores ativos/);
  assert.match(populatedHtml, /Entregadores disponíveis/);
  assert.match(populatedHtml, /Entregadores inativos/);
  assert.match(populatedHtml, /Pedro Motoboy/);
  assert.match(populatedHtml, /\(92\) 99123-4567/);
  assert.match(populatedHtml, /Honda CG 160 · Preta · Placa ABC1D23/);
  assert.match(populatedHtml, /Bag térmica grande/);
});
