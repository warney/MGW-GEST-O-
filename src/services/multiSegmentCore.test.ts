import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/AppShell';
import { LoginScreen } from '../components/LoginScreen';
import { PublicMenuView } from '../components/PublicMenuView';
import { StoreOnboardingScreen } from '../components/StoreOnboardingScreen';
import { selectAuthorizedTenant } from './rbacPolicy';
import {
  getSegmentConfig,
  getSignupSegmentOptions,
  isSegmentFeatureEnabled,
  isValidBusinessSegment,
  normalizeBusinessSegment,
  parseStrictBusinessSegment,
  resolvePublicStoreSegment,
  resolvePublicStoreSegmentConfig,
  resolveTenantSegment,
  resolveTenantSegmentConfig,
} from './segmentEngine';
import {
  buildTenantContextFromRows,
  mapPublicDigitalMenuRpcResponse,
} from './supabaseMappers';
import { BUSINESS_SEGMENTS } from '../types/segments';
import type { PublicDigitalMenuPayload, TenantContext } from '../types/finance';

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261127120000_etapa2_multi_segment_core.sql',
);
const DATA_SERVICE_PATH = path.resolve(
  process.cwd(),
  'src/services/dataService.ts',
);

const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
const dataServiceSource = fs.readFileSync(DATA_SERVICE_PATH, 'utf8');

function makeTenantMemberRow(overrides: {
  tenantId?: string;
  slug?: string;
  name?: string;
  businessSegment?: string | null;
  includeSegmentKey?: boolean;
}) {
  const tenantId = overrides.tenantId ?? 'tenant-lanchonete';
  const tenantObj: {
    id: string;
    slug: string;
    name: string;
    is_founder_account: boolean;
    billing_exempt: boolean;
    status: string;
    onboarding_completed: boolean;
    business_segment?: string | null;
  } = {
    id: tenantId,
    slug: overrides.slug ?? tenantId,
    name: overrides.name ?? 'Lanchonete Central',
    is_founder_account: false,
    billing_exempt: false,
    status: 'active',
    onboarding_completed: true,
  };

  if (overrides.includeSegmentKey !== false) {
    tenantObj.business_segment = overrides.businessSegment;
  }

  return {
    id: `member-${tenantId}`,
    tenant_id: tenantId,
    user_id: 'user-1',
    email: 'owner@mgw.com.br',
    role: 'owner',
    is_founder: false,
    active: true,
    tenants: tenantObj,
  };
}

function makeActiveSubscriptionRow(tenantId: string) {
  return {
    tenant_id: tenantId,
    status: 'authorized',
    grace_until: null,
    trial_ends_at: null,
    current_period_end: null,
    ended_at: null,
    retention_started_at: null,
    retention_ends_at: null,
    retention_status: 'none',
  };
}

