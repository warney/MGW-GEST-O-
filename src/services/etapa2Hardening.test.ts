import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildSalePayloadForSupabase,
  buildSettingsPayloadForSupabase,
  buildTenantContextFromRows,
  evaluateTenantBillingAccess,
  hasActiveTenantBillingAccess,
  mapPublicOrderTrackingRpcResponse,
  mapShopSettingsRow,
} from './supabaseMappers';
import { createPublicOrderPollingController } from './dataService';
import {
  hasTenantPermission,
  normalizeRetentionStatus,
  normalizeSubscriptionStatus,
  PLAN_CATALOG,
  selectAuthorizedTenant,
} from './rbacPolicy';
import { ExpensesView } from '../components/ExpensesView';
import { SalesView } from '../components/SalesView';
import { buildSaleInputFromCompletedOrder } from '../utils/onlineOrders';
import {
  DEFAULT_SHOP_SETTINGS,
  type ExpenseRecord,
  type OnlineOrderRecord,
  type PublicOrderTrackingRecord,
  type SaleRecord,
  type TenantContext,
} from '../types/finance';

const MIGRATION_2_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261119000001_etapa2_multi_tenant_hardening_and_saas_alignment.sql',
);
const MIGRATION_2_1_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261119000002_etapa2_1_security_and_consistency_fixes.sql',
);
const MIGRATION_2_2_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261119000003_etapa2_manaus_timezone_and_final_consistency.sql',
);
const MIGRATION_1_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261118190220_initial_saas_schema.sql',
);
const MIGRATION_ETAPA4_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261118195047_etapa4_multi_tenant_rbac_and_plans.sql',
);
const DATA_SERVICE_PATH = path.resolve(process.cwd(), 'src/services/dataService.ts');
const TRACKING_VIEW_PATH = path.resolve(
  process.cwd(),
  'src/components/PublicOrderTrackingView.tsx',
);
const MENU_STORAGE_PATH = path.resolve(
  process.cwd(),
  'supabase/functions/menu-storage/index.ts',
);
const SEND_PUSH_PATH = path.resolve(
  process.cwd(),
  'supabase/functions/send-order-push/index.ts',
);

const migrationSql = fs.readFileSync(MIGRATION_2_PATH, 'utf8');
const migration21Sql = fs.readFileSync(MIGRATION_2_1_PATH, 'utf8');
const migration22Sql = fs.readFileSync(MIGRATION_2_2_PATH, 'utf8');
const initialSql = fs.readFileSync(MIGRATION_1_PATH, 'utf8');
const etapa4Sql = fs.readFileSync(MIGRATION_ETAPA4_PATH, 'utf8');
const dataServiceSource = fs.readFileSync(DATA_SERVICE_PATH, 'utf8');
const trackingViewSource = fs.readFileSync(TRACKING_VIEW_PATH, 'utf8');
const menuStorageSource = fs.readFileSync(MENU_STORAGE_PATH, 'utf8');
const sendPushSource = fs.readFileSync(SEND_PUSH_PATH, 'utf8');

function makeMemberRow(overrides: {
  tenantId?: string;
  slug?: string;
  name?: string;
  role?: string;
  billingExempt?: boolean;
  tenantStatus?: string;
  onboardingCompleted?: boolean;
}) {
  const tenantId = overrides.tenantId ?? 'tenant-a';
  return {
    id: `member-${tenantId}`,
    tenant_id: tenantId,
    user_id: 'user-1',
    email: 'dono@lanchonete.com',
    role: overrides.role ?? 'owner',
    is_founder: false,
    active: true,
    tenants: {
      id: tenantId,
      slug: overrides.slug ?? tenantId,
      name: overrides.name ?? 'Lanche A',
      is_founder_account: false,
      billing_exempt: overrides.billingExempt ?? false,
      status: overrides.tenantStatus ?? 'active',
      onboarding_completed: overrides.onboardingCompleted ?? true,
    },
  };
}

