import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell.tsx';
import { DeliveryDashboardView } from '../components/DeliveryDashboardView.tsx';
import { hasTenantPermission } from '../services/rbacPolicy.ts';
import type {
  DigitalMenuSettings,
  OnlineOrderRecord,
  TenantContext,
} from '../types/finance.ts';
import { computeDeliveryDashboardSummary } from './deliveryDashboard.ts';
import { getLocalTodayDate } from './finance.ts';
import { DEFAULT_DIGITAL_MENU_SETTINGS } from './onlineOrders.ts';

const baseMenuSettings: DigitalMenuSettings = {
  tenantId: 'tenant-1',
  ...DEFAULT_DIGITAL_MENU_SETTINGS,
  slug: 'mgw-lanches',
  storeName: 'MGW Lanches',
  deliveryFee: 6,
  acceptsDelivery: true,
  isActive: true,
  isOpen: true,
};

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

function makeOrder(
  id: string,
  orderNumber: number,
  fulfillmentType: 'delivery' | 'pickup',
  status: OnlineOrderRecord['status'],
  createdAtMs: number,
  completedAtMs: number | null = null,
): OnlineOrderRecord {
  return {
    id,
    tenantId: 'tenant-1',
    orderNumber,
    orderCode: `#${String(orderNumber).padStart(4, '0')}`,
    tokenHash: `hash-${id}`,
    status,
    fulfillmentType,
    customerName: `Cliente ${orderNumber}`,
    customerPhone: '92999990000',
    deliveryAddress:
      fulfillmentType === 'delivery' ? `Rua das Flores, ${orderNumber}` : '',
    deliveryReference: fulfillmentType === 'delivery' ? 'Próximo à praça' : '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: 40,
    deliveryFee: fulfillmentType === 'delivery' ? 6 : 0,
    totalAmount: fulfillmentType === 'delivery' ? 46 : 40,
    rejectionReason: '',
    viewedAtMs: status === 'received' ? null : createdAtMs,
    acceptedAtMs: null,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs,
    cancelledAtMs: null,
    saleId: null,
    createdAtMs,
    updatedAtMs: createdAtMs,
    items: [
      {
        id: `${id}-item-1`,
        itemKind: 'combo',
        refId: 'combo-1',
        itemName: 'COMBO 1',
        quantity: 1,
        unitPrice: 40,
        lineTotal: 40,
        estimatedUnitCost: 15,
        xSaladasPerUnit: 1,
        components: [],
        selectedAddons: [],
        itemNote: '',
      },
    ],
    statusHistory: [],
  };
}

test('computeDeliveryDashboardSummary uses only delivery orders, excludes pickup, and keeps unbuilt modules at 0', () => {
  const today = getLocalTodayDate();
  const todayNoon = new Date(`${today}T12:00:00`).getTime();
  const yesterdayNoon = todayNoon - 24 * 60 * 60 * 1000;

  const orders: OnlineOrderRecord[] = [
    makeOrder('d1', 101, 'delivery', 'received', todayNoon + 1000),
    makeOrder('d2', 102, 'delivery', 'preparing', todayNoon + 2000),
    makeOrder('d3', 103, 'delivery', 'out_for_delivery', todayNoon + 3000),
    makeOrder('d4', 104, 'delivery', 'completed', yesterdayNoon, todayNoon + 4000),
    makeOrder('p1', 105, 'pickup', 'preparing', todayNoon + 5000),
    makeOrder('p2', 106, 'pickup', 'completed', todayNoon + 6000, todayNoon + 7000),
  ];

  const summary = computeDeliveryDashboardSummary(orders, baseMenuSettings, today);

  assert.equal(summary.deliveryOrdersTodayCount, 3);
  assert.equal(summary.pendingAcceptanceCount, 1);
  assert.equal(summary.inProgressDeliveriesCount, 2);
  assert.equal(summary.outForDeliveryCount, 1);
  assert.equal(summary.completedDeliveriesCount, 1);
  assert.equal(summary.completedDeliveriesTodayCount, 1);
  assert.equal(summary.availableCouriersCount, 0);
  assert.equal(summary.registeredCustomersCount, 0);
  assert.equal(summary.pickupOrdersExcludedCount, 2);
  assert.equal(summary.recentDeliveryOrders.length, 4);
  assert.ok(
    summary.recentDeliveryOrders.every((o) => o.fulfillmentType === 'delivery'),
  );
  assert.equal(summary.recentDeliveryOrders[0].id, 'd3');
});