test('Cenário A: Lanchonete existente sem business_segment preserva comportamento, layout e cardápio atuais', () => {
  // Ausência do campo no payload antigo do banco deve assumir 'lanchonete'
  const legacyTenant = buildTenantContextFromRows(
    makeTenantMemberRow({
      tenantId: 'tenant-legado',
      name: 'MGW Lanches',
      includeSegmentKey: false,
    }),
    makeActiveSubscriptionRow('tenant-legado'),
  );

  assert.ok(legacyTenant);
  assert.equal(legacyTenant.businessSegment, BUSINESS_SEGMENTS.LANCHONETE);
  assert.equal(resolveTenantSegment(legacyTenant), BUSINESS_SEGMENTS.LANCHONETE);

  const lanchoneteConfig = resolveTenantSegmentConfig(legacyTenant);
  assert.equal(lanchoneteConfig.id, 'lanchonete');
  assert.equal(lanchoneteConfig.displayName, 'Lanchonete');
  assert.equal(lanchoneteConfig.operationalConfig.dashboardMetricsMode, 'snack_xsalada');
  assert.equal(lanchoneteConfig.specificFeatures.supportsSnackMetrics, true);
  assert.equal(lanchoneteConfig.specificFeatures.supportsStockControlFoundation, false);
  assert.equal(lanchoneteConfig.universalFeatures.combos, true);

  // AppShell preserva navegação e marca segmento 'lanchonete'
  const shellHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'dashboard',
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
      activeTenant: legacyTenant,
      tenants: [legacyTenant],
      establishmentName: 'MGW Lanches',
      userEmail: 'owner@mgw.com.br',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Conteúdo Lanchonete'),
    }),
  );

  assert.ok(shellHtml.includes('data-tenant-segment="lanchonete"'));
  assert.ok(shellHtml.includes('Produtos e Combos'));
  assert.ok(shellHtml.includes('Cardápio Digital'));

  // Cardápio público antigo sem campo businessSegment resolve para 'lanchonete' e preserva texto original
  const publicPayload = mapPublicDigitalMenuRpcResponse({
    found: true,
    store: {
      slug: 'mgw-lanches',
      isActive: true,
      isOpen: true,
      storeName: 'MGW Lanches',
      description: 'Os melhores lanches',
      phoneWhatsapp: '92999990000',
      address: 'Rua 1',
      openingHours: '18h às 23h',
      pixKey: '',
      logoUrl: '',
      bannerUrl: '',
      deliveryFee: 5,
      minimumOrderAmount: 15,
      acceptsDelivery: true,
      acceptsPickup: true,
      timezone: 'America/Manaus',
    },
    products: [],
    combos: [],
  });

  assert.equal(publicPayload.store?.businessSegment, 'lanchonete');
  assert.equal(resolvePublicStoreSegment(publicPayload.store), 'lanchonete');

  const menuHtml = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'mgw-lanches',
      onOrderCreated: () => {},
      initialPayload: publicPayload,
      initialActiveOrders: [],
    }),
  );

  assert.ok(menuHtml.includes('data-store-segment="lanchonete"'));
  assert.ok(menuHtml.includes('Nenhum item encontrado neste filtro'));
  assert.ok(!menuHtml.includes('Catálogo em preparação'));
});