function makeTrackingRecord(
  status: PublicOrderTrackingRecord['status'],
): PublicOrderTrackingRecord {
  return {
    orderId: 'order-1',
    orderNumber: 42,
    orderCode: '00042',
    status,
    fulfillmentType: 'delivery',
    customerName: 'Maria',
    deliveryAddress: 'Rua Central, 100',
    deliveryReference: '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: 30,
    deliveryFee: 5,
    totalAmount: 35,
    rejectionReason: '',
    storeName: 'MGW Lanches',
    storeSlug: 'mgw_lanches',
    storeWhatsapp: '',
    storeAddress: '',
    storePixKey: '',
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000005000,
    items: [],
    statusHistory: [],
  };
}

test('Cenarios 1 e 2: Isolamento multi-tenant impede troca indevida e aplica travas de tenant_id no banco e Storage', () => {
  const authorized: TenantContext[] = [
    {
      tenantId: 'tenant-a',
      slug: 'lanche-a',
      name: 'Lanche A',
      role: 'owner',
      isFounderAccount: false,
      billingExempt: false,
      subscriptionStatus: 'trialing',
      graceUntil: null,
      accessAllowed: true,
    },
  ];

  assert.equal(selectAuthorizedTenant(authorized, 'tenant-b-invasor')?.tenantId, 'tenant-a');
  assert.equal(selectAuthorizedTenant([], 'tenant-a'), null);

  assert.match(migrationSql, /trg_digital_menu_settings_lock_tenant/);
  assert.match(migrationSql, /trg_online_orders_lock_tenant/);
  assert.match(migrationSql, /trg_online_order_items_lock_tenant/);
  assert.match(migrationSql, /trg_online_order_status_history_lock_tenant/);
  assert.match(migrationSql, /trg_tenant_push_subscriptions_lock_tenant/);
  assert.match(menuStorageSource, /normalizeTenantId/);
  assert.match(menuStorageSource, /retention_status/);
});

test('Etapa 2.1 Casos 1 a 3: Tenant suspended mantem sessao para SubscriptionBlockedScreen mas bloqueia tabelas operacionais; archived bloqueado totalmente', () => {
  const now = Date.parse('2026-11-19T12:00:00.000Z');

  // Caso 1: Tenant suspended retorna TenantContext com accessAllowed=false para mostrar SubscriptionBlockedScreen
  const suspendedCtx = buildTenantContextFromRows(
    makeMemberRow({ tenantId: 'tenant-susp', tenantStatus: 'suspended' }),
    { status: 'active', grace_until: null },
    now,
  );
  assert.ok(suspendedCtx, 'Tenant suspended precisa manter TenantContext visivel na sessao');
  assert.equal(suspendedCtx?.accessAllowed, false);
  assert.equal(suspendedCtx?.accessBlockReason, 'tenant_suspended');

  // Caso 3: Tenant archived (ou status desconhecido) continua totalmente bloqueado (retorna null)
  assert.equal(
    buildTenantContextFromRows(
      makeMemberRow({ tenantId: 'tenant-arch', tenantStatus: 'archived' }),
      { status: 'active', grace_until: null },
      now,
    ),
    null,
  );
  assert.equal(
    buildTenantContextFromRows(
      makeMemberRow({ tenantId: 'tenant-unknown', tenantStatus: 'deleted' }),
      { status: 'active', grace_until: null },
      now,
    ),
    null,
  );

  // Migration 2.1 redefine get_my_tenant_ids() incluindo active e suspended (sem archived)
  assert.match(
    migration21Sql,
    /CREATE OR REPLACE FUNCTION public\.get_my_tenant_ids\(\)[\s\S]*t\.status IN \('active', 'suspended'\)/,
  );
  assert.doesNotMatch(
    migration21Sql,
    /get_my_tenant_ids\(\)[\s\S]*'archived'/,
  );

  // Caso 2: Todas as funcoes operacionais exigem t.status = 'active'
  assert.match(initialSql, /is_tenant_member[\s\S]*t\.status = 'active'/);
  assert.match(initialSql, /is_tenant_owner[\s\S]*t\.status = 'active'/);
  assert.match(migrationSql, /is_tenant_billing_active[\s\S]*t\.status = 'active'/);
  assert.match(etapa4Sql, /has_tenant_role[\s\S]*t\.status = 'active'/);
});