test('DeliveryDashboardView renders empty state, loading skeleton, error banner, and populated delivery layout cleanly', () => {
  const loadingHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Lanches',
      orders: [],
      digitalMenuSettings: baseMenuSettings,
      isLoading: true,
    }),
  );
  assert.match(loadingHtml, /Carregando MGW Delivery/);

  const emptyHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Lanches',
      orders: [
        makeOrder('pickup-only', 200, 'pickup', 'preparing', Date.now()),
      ],
      digitalMenuSettings: { ...baseMenuSettings, acceptsDelivery: false },
      errorMessage: 'Falha temporária',
      canManageDigitalMenu: true,
      onRefreshOrders: () => {},
      onOpenOrders: () => {},
      onOpenDigitalMenuSettings: () => {},
    }),
  );

  assert.match(emptyHtml, /MGW Delivery/);
  assert.match(
    emptyHtml,
    /Central de gerenciamento de entregas do seu estabelecimento\./,
  );
  assert.match(emptyHtml, /Nenhum pedido de delivery registrado ainda/);
  assert.match(emptyHtml, /Configurar entrega/);
  assert.match(emptyHtml, /Falha temporária/);

  const now = Date.now();
  const populatedHtml = renderToStaticMarkup(
    createElement(DeliveryDashboardView, {
      establishmentName: 'MGW Lanches',
      orders: [
        makeOrder('del-1', 301, 'delivery', 'out_for_delivery', now),
        makeOrder('pick-1', 302, 'pickup', 'preparing', now),
      ],
      digitalMenuSettings: baseMenuSettings,
      onRefreshOrders: () => {},
      onOpenOrders: () => {},
    }),
  );

  assert.match(populatedHtml, /Pedidos de delivery hoje/);
  assert.match(populatedHtml, /Entregas em andamento/);
  assert.match(populatedHtml, /Entregas concluídas/);
  assert.match(populatedHtml, /Entregadores disponíveis/);
  assert.match(populatedHtml, /Total de clientes cadastrados/);
  assert.match(populatedHtml, /Cliente 301/);
  assert.match(populatedHtml, /Rua das Flores, 301/);
  assert.doesNotMatch(populatedHtml, /Cliente 302/);

  for (const label of [
    'Clientes',
    'Entregadores',
    'Central de despacho',
    'Regiões e taxas',
    'Financeiro',
    'Rastreamento',
    'Relatórios',
  ]) {
    assert.match(populatedHtml, new RegExp(label));
  }
});

test('AppShell integrates MGW DELIVERY section with RBAC isolation and active page highlight', () => {
  const authorizedHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'delivery',
      activeSettingsTab: 'shop',
      onNavigate: () => {},
      canViewDashboard: true,
      canAccessDelivery: true,
      canReadSales: true,
      canCreateSales: true,
      canWriteCatalog: true,
      canReadExpenses: true,
      canCreateExpenses: true,
      canViewReports: true,
      canAccessSettingsRoute: true,
      canWriteSettings: true,
      unviewedOrdersCount: 0,
      activeTenant: baseTenant,
      tenants: [baseTenant],
      establishmentName: 'MGW Lanches',
      userEmail: 'owner@mgwlanches.com',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Conteúdo Delivery'),
    }),
  );

  assert.match(authorizedHtml, /MGW DELIVERY/);
  assert.match(authorizedHtml, /MGW Delivery/);
  assert.match(authorizedHtml, /aria-current="page"/);

  // Staff sem permissão delivery:view não vê a seção MGW DELIVERY
  assert.equal(hasTenantPermission('staff', 'delivery:view'), false);
  assert.equal(hasTenantPermission('owner', 'delivery:view'), true);
  assert.equal(hasTenantPermission('admin', 'delivery:view'), true);
  assert.equal(hasTenantPermission('manager', 'delivery:view'), true);

  const staffHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'dashboard',
      activeSettingsTab: 'shop',
      onNavigate: () => {},
      canViewDashboard: true,
      canAccessDelivery: false,
      canReadSales: false,
      canCreateSales: true,
      canWriteCatalog: true,
      canReadExpenses: false,
      canCreateExpenses: false,
      canViewReports: false,
      canAccessSettingsRoute: false,
      canWriteSettings: false,
      unviewedOrdersCount: 0,
      activeTenant: { ...baseTenant, role: 'staff' },
      tenants: [{ ...baseTenant, role: 'staff' }],
      establishmentName: 'MGW Lanches',
      userEmail: 'atendente@mgwlanches.com',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Conteúdo Staff'),
    }),
  );

  assert.doesNotMatch(staffHtml, /MGW DELIVERY/);
  assert.doesNotMatch(staffHtml, /MGW Delivery/);
});