test('Cenário B: Nova Adega permite escolha no cadastro/onboarding, persiste segmento e inicia Cardápio Digital vazio', () => {
  // Opções oficiais de cadastro contemplam apenas Lanchonete e Adega nesta etapa
  const signupOptions = getSignupSegmentOptions();
  assert.deepEqual(
    signupOptions.map((o) => o.id),
    ['lanchonete', 'adega'],
  );

  const registerHtml = renderToStaticMarkup(
    createElement(LoginScreen, {
      onGoogleLogin: async () => {},
      onRegister: async () => {},
      supportsEmailAuth: true,
      isSigningIn: false,
      errorMessage: null,
      initialMode: 'register',
    }),
  );
  assert.ok(registerHtml.includes('Tipo de estabelecimento'));
  assert.ok(registerHtml.includes('data-segment-option="lanchonete"'));
  assert.ok(registerHtml.includes('data-segment-option="adega"'));

  const onboardingHtml = renderToStaticMarkup(
    createElement(StoreOnboardingScreen, {
      accountEmail: 'adega@mgw.com.br',
      initialStoreName: 'Meu Estabelecimento',
      initialBusinessSegment: 'adega',
      onComplete: async () => {},
      onLogout: async () => {},
      onSubscribe: async () => {},
      onSubscribePix: async () => ({
        paymentId: 'p1',
        amountCents: 4990,
        qrCode: 'qr',
        qrCodeBase64: 'dGVzdA==',
        ticketUrl: '',
        expiresAt: null,
      }),
      tenantId: 'tenant-adega-1',
    }),
  );
  assert.ok(onboardingHtml.includes('data-segment-option="adega"'));
  assert.ok(onboardingHtml.includes('Ex: Adega Central'));

  // Tenant Adega carregado do backend
  const adegaTenant = buildTenantContextFromRows(
    makeTenantMemberRow({
      tenantId: 'tenant-adega-1',
      slug: 'adega-central',
      name: 'Adega Central',
      businessSegment: 'adega',
    }),
    makeActiveSubscriptionRow('tenant-adega-1'),
  );
  assert.ok(adegaTenant);
  assert.equal(adegaTenant.businessSegment, 'adega');

  const adegaConfig = resolveTenantSegmentConfig(adegaTenant);
  assert.equal(adegaConfig.id, 'adega');
  assert.equal(adegaConfig.displayName, 'Adega');
  assert.equal(adegaConfig.universalFeatures.combos, true);
  assert.equal(isSegmentFeatureEnabled('adega', 'combos'), true);
  assert.equal(isSegmentFeatureEnabled('adega', 'supportsSnackMetrics'), false);
  assert.equal(isSegmentFeatureEnabled('adega', 'supportsStockControlFoundation'), true);

  // MGW Gestão reconhece Adega no AppShell
  const adegaShellHtml = renderToStaticMarkup(
    createElement(AppShell, {
      effectiveRoute: 'dashboard',
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
      activeTenant: adegaTenant,
      tenants: [adegaTenant],
      establishmentName: 'Adega Central',
      userEmail: 'adega@mgw.com.br',
      onSelectTenant: () => {},
      onLogout: async () => {},
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrdersNotifications: () => {},
      children: createElement('div', null, 'Conteúdo Adega'),
    }),
  );
  assert.ok(adegaShellHtml.includes('data-tenant-segment="adega"'));

  // Cardápio Digital da Adega reconhece segmento diretamente do backend e inicia vazio (sem itens fictícios)
  const adegaPublicPayload: PublicDigitalMenuPayload = mapPublicDigitalMenuRpcResponse({
    found: true,
    store: {
      slug: 'adega-central',
      isActive: true,
      isOpen: true,
      storeName: 'Adega Central',
      description: 'Bebidas geladas e combos.',
      phoneWhatsapp: '92999991111',
      address: 'Av. Brasil, 200',
      openingHours: '10h às 02h',
      pixKey: '',
      logoUrl: '',
      bannerUrl: '',
      deliveryFee: 8,
      minimumOrderAmount: 20,
      acceptsDelivery: true,
      acceptsPickup: true,
      timezone: 'America/Manaus',
      businessSegment: 'adega',
    },
    products: [],
    combos: [],
  });

  assert.equal(adegaPublicPayload.products.length, 0);
  assert.equal(adegaPublicPayload.combos.length, 0);
  assert.equal(resolvePublicStoreSegmentConfig(adegaPublicPayload.store).id, 'adega');

  const adegaMenuHtml = renderToStaticMarkup(
    createElement(PublicMenuView, {
      slug: 'adega-central',
      onOrderCreated: () => {},
      initialPayload: adegaPublicPayload,
      initialActiveOrders: [],
    }),
  );
  assert.ok(adegaMenuHtml.includes('data-store-segment="adega"'));
  assert.ok(adegaMenuHtml.includes('Catálogo em preparação'));
  assert.ok(!adegaMenuHtml.includes('X-Salada'));
});