test('Etapa 2.1 Casos 4 a 6: RBAC visual e no banco para expenses e sales (manager nao ve excluir; staff sem despesas; owner/admin com excluir)', () => {
  // staff nao consulta nem exclui despesas
  assert.equal(hasTenantPermission('staff', 'sales:create'), true);
  assert.equal(hasTenantPermission('staff', 'sales:read'), false);
  assert.equal(hasTenantPermission('staff', 'expenses:read'), false);
  assert.equal(hasTenantPermission('staff', 'expenses:create'), false);
  assert.equal(hasTenantPermission('staff', 'expenses:delete'), false);

  // manager consulta e cria despesas, mas nao exclui despesas nem vendas
  assert.equal(hasTenantPermission('manager', 'expenses:read'), true);
  assert.equal(hasTenantPermission('manager', 'expenses:create'), true);
  assert.equal(hasTenantPermission('manager', 'expenses:update'), true);
  assert.equal(hasTenantPermission('manager', 'expenses:delete'), false);
  assert.equal(hasTenantPermission('manager', 'sales:delete'), false);

  // owner e admin excluem despesas e vendas
  assert.equal(hasTenantPermission('owner', 'expenses:delete'), true);
  assert.equal(hasTenantPermission('admin', 'expenses:delete'), true);
  assert.equal(hasTenantPermission('owner', 'sales:delete'), true);
  assert.equal(hasTenantPermission('admin', 'sales:delete'), true);

  const sampleExpense: ExpenseRecord = {
    id: 'exp-1',
    ownerId: 'user-1',
    description: 'Carne bovina',
    amount: 120,
    category: 'Carnes e hambúrgueres',
    date: '2026-11-19',
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const sampleSale: SaleRecord = {
    id: 'sale-1',
    ownerId: 'user-1',
    date: '2026-11-19',
    quantity: 2,
    unitPrice: 25,
    totalAmount: 50,
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: 1,
    updatedAtMs: 1,
  };

  // Caso 4: Manager na UI nao enxerga botao Excluir em ExpensesView nem SalesView, mas enxerga Editar e Nova
  const managerExpenseHtml = renderToStaticMarkup(
    React.createElement(ExpensesView, {
      expenses: [sampleExpense],
      canCreateExpenses: hasTenantPermission('manager', 'expenses:create'),
      canEditExpenses: hasTenantPermission('manager', 'expenses:update'),
      canDeleteExpenses: hasTenantPermission('manager', 'expenses:delete'),
      onOpenNewExpense: () => {},
      onEditExpense: () => {},
      onDeleteExpense: async () => {},
    }),
  );
  assert.match(managerExpenseHtml, /Nova Despesa/);
  assert.match(managerExpenseHtml, /Editar despesa Carne bovina/);
  assert.doesNotMatch(managerExpenseHtml, /Excluir despesa Carne bovina/);

  const managerSalesHtml = renderToStaticMarkup(
    React.createElement(SalesView, {
      sales: [sampleSale],
      canCreateSales: hasTenantPermission('manager', 'sales:create'),
      canEditSales: hasTenantPermission('manager', 'sales:update'),
      canDeleteSales: hasTenantPermission('manager', 'sales:delete'),
      onOpenNewSale: () => {},
      onEditSale: () => {},
      onDeleteSale: async () => {},
    }),
  );
  assert.match(managerSalesHtml, /Nova Venda/);
  assert.match(managerSalesHtml, /Editar venda/);
  assert.doesNotMatch(managerSalesHtml, /Excluir venda/);

  // Caso 6: Owner/Admin enxerga botao Excluir normalmente
  const adminExpenseHtml = renderToStaticMarkup(
    React.createElement(ExpensesView, {
      expenses: [sampleExpense],
      canCreateExpenses: hasTenantPermission('admin', 'expenses:create'),
      canEditExpenses: hasTenantPermission('admin', 'expenses:update'),
      canDeleteExpenses: hasTenantPermission('admin', 'expenses:delete'),
      onOpenNewExpense: () => {},
      onEditExpense: () => {},
      onDeleteExpense: async () => {},
    }),
  );
  assert.match(adminExpenseHtml, /Excluir despesa Carne bovina/);

  const ownerSalesHtml = renderToStaticMarkup(
    React.createElement(SalesView, {
      sales: [sampleSale],
      canCreateSales: hasTenantPermission('owner', 'sales:create'),
      canEditSales: hasTenantPermission('owner', 'sales:update'),
      canDeleteSales: hasTenantPermission('owner', 'sales:delete'),
      onOpenNewSale: () => {},
      onEditSale: () => {},
      onDeleteSale: async () => {},
    }),
  );
  assert.match(ownerSalesHtml, /Excluir venda/);
});

test('Cenarios 4 a 10 e Etapa 2.1 Casos 12 e 13: Plano R$ 49,90, DEFAULT 4990, trial 3 dias, carencia 3 dias e constraints CHECK de retencao', () => {
  assert.equal(PLAN_CATALOG.mgw_mensal_49.amountCents, 4990);
  assert.equal(PLAN_CATALOG.free.selfServeAllowed, false);
  assert.match(migrationSql, /amount_cents = 4990/);
  assert.match(migrationSql, /v_trial_days integer := 3/);
  assert.match(migrationSql, /interval '3 days'/);

  // Caso 12: DEFAULT 4990 na tabela subscriptions
  assert.match(
    migration21Sql,
    /ALTER TABLE public\.subscriptions[\s\S]*ALTER COLUMN plan_amount_cents SET DEFAULT 4990/,
  );

  // Caso 13: CHECK constraints de integridade de retencao (6 meses, sem inicio prematuro ou datas invalidas)
  assert.match(migration21Sql, /ADD CONSTRAINT chk_subscriptions_retention_dates CHECK/);
  assert.match(migration21Sql, /retention_status = 'none'[\s\S]*retention_started_at IS NULL[\s\S]*retention_ends_at IS NULL/);
  assert.match(migration21Sql, /retention_status IN \('active_retention', 'expired'\)[\s\S]*ended_at IS NOT NULL[\s\S]*retention_started_at IS NOT NULL[\s\S]*retention_ends_at IS NOT NULL/);
  assert.match(migration21Sql, /interval '6 months'/);
  assert.match(migration21Sql, /ADD CONSTRAINT chk_subscriptions_retention_eligibility CHECK/);
  assert.match(migration21Sql, /status IN \('cancelled', 'expired', 'suspended'\)/);
  assert.match(migration21Sql, /ended_at >= current_period_end/);
  assert.match(migration21Sql, /ended_at >= trial_ends_at/);
  assert.match(migration21Sql, /ended_at >= grace_until/);

  const now = Date.parse('2026-11-19T12:00:00.000Z');
  const future = new Date(now + 2 * 86_400_000).toISOString();
  const past = new Date(now - 60_000).toISOString();

  assert.equal(
    evaluateTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'active', grace_until: null }, now).allowed,
    true,
  );
  assert.equal(
    evaluateTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'authorized', grace_until: null }, now).allowed,
    true,
  );
  assert.equal(
    evaluateTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'trialing', grace_until: null, trial_ends_at: future }, now).allowed,
    true,
  );

  const trialExpired = evaluateTenantBillingAccess(
    { billing_exempt: false, status: 'active' },
    { status: 'trialing', grace_until: null, trial_ends_at: past },
    now,
  );
  assert.equal(trialExpired.allowed, false);
  assert.equal(trialExpired.reason, 'trial_expired');

  assert.equal(
    evaluateTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'past_due', grace_until: future }, now).allowed,
    true,
  );
  assert.equal(
    evaluateTenantBillingAccess({ billing_exempt: false, status: 'active' }, { status: 'paused', grace_until: future }, now).allowed,
    true,
  );

  const graceExpired = evaluateTenantBillingAccess(
    { billing_exempt: false, status: 'active' },
    { status: 'past_due', grace_until: past },
    now,
  );
  assert.equal(graceExpired.allowed, false);
  assert.equal(graceExpired.reason, 'grace_expired');

  assert.equal(
    evaluateTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'cancelled', grace_until: null, current_period_end: future },
      now,
    ).allowed,
    true,
  );

  const cancelledEnded = evaluateTenantBillingAccess(
    { billing_exempt: false, status: 'active' },
    { status: 'cancelled', grace_until: null, current_period_end: past },
    now,
  );
  assert.equal(cancelledEnded.allowed, false);
  assert.equal(cancelledEnded.reason, 'cancelled_ended');

  const inRetention = evaluateTenantBillingAccess(
    { billing_exempt: false, status: 'active' },
    { status: 'active', grace_until: null, retention_status: 'active_retention' },
    now,
  );
  assert.equal(inRetention.allowed, false);
  assert.equal(inRetention.reason, 'retention_active');

  assert.equal(normalizeRetentionStatus('active_retention'), 'active_retention');
  assert.equal(normalizeRetentionStatus('expired'), 'expired');
  assert.equal(normalizeRetentionStatus('other'), 'none');
  assert.equal(normalizeSubscriptionStatus('past_due', false), 'past_due');
  assert.equal(normalizeSubscriptionStatus('expired', false), 'expired');

  assert.match(migrationSql, /FROM public\.digital_menu_settings d[\s\S]*public\.is_tenant_billing_active\(d\.tenant_id\)/);
  assert.match(migrationSql, /NOT public\.is_tenant_billing_active\(v_menu\.tenant_id\)/);
});