test('Cenário C: Isolamento multi-tenant, troca de estabelecimento e fallback seguro para nulos/inválidos', () => {
  const lanchoneteTenant: TenantContext = {
    tenantId: 'tenant-1',
    slug: 'lanche-1',
    name: 'Lanche 1',
    role: 'owner',
    isFounderAccount: false,
    billingExempt: false,
    subscriptionStatus: 'authorized',
    graceUntil: null,
    businessSegment: 'lanchonete',
    accessAllowed: true,
  };
  const adegaTenant: TenantContext = {
    tenantId: 'tenant-2',
    slug: 'adega-2',
    name: 'Adega 2',
    role: 'owner',
    isFounderAccount: false,
    billingExempt: false,
    subscriptionStatus: 'authorized',
    graceUntil: null,
    businessSegment: 'adega',
    accessAllowed: true,
  };

  const selected1 = selectAuthorizedTenant([lanchoneteTenant, adegaTenant], 'tenant-1');
  const selected2 = selectAuthorizedTenant([lanchoneteTenant, adegaTenant], 'tenant-2');
  assert.equal(resolveTenantSegmentConfig(selected1).id, 'lanchonete');
  assert.equal(resolveTenantSegmentConfig(selected2).id, 'adega');
  assert.notEqual(
    resolveTenantSegmentConfig(selected1).specificFeatures.supportsSnackMetrics,
    resolveTenantSegmentConfig(selected2).specificFeatures.supportsSnackMetrics,
  );

  // Fallback seguro em dados ausentes, nulos ou legados desconhecidos
  assert.equal(normalizeBusinessSegment(null), 'lanchonete');
  assert.equal(normalizeBusinessSegment(undefined), 'lanchonete');
  assert.equal(normalizeBusinessSegment(''), 'lanchonete');
  assert.equal(normalizeBusinessSegment('desconhecido'), 'lanchonete');
  assert.equal(normalizeBusinessSegment(' ADEGA '), 'adega');

  // Validação estrita impede cadastro fora dos dois segmentos iniciais
  assert.equal(isValidBusinessSegment('lanchonete'), true);
  assert.equal(isValidBusinessSegment('adega'), true);
  assert.equal(isValidBusinessSegment('pizzaria'), false);
  assert.equal(parseStrictBusinessSegment('pizzaria'), null);
  assert.equal(parseStrictBusinessSegment(''), null);
  assert.equal(parseStrictBusinessSegment('adega'), 'adega');

  assert.equal(getSegmentConfig(null).id, 'lanchonete');
});

test('Cenário D: Migration aditiva e camada de dados preservam RLS, bloqueiam adulteração e incluem rollback', () => {
  // Coluna aditiva com default retroativo 'lanchonete'
  assert.match(
    migrationSql,
    /ADD COLUMN IF NOT EXISTS business_segment text NOT NULL DEFAULT 'lanchonete'/i,
  );
  assert.match(
    migrationSql,
    /CHECK\s*\(\s*business_segment IN \('lanchonete', 'adega'\)\s*\)/i,
  );

  // Proteção contra adulteração direta e trava pós-onboarding
  assert.match(migrationSql, /guard_tenant_protected_fields/);
  assert.match(migrationSql, /Alteracao direta de business_segment nao e permitida/);
  assert.match(migrationSql, /IF NOT v_tenant\.onboarding_completed AND v_requested_segment IS NOT NULL/i);

  // Provisionamento preserva parceiros/indicações e cardápio público expõe segmento
  assert.match(migrationSql, /mgw_partner_referrals/);
  assert.match(migrationSql, /'businessSegment',\s*coalesce/i);

  // Proibições estritas: sem DROP TABLE/COLUMN, sem alteração de RLS, sem UPDATE em massa
  assert.doesNotMatch(migrationSql, /\bDROP\s+POLICY\b/i);
  assert.doesNotMatch(migrationSql, /\bALTER\s+POLICY\b/i);
  assert.doesNotMatch(migrationSql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migrationSql, /^\s*UPDATE\s+public\.tenants\s+SET\s+business_segment/im);

  // Bloco de rollback documentado
  assert.match(migrationSql, /ROLLBACK MANUAL/i);

  // Camada client consulta business_segment e envia no cadastro/onboarding
  assert.match(dataServiceSource, /tenants\s*\([^)]*business_segment/);
  assert.match(dataServiceSource, /business_segment:\s*safeSegment/);
  assert.match(dataServiceSource, /p_business_segment/);
});