test('Cenarios 12 e 13: Pedido online concluido gera apenas 1 venda com delivery_fee no total_amount e timezone configuravel', () => {
  const completedOrder: OnlineOrderRecord = {
    id: 'order-99',
    tenantId: 'tenant-a',
    orderNumber: 99,
    orderCode: '00099',
    tokenHash: 'hash-99',
    status: 'completed',
    fulfillmentType: 'delivery',
    customerName: 'Ana',
    customerPhone: '11999990000',
    deliveryAddress: 'Rua A, 123',
    deliveryReference: '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: 'Sem picles',
    subtotalAmount: 47,
    deliveryFee: 5,
    totalAmount: 52,
    rejectionReason: '',
    viewedAtMs: 1,
    acceptedAtMs: 2,
    preparingAtMs: 3,
    readyAtMs: 4,
    dispatchedAtMs: 5,
    completedAtMs: Date.parse('2026-11-19T20:00:00.000Z'),
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: 1,
    updatedAtMs: 5,
    items: [
      {
        id: 'i1',
        itemKind: 'product',
        refId: 'p1',
        itemName: 'X-Salada',
        quantity: 2,
        unitPrice: 23.5,
        lineTotal: 47,
        selectedAddons: [],
        estimatedUnitCost: 0,
        xSaladasPerUnit: 2,
        components: [
          {
            productId: 'p1',
            productName: 'X-Salada',
            quantityPerUnit: 1,
            totalQuantity: 2,
            countsAsXSalada: true,
          },
        ],
        itemNote: '',
      },
    ],
    statusHistory: [],
  };

  const saleInput = buildSaleInputFromCompletedOrder(completedOrder, '2026-11-19');
  assert.equal(saleInput.totalAmount, 52);
  assert.equal(saleInput.deliveryFee, 5);

  const supabaseSale = buildSalePayloadForSupabase(saleInput);
  assert.equal(supabaseSale.total_amount, 52);
  assert.equal(supabaseSale.delivery_fee, 5);
  assert.equal(supabaseSale.online_order_id, 'order-99');

  const mappedSettings = mapShopSettingsRow({
    tenant_id: 'tenant-a',
    owner_email: 'dono@lanchonete.com',
    establishment_name: 'Lanche A',
    x_salada_price: 22,
    daily_goal: 800,
    monthly_goal: 18000,
    start_date: '2026-01-01',
    timezone: 'America/Manaus',
  });
  assert.equal(mappedSettings.timezone, 'America/Manaus');
  assert.equal(
    buildSettingsPayloadForSupabase({
      establishmentName: 'Lanche A',
      xSaladaPrice: 22,
      dailyGoal: 800,
      monthlyGoal: 18000,
      startDate: '2026-01-01',
      timezone: 'America/Sao_Paulo',
    }).timezone,
    'America/Sao_Paulo',
  );

  assert.match(migrationSql, /IF p_next_status = 'completed' AND v_order\.sale_id IS NULL THEN/);
  assert.match(migrationSql, /v_sale_total := greatest\([\s\S]*v_order\.total_amount/);
  assert.match(migrationSql, /v_sale_date := \(v_now AT TIME ZONE v_tz\)::date/);
});

test('Etapa 2.1 Casos 7 a 10: Acompanhamento publico sem Broadcast, sem tokenHash exposto e rejeicao de token invalido', () => {
  // Caso 8: Zero Realtime Broadcast no dataService e nenhuma dependencia de tokenHash na tela publica
  assert.doesNotMatch(dataServiceSource, /public-order-/);
  assert.doesNotMatch(dataServiceSource, /type:\s*'broadcast'/);
  assert.doesNotMatch(dataServiceSource, /table:\s*'online_order_realtime_pings'/);
  assert.doesNotMatch(trackingViewSource, /if\s*\(!order\?\.tokenHash\)/);

  // Caso 9: get_public_order_by_token e create_public_online_order na migration 2.1 nao expoem tokenHash
  assert.doesNotMatch(migration21Sql, /'tokenHash'/);
  assert.match(migration21Sql, /CREATE OR REPLACE FUNCTION public\.get_public_order_by_token/);
  assert.match(migration21Sql, /CREATE OR REPLACE FUNCTION public\.create_public_online_order/);

  // Caso 7: Token valido mapeia PublicOrderTrackingRecord normalmente sem tokenHash
  const mappedValid = mapPublicOrderTrackingRpcResponse({
    found: true,
    order: {
      orderId: 'order-1',
      orderNumber: 42,
      orderCode: '00042',
      status: 'preparing',
      fulfillmentType: 'delivery',
      customerName: 'Maria',
      deliveryAddress: 'Rua Central, 100',
      deliveryReference: '',
      paymentMethod: 'Pix',
      changeFor: null,
      customerNote: '',
      subtotalAmount: 30,
      deliveryFee: 5,
      totalAmount: 35,
      rejectionReason: '',
      storeName: 'MGW Lanches',
      storeSlug: 'mgw_lanches',
      storeWhatsapp: '',
      storeAddress: '',
      storePixKey: '',
      createdAt: '2026-11-19T12:00:00.000Z',
      updatedAt: '2026-11-19T12:05:00.000Z',
      items: [],
      statusHistory: [],
    },
  });
  assert.ok(mappedValid);
  assert.equal(mappedValid?.orderCode, '00042');
  assert.equal(mappedValid?.status, 'preparing');
  assert.equal('tokenHash' in (mappedValid ?? {}), false);

  // Caso 10: Token invalido / nao encontrado retorna null
  assert.equal(mapPublicOrderTrackingRpcResponse(null), null);
  assert.equal(mapPublicOrderTrackingRpcResponse({ found: false }), null);
});

test('Etapa 2.1 Caso 11: Polling controlado executa visivel, pausa oculto, retoma ao voltar, evita concorrencia, para em status terminal e limpa ao desmontar', async () => {
  let visible = true;
  let visibilityListeners: Array<() => void> = [];
  let scheduledCallback: (() => void) | undefined;
  let scheduledMs = 0;
  let clearTimerCalls = 0;
  let nextTimerHandle = 1;
  let activeTimerHandle: ReturnType<typeof setInterval> | null = null;
  const triggerTick = () => {
    if (!scheduledCallback) {
      throw new Error('Timer callback not scheduled');
    }
    scheduledCallback();
  };

  let fetchCalls = 0;
  let resolveSlowFetch: ((value: PublicOrderTrackingRecord | null) => void) | undefined;
  let nextResponse: PublicOrderTrackingRecord | null = makeTrackingRecord('preparing');
  let mode: 'sync' | 'slow' = 'sync';
  const receivedStatuses: string[] = [];

  const cleanup = createPublicOrderPollingController({
    token: 'secret-token-123',
    intervalMs: 10000,
    onUpdate: (order) => {
      if (order) receivedStatuses.push(order.status);
    },
    onError: (err) => {
      throw err;
    },
    fetchOrder: async () => {
      fetchCalls += 1;
      if (mode === 'slow') {
        return new Promise<PublicOrderTrackingRecord | null>((resolve) => {
          resolveSlowFetch = resolve;
        });
      }
      return nextResponse;
    },
    isVisible: () => visible,
    addVisibilityListener: (listener) => {
      visibilityListeners.push(listener);
      return () => {
        visibilityListeners = visibilityListeners.filter((l) => l !== listener);
      };
    },
    setTimer: (fn, ms) => {
      scheduledCallback = fn;
      scheduledMs = ms;
      activeTimerHandle = nextTimerHandle++ as unknown as ReturnType<typeof setInterval>;
      return activeTimerHandle;
    },
    clearTimer: () => {
      clearTimerCalls += 1;
      scheduledCallback = undefined;
      activeTimerHandle = null;
    },
  });

  // Timer criado com 10s quando aba esta visivel
  assert.equal(scheduledMs, 10000);
  assert.equal(visibilityListeners.length, 1);

  // Tick enquanto visivel executa fetch
  triggerTick();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(receivedStatuses, ['preparing']);

  // Nao dispara requisicoes simultaneas enquanto uma ja esta em andamento (inFlight)
  mode = 'slow';
  triggerTick();
  await Promise.resolve();
  assert.equal(fetchCalls, 2);
  triggerTick(); // Ignorado enquanto request 2 ainda esta pendente
  assert.equal(fetchCalls, 2);
  resolveSlowFetch?.(makeTrackingRecord('ready'));
  await Promise.resolve();
  await Promise.resolve();
  mode = 'sync';
  nextResponse = makeTrackingRecord('ready');
  assert.deepEqual(receivedStatuses, ['preparing', 'ready']);

  // Ocultar aba pausa imediatamente o timer
  visible = false;
  visibilityListeners[0]();
  assert.equal(activeTimerHandle, null);
  assert.equal(clearTimerCalls, 1);

  // Voltar para aba visivel retoma timer e dispara atualizacao imediata
  visible = true;
  visibilityListeners[0]();
  await Promise.resolve();
  assert.equal(fetchCalls, 3);
  assert.ok(activeTimerHandle !== null);

  // Ao receber status terminal (completed), o polling para permanentemente e limpa timer/listener
  nextResponse = makeTrackingRecord('completed');
  triggerTick();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(receivedStatuses, ['preparing', 'ready', 'ready', 'completed']);
  assert.equal(activeTimerHandle, null);
  assert.equal(visibilityListeners.length, 0);

  // Chamada extra de unmount/cleanup permanece segura e idempotente
  cleanup();
  assert.equal(activeTimerHandle, null);
  assert.equal(visibilityListeners.length, 0);
});

test('Etapa 2.1 Caso 11b: Cleanup ao desmontar cancela timer e listener antes de status terminal', () => {
  let activeListeners = 0;
  let cleared = 0;

  const unmount = createPublicOrderPollingController({
    token: 'tok-unmount',
    onUpdate: () => {},
    onError: () => {},
    fetchOrder: async () => makeTrackingRecord('received'),
    isVisible: () => true,
    addVisibilityListener: () => {
      activeListeners += 1;
      return () => {
        activeListeners -= 1;
      };
    },
    setTimer: () => 99 as unknown as ReturnType<typeof setInterval>,
    clearTimer: () => {
      cleared += 1;
    },
  });

  assert.equal(activeListeners, 1);
  unmount();
  assert.equal(activeListeners, 0);
  assert.equal(cleared, 1);
});

test('Etapa 2.1 Edge Functions sem @ts-nocheck e com CORS configuravel por ALLOWED_ORIGINS', () => {
  assert.doesNotMatch(menuStorageSource, /@ts-nocheck/);
  assert.doesNotMatch(sendPushSource, /@ts-nocheck/);
  assert.match(menuStorageSource, /ALLOWED_ORIGINS/);
  assert.match(sendPushSource, /ALLOWED_ORIGINS/);
});

test('Cenario 15: Onboarding Google OAuth atualiza o mesmo tenant sem criar estabelecimento duplicado', () => {
  const unboardedCtx = buildTenantContextFromRows(
    makeMemberRow({
      tenantId: 'tenant-oauth-1',
      name: 'Meu Estabelecimento',
      onboardingCompleted: false,
    }),
    {
      status: 'trialing',
      grace_until: null,
      trial_ends_at: '2099-01-01T00:00:00.000Z',
    },
  );
  assert.equal(unboardedCtx?.onboardingCompleted, false);
  assert.equal(unboardedCtx?.accessAllowed, true);

  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.complete_tenant_onboarding\(/);
  assert.match(migrationSql, /v_onboarding_completed := \(v_provided_name <> ''\)/);
  assert.match(migrationSql, /UPDATE public\.tenants[\s\S]*onboarding_completed = true/);
  assert.match(migrationSql, /IF NEW\.onboarding_completed IS DISTINCT FROM OLD\.onboarding_completed THEN/);
  assert.match(dataServiceSource, /rpc\('complete_tenant_onboarding'/);
});

test('hasActiveTenantBillingAccess permanece consistente com evaluateTenantBillingAccess', () => {
  assert.equal(
    hasActiveTenantBillingAccess({ billing_exempt: true, status: 'active' }, null),
    true,
  );
  assert.equal(
    hasActiveTenantBillingAccess(
      { billing_exempt: false, status: 'active' },
      { status: 'active', grace_until: null, retention_status: 'expired' },
    ),
    false,
  );
});

test('Etapa 2 Final: Fuso horario padrao America/Manaus, taxa de entrega na conversao e RBAC de push subscriptions', () => {
  assert.equal(DEFAULT_SHOP_SETTINGS.timezone, 'America/Manaus');

  const defaultMappedSettings = mapShopSettingsRow({
    tenant_id: 'tenant-manaus',
    owner_email: 'dono@lanchonete.com',
    establishment_name: 'MGW Lanches',
    x_salada_price: 22,
    daily_goal: 800,
    monthly_goal: 18000,
    start_date: '2026-01-01',
    timezone: null,
  });
  assert.equal(defaultMappedSettings.timezone, 'America/Manaus');

  // 2026-11-20T03:30:00.000Z = 2026-11-19 23:30 em America/Manaus (UTC-4) vs 2026-11-20 00:30 em America/Sao_Paulo (UTC-3)
  const lateNightOrder: OnlineOrderRecord = {
    id: 'order-manaus-1',
    tenantId: 'tenant-manaus',
    orderNumber: 101,
    orderCode: '00101',
    tokenHash: 'hash-101',
    status: 'completed',
    fulfillmentType: 'delivery',
    customerName: 'Carlos',
    customerPhone: '92999990000',
    deliveryAddress: 'Av. Djalma Batista, 100',
    deliveryReference: '',
    paymentMethod: 'Pix',
    changeFor: null,
    customerNote: '',
    subtotalAmount: 47,
    deliveryFee: 5,
    totalAmount: 47, // Simula registro sem deliveryFee somada no totalAmount
    rejectionReason: '',
    viewedAtMs: 1,
    acceptedAtMs: 2,
    preparingAtMs: 3,
    readyAtMs: 4,
    dispatchedAtMs: 5,
    completedAtMs: Date.parse('2026-11-20T03:30:00.000Z'),
    cancelledAtMs: null,
    saleId: null,
    createdAtMs: 1,
    updatedAtMs: 5,
    items: [
      {
        id: 'item-1',
        itemKind: 'product',
        refId: 'prod-1',
        itemName: 'X-Salada',
        quantity: 2,
        unitPrice: 23.5,
        lineTotal: 47,
        selectedAddons: [],
        estimatedUnitCost: 0,
        xSaladasPerUnit: 2,
        components: [
          {
            productId: 'prod-1',
            productName: 'X-Salada',
            quantityPerUnit: 1,
            totalQuantity: 2,
            countsAsXSalada: true,
          },
        ],
        itemNote: '',
      },
    ],
    statusHistory: [],
  };

  const saleManaus = buildSaleInputFromCompletedOrder(lateNightOrder);
  assert.equal(saleManaus.date, '2026-11-19');
  assert.equal(saleManaus.deliveryFee, 5);
  assert.equal(saleManaus.totalAmount, 52);

  const saleSaoPaulo = buildSaleInputFromCompletedOrder(
    lateNightOrder,
    undefined,
    'America/Sao_Paulo',
  );
  assert.equal(saleSaoPaulo.date, '2026-11-20');

  // Migration 20261119000003 valida DEFAULT/backfill America/Manaus, RPCs e RBAC de push
  assert.match(migration22Sql, /ALTER COLUMN timezone SET DEFAULT 'America\/Manaus'/);
  assert.match(migration22Sql, /SET[\s\S]*timezone = 'America\/Manaus'[\s\S]*WHERE timezone = 'America\/Sao_Paulo'/);
  assert.match(migration22Sql, /v_tz text := 'America\/Manaus'/);
  assert.match(migration22Sql, /v_delivery_fee := greatest\(0, coalesce\(v_order\.delivery_fee, 0\)\)/);
  assert.match(migration22Sql, /tenant_push_subscriptions_manage_own_by_role/);
  assert.match(migration22Sql, /has_tenant_role\(tenant_id, ARRAY\['owner', 'admin', 'manager'\]\)/);
});
