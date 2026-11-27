import {
  ADMIN_EMAILS,
  type AuthSessionUser,
  type ComboInput,
  type ComboRecord,
  type CreatePublicOrderPayload,
  type CreatePublicOrderResponse,
  DEFAULT_SHOP_SETTINGS,
  type DeliveryCourierAvailability,
  type DeliveryCourierInput,
  type DeliveryCourierRecord,
  type DeliveryCourierStatus,
  type DeliveryCustomerAddressInput,
  type DeliveryCustomerAddressRecord,
  type DeliveryCustomerClassificationConfig,
  type DeliveryCustomerInput,
  type DeliveryCustomerRecord,
  type DeliveryDispatchHistoryRecord,
  type DeliveryDispatchRecord,
  type DeliveryDispatchStatus,
  type DeliveryPricingSettings,
  type DeliveryPricingSettingsInput,
  type DeliveryRegionInput,
  type DeliveryRegionRecord,
  type DeliveryRegionStatus,
  type DigitalMenuSettings,
  type DigitalMenuSettingsInput,
  type ExpenseInput,
  type ExpenseRecord,
  MGW_WORKSPACE,
  type OnlineOrderRecord,
  type OnlineOrderStatus,
  type ProductInput,
  type ProductRecord,
  type PublicDigitalMenuPayload,
  type PublicOrderTrackingRecord,
  resolveWorkspaceForEmail,
  type SaleInput,
  type SaleRecord,
  SEPARATE_SHOP_EMAIL,
  type ShopSettings,
  type TenantContext,
  type WorkspaceAccess,
  type CreatePurchaseOrderInput,
  type InventoryDataBundle,
  type InventoryMovementRecord,
  type InventoryPackagingConversionInput,
  type ProductSupplierLinkInput,
  type ReceivePurchaseItemInput,
  type RecordInventoryMovementInput,
  type SupplierInput,
} from '../types/finance';
import {
  DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
  hasNonEmptyAddressFields,
} from '../utils/deliveryCustomers';
import { DEFAULT_DELIVERY_PRICING_SETTINGS } from '../utils/deliveryRegions';
import { roundCurrency } from '../utils/finance';
import {
  createInventoryIdempotencyKey,
  EMPTY_INVENTORY_BUNDLE,
} from '../utils/inventory';
import {
  DEFAULT_DIGITAL_MENU_SETTINGS,
  isTerminalOrderStatus,
  sanitizeMenuSlug,
} from '../utils/onlineOrders';
import { demoMutations, isDemoSandboxActive, subscribeDemoAdminState } from './demoSandbox';
import { getSupabaseClient } from '../lib/supabase';
import { hasTenantPermission } from './rbacPolicy';
import {
  normalizeBusinessSegment,
  parseStrictBusinessSegment,
} from './segmentEngine';
import {
  BUSINESS_SEGMENTS,
  type BusinessSegment,
} from '../types/segments';
import {
  buildComboPayloadForSupabase,
  buildDeliveryCourierPayloadForSupabase,
  buildDeliveryCustomerAddressPayloadForSupabase,
  buildDeliveryCustomerClassificationPayloadForSupabase,
  buildDeliveryCustomerPayloadForSupabase,
  buildDeliveryPricingSettingsPayloadForSupabase,
  buildDeliveryRegionPayloadForSupabase,
  buildDigitalMenuSettingsPayloadForSupabase,
  buildExpensePayloadForSupabase,
  buildInventoryPackagingConversionPayloadForSupabase,
  buildProductPayloadForSupabase,
  buildProductSupplierPayloadForSupabase,
  buildSalePayloadForSupabase,
  buildSettingsPayloadForSupabase,
  buildSupplierPayloadForSupabase,
  buildTenantContextFromRows,
  mapComboRow,
  mapDeliveryCourierRow,
  mapDeliveryCustomerAddressRow,
  mapDeliveryCustomerClassificationSettingsRow,
  mapDeliveryCustomerRow,
  mapDeliveryDispatchHistoryRow,
  mapDeliveryDispatchRow,
  mapDeliveryPricingSettingsRow,
  mapDeliveryRegionRow,
  mapDigitalMenuSettingsRow,
  mapExpenseRow,
  mapInventoryBalanceRow,
  mapInventoryCountItemRow,
  mapInventoryCountRow,
  mapInventoryMovementRow,
  mapInventoryPackagingConversionRow,
  mapOnlineOrderItemRow,
  mapOnlineOrderRow,
  mapOnlineOrderStatusHistoryRow,
  mapProductRow,
  mapProductSupplierRow,
  mapPublicDigitalMenuRpcResponse,
  mapPublicOrderTrackingRpcResponse,
  mapPurchaseOrderItemRow,
  mapPurchaseOrderRow,
  mapPurchaseReceiptItemRow,
  mapPurchaseReceiptRow,
  mapSaleRow,
  mapShopSettingsRow,
  mapSupabaseAuthErrorMessage,
  mapSupplierRow,
  type SupabaseComboRow,
  type SupabaseDeliveryCourierRow,
  type SupabaseDeliveryCustomerAddressRow,
  type SupabaseDeliveryCustomerClassificationSettingsRow,
  type SupabaseDeliveryCustomerRow,
  type SupabaseDeliveryDispatchHistoryRow,
  type SupabaseDeliveryDispatchRow,
  type SupabaseDeliveryPricingSettingsRow,
  type SupabaseDeliveryRegionRow,
  type SupabaseDigitalMenuSettingsRow,
  type SupabaseExpenseRow,
  type SupabaseInventoryBalanceRow,
  type SupabaseInventoryCountItemRow,
  type SupabaseInventoryCountRow,
  type SupabaseInventoryMovementRow,
  type SupabaseInventoryPackagingConversionRow,
  type SupabaseOnlineOrderItemRow,
  type SupabaseOnlineOrderRow,
  type SupabaseOnlineOrderStatusHistoryRow,
  type SupabaseProductRow,
  type SupabaseProductSupplierRow,
  type SupabasePurchaseOrderItemRow,
  type SupabasePurchaseOrderRow,
  type SupabasePurchaseReceiptItemRow,
  type SupabasePurchaseReceiptRow,
  type SupabaseSaleRow,
  type SupabaseShopSettingsRow,
  type SupabaseSubscriptionRow,
  type SupabaseSupplierRow,
  type SupabaseTenantMemberRow,
} from './supabaseMappers';

export interface DataExecutionContext {
  user: AuthSessionUser;
  tenant: TenantContext;
  workspace?: WorkspaceAccess;
}

export interface DataSubscriptionsCallbacks {
  onSettings: (settings: ShopSettings) => void;
  onDigitalMenuSettings?: (settings: DigitalMenuSettings) => void;
  onProducts: (products: ProductRecord[]) => void;
  onCombos: (combos: ComboRecord[]) => void;
  onSales: (sales: SaleRecord[]) => void;
  onExpenses: (expenses: ExpenseRecord[]) => void;
  onOnlineOrders?: (orders: OnlineOrderRecord[]) => void;
  onDeliveryCustomers?: (customers: DeliveryCustomerRecord[]) => void;
  onDeliveryCustomerAddresses?: (addresses: DeliveryCustomerAddressRecord[]) => void;
  onCustomerClassificationConfig?: (config: DeliveryCustomerClassificationConfig) => void;
  onDeliveryCouriers?: (couriers: DeliveryCourierRecord[]) => void;
  onDeliveryDispatches?: (dispatches: DeliveryDispatchRecord[]) => void;
  onDeliveryDispatchHistory?: (history: DeliveryDispatchHistoryRecord[]) => void;
  onDeliveryRegions?: (regions: DeliveryRegionRecord[]) => void;
  onDeliveryPricingSettings?: (settings: DeliveryPricingSettings) => void;
  onInventory?: (bundle: InventoryDataBundle) => void;
  onReady: () => void;
  onError: (err: Error) => void;
}

export interface PartnerAuthProfile {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  referralCode: string;
  status: 'active' | 'suspended' | 'blocked';
  createdAt: string;
}

export interface AuthResolutionState {
  user: AuthSessionUser | null;
  tenants: TenantContext[];
  partner?: PartnerAuthProfile | null;
  errorMessage: string | null;
  legacyWorkspace?: WorkspaceAccess;
  passwordRecovery?: boolean;
}

// Registro leve de listeners locais para re-sincronizar imediatamente apos mutacoes no modo Supabase
const supabaseRefreshListeners = new Map<string, Set<() => Promise<void>>>();

function notifyTenantRefresh(tenantId: string): void {
  const listeners = supabaseRefreshListeners.get(tenantId);
  if (!listeners) return;
  for (const listener of listeners) {
    void listener();
  }
}

function sortProducts(list: ProductRecord[]): ProductRecord[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

function sortCombos(list: ComboRecord[]): ComboRecord[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

function sortSales(list: SaleRecord[]): SaleRecord[] {
  return [...list].sort((a, b) =>
    b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAtMs - a.createdAtMs,
  );
}

function sortExpenses(list: ExpenseRecord[]): ExpenseRecord[] {
  return [...list].sort((a, b) =>
    b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAtMs - a.createdAtMs,
  );
}

// ==================== AUTENTICACAO E MULTI-TENANCY ====================

async function resolveSupabaseAuthenticatedContext(
  userId: string,
  email: string,
  emailVerified: boolean,
): Promise<AuthResolutionState> {
  if (!emailVerified || !email) {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    return {
      user: null,
      tenants: [],
      errorMessage:
        'Sua conta precisa ter um e-mail verificado para acessar o MGW GESTÃO.',
    };
  }

  const supabase = getSupabaseClient();

  // Primeiro identifica contas MGW Parceiros. Elas são independentes de tenants
  // e não devem executar rotinas de associação de estabelecimentos.
  const { data: partnerRow, error: partnerError } = await supabase
    .from('mgw_partners')
    .select('id, user_id, email, full_name, referral_code, status, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (partnerError) {
    return {
      user: null,
      tenants: [],
      errorMessage: `Não foi possível validar o perfil de parceiro: ${partnerError.message}`,
    };
  }

  if (partnerRow) {
    if (partnerRow.status !== 'active') {
      await supabase.auth.signOut();
      return {
        user: null,
        tenants: [],
        errorMessage: partnerRow.status === 'suspended'
          ? 'Sua conta de parceiro está suspensa. Entre em contato com o suporte MGW.'
          : 'Sua conta de parceiro está bloqueada. Entre em contato com o suporte MGW.',
      };
    }

    return {
      user: { uid: userId, email, emailVerified },
      tenants: [],
      partner: {
        id: String(partnerRow.id),
        userId: String(partnerRow.user_id),
        email: String(partnerRow.email),
        fullName: String(partnerRow.full_name),
        referralCode: String(partnerRow.referral_code),
        status: partnerRow.status,
        createdAt: String(partnerRow.created_at),
      },
      errorMessage: null,
    };
  }

  // Vincula automaticamente pré-cadastros pendentes (ex.: contas fundadoras)
  // somente para usuários que realmente pertencem ao fluxo de estabelecimentos.
  const { error: claimError } = await supabase.rpc('claim_pending_memberships');
  if (claimError) {
    return {
      user: null,
      tenants: [],
      errorMessage: `Falha ao validar vínculo de estabelecimento: ${claimError.message}`,
    };
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('tenant_members')
    .select(
      'id, tenant_id, user_id, email, role, is_founder, active, tenants ( id, slug, name, is_founder_account, billing_exempt, status, onboarding_completed, business_segment )',
    )
    .eq('user_id', userId)
    .eq('active', true);

  if (memberError) {
    return {
      user: null,
      tenants: [],
      errorMessage: `Não foi possível consultar estabelecimentos autorizados: ${memberError.message}`,
    };
  }

  const typedMembers = (memberRows ?? []) as unknown as SupabaseTenantMemberRow[];
  const tenantIds = typedMembers.map((m) => m.tenant_id);

  let subsByTenant = new Map<string, SupabaseSubscriptionRow>();
  if (tenantIds.length > 0) {
    const { data: subRows, error: subError } = await supabase
      .from('subscriptions')
      .select(
        'tenant_id, status, grace_until, trial_ends_at, current_period_end, ended_at, retention_started_at, retention_ends_at, retention_status',
      )
      .in('tenant_id', tenantIds);

    if (!subError && Array.isArray(subRows)) {
      subsByTenant = new Map(
        subRows.map((s) => [
          String((s as { tenant_id: string }).tenant_id),
          s as SupabaseSubscriptionRow,
        ]),
      );
    }
  }

  const resolvedTenants: TenantContext[] = [];

  for (const member of typedMembers) {
    const sub = subsByTenant.get(member.tenant_id);
    const ctx = buildTenantContextFromRows(member, sub);
    if (ctx) {
      resolvedTenants.push(ctx);
    }
  }

  if (resolvedTenants.length === 0) {
    await supabase.auth.signOut();
    return {
      user: null,
      tenants: [],
      errorMessage:
        'Esta conta autenticada não possui vínculo ativo com nenhum estabelecimento autorizado.',
    };
  }

  return {
    user: { uid: userId, email, emailVerified },
    tenants: resolvedTenants,
    errorMessage: null,
  };
}

export function subscribeAuthSession(
  onChange: (state: AuthResolutionState) => void,
): () => void {
  if (isDemoSandboxActive()) {
    onChange({
      user: {
        uid: 'demo-owner',
        email: 'warney.fernandes22@gmail.com',
        emailVerified: true,
      },
      tenants: [
        {
          tenantId: 'mgw_lanches',
          slug: 'mgw_lanches',
          name: 'MGW Lanches',
          role: 'owner',
          isFounderAccount: true,
          billingExempt: true,
          subscriptionStatus: 'exempt',
          graceUntil: null,
          retentionStatus: 'none',
          onboardingCompleted: true,
          businessSegment: BUSINESS_SEGMENTS.LANCHONETE,
          accessAllowed: true,
          accessBlockReason: null,
        },
      ],
      legacyWorkspace: MGW_WORKSPACE,
      errorMessage: null,
    });
    return () => {};
  }

  const supabase = getSupabaseClient();
  let active = true;

  const handleSessionUser = async (
    rawUser: { id: string; email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null } | null,
  ) => {
    if (!active) return;
    if (!rawUser) {
      onChange({ user: null, tenants: [], errorMessage: null });
      return;
    }
    const verified = Boolean(rawUser.email_confirmed_at || rawUser.confirmed_at);
    const resolved = await resolveSupabaseAuthenticatedContext(
      rawUser.id,
      rawUser.email || '',
      verified,
    );
    if (active) {
      onChange(resolved);
    }
  };

  void supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (!active) return;
      if (error) {
        onChange({
          user: null,
          tenants: [],
          errorMessage: mapSupabaseAuthErrorMessage(error),
        });
        return;
      }
      return handleSessionUser(data.session?.user ?? null);
    })
    .catch((err) => {
      if (!active) return;
      onChange({
        user: null,
        tenants: [],
        errorMessage: mapSupabaseAuthErrorMessage(err),
      });
    });

  const { data: subscription } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        onChange({
          user: null,
          tenants: [],
          errorMessage: null,
          passwordRecovery: true,
        });
        return;
      }
      if (event === 'SIGNED_OUT' || !session?.user) {
        onChange({ user: null, tenants: [], errorMessage: null, passwordRecovery: false });
        return;
      }
      // Evita chamadas de rede dentro do callback síncrono do Supabase Auth.
      window.setTimeout(() => {
        if (active) void handleSessionUser(session.user);
      }, 0);
    },
  );

  return () => {
    active = false;
    subscription.subscription.unsubscribe();
  };
}

export async function loginWithGoogle(): Promise<void> {
  
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
}

export async function loginWithEmailPassword(
  email: string,
  password: string,
): Promise<void> {
  
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Informe seu e-mail e senha.');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
}

export interface PlatformRuntimeStatus {
  platformName: string;
  supportEmail: string;
  supportWhatsapp: string;
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export const DEFAULT_PLATFORM_RUNTIME_STATUS: PlatformRuntimeStatus = {
  platformName: 'MGW Gestão',
  supportEmail: '',
  supportWhatsapp: '',
  allowPublicSignup: true,
  maintenanceMode: false,
  maintenanceMessage: '',
};

export async function fetchPlatformRuntimeStatus(): Promise<PlatformRuntimeStatus> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_platform_runtime_status');
    if (error || !data || typeof data !== 'object') {
      return DEFAULT_PLATFORM_RUNTIME_STATUS;
    }
    const record = data as Partial<PlatformRuntimeStatus>;
    return {
      platformName: record.platformName || 'MGW Gestão',
      supportEmail: record.supportEmail || '',
      supportWhatsapp: record.supportWhatsapp || '',
      allowPublicSignup: record.allowPublicSignup !== false,
      maintenanceMode: Boolean(record.maintenanceMode),
      maintenanceMessage: record.maintenanceMessage || '',
    };
  } catch {
    return DEFAULT_PLATFORM_RUNTIME_STATUS;
  }
}

export async function registerWithEmailPassword(
  name: string,
  storeName: string,
  email: string,
  password: string,
  businessSegment: BusinessSegment = BUSINESS_SEGMENTS.LANCHONETE,
): Promise<void> {
  const cleanName = name.trim().slice(0, 80);
  const cleanStoreName = storeName.trim().slice(0, 80);
  const cleanEmail = email.trim().toLowerCase();
  const safeSegment = parseStrictBusinessSegment(businessSegment);
  if (!safeSegment) {
    throw new Error('Segmento do estabelecimento inválido. Escolha Lanchonete ou Adega.');
  }
  if (!cleanName || !cleanStoreName || !cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Preencha seu nome, o nome do estabelecimento e um e-mail válido.');
  }
  if (password.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }

  const runtimeStatus = await fetchPlatformRuntimeStatus();
  if (!runtimeStatus.allowPublicSignup) {
    throw new Error('Novos cadastros públicos estão temporariamente pausados pela administração.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
        shop_name: cleanStoreName,
        business_segment: safeSegment,
        ...(typeof window !== 'undefined' && /^[A-Z0-9]{8,16}$/i.test(new URLSearchParams(window.location.search).get('ref') || '')
          ? { referral_code: (new URLSearchParams(window.location.search).get('ref') || '').trim().toUpperCase() }
          : {}),
        ...(typeof window !== 'undefined' && /^[a-z0-9][a-z0-9-]{2,79}$/i.test(new URLSearchParams(window.location.search).get('campanha') || '')
          ? { partner_campaign_slug: (new URLSearchParams(window.location.search).get('campanha') || '').trim().toLowerCase() }
          : {}),
      },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
  if (!data.user) {
    throw new Error('Não foi possível concluir o cadastro. Tente novamente.');
  }
  if (data.session) {
    // O trigger do banco cria o tenant e o vínculo atomicamente ao inserir auth.users.
    return;
  }
}

export async function registerPartnerWithEmailPassword(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  const cleanName = name.trim().slice(0, 120);
  const cleanEmail = email.trim().toLowerCase();

  if (cleanName.length < 2 || !cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe seu nome completo e um e-mail válido.');
  }
  if (password.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
        account_type: 'mgw_partner',
      },
      emailRedirectTo: window.location.origin + '/parceiros/painel',
    },
  });

  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
  if (!data.user) {
    throw new Error('Não foi possível concluir seu cadastro. Tente novamente.');
  }
}

export interface PartnerDashboardData {
  referral_count: number; converted_count: number; pending_cents: number; paid_cents: number; commission_percent: number;
  referrals: Array<{id:string;status:string;created_at:string;converted_at:string|null}>;
  commissions: Array<{id:string;amount_cents:number;base_amount_cents:number;commission_percent:number;status:string;created_at:string;paid_at:string|null;payment_reference:string|null;payment_method:string|null;reversal_required:boolean}>;
  payout_profile: {has_pix_key:boolean;pix_key_type:string;holder_name:string}|null;
}
export async function fetchPartnerDashboardData(): Promise<PartnerDashboardData> {
  const {data,error}=await getSupabaseClient().rpc('partner_get_dashboard');
  if(error) throw new Error(error.message);
  return data as PartnerDashboardData;
}
export async function savePartnerPayoutProfile(input: {
  pixKey: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  holderName: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('partner-payout-profile', {
    body: { pixKey: input.pixKey.trim(), pixKeyType: input.pixKeyType, holderName: input.holderName.trim() },
  });
  if (error || data?.saved !== true) throw new Error(error?.message || data?.error || 'Não foi possível salvar os dados Pix.');
}

export async function updateAccountPassword(password: string): Promise<void> {
    if (password.length < 8) {
    throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
  }
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(mapSupabaseAuthErrorMessage(error));
}

export async function requestPasswordReset(email: string): Promise<void> {
  
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um e-mail válido para recuperação de senha.');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: window.location.origin,
  });
  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
}

export async function logoutSession(): Promise<void> {
  
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
}

export async function completeTenantOnboarding(params: {
  tenantId: string;
  storeName: string;
  ownerName?: string;
  businessSegment?: BusinessSegment;
}): Promise<{
  tenantId: string;
  slug: string;
  name: string;
  onboardingCompleted: boolean;
  businessSegment: BusinessSegment;
}> {
  const cleanStoreName = params.storeName.trim().slice(0, 80);
  const cleanOwnerName = (params.ownerName || '').trim().slice(0, 120);
  if (cleanStoreName.length < 2) {
    throw new Error('Informe o nome do estabelecimento (mínimo 2 caracteres).');
  }

  let safeSegment: BusinessSegment | null = null;
  if (params.businessSegment !== undefined) {
    safeSegment = parseStrictBusinessSegment(params.businessSegment);
    if (!safeSegment) {
      throw new Error('Segmento do estabelecimento inválido. Escolha Lanchonete ou Adega.');
    }
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('complete_tenant_onboarding', {
    p_tenant_id: params.tenantId,
    p_store_name: cleanStoreName,
    p_owner_name: cleanOwnerName,
    ...(safeSegment ? { p_business_segment: safeSegment } : {}),
  });
  if (error) {
    throw new Error(error.message);
  }

  const res = (data ?? {}) as Record<string, unknown>;
  return {
    tenantId: String(res.tenantId || params.tenantId),
    slug: String(res.slug || ''),
    name: String(res.name || cleanStoreName),
    onboardingCompleted: res.onboardingCompleted !== false,
    businessSegment: normalizeBusinessSegment(res.businessSegment),
  };
}

// ==================== LEITURA E ASSINATURA REATIVA ====================

export function subscribeAllTenantData(
  ctx: DataExecutionContext,
  callbacks: DataSubscriptionsCallbacks,
): () => void {
  if (isDemoSandboxActive()) {
    return subscribeDemoAdminState({
      onSettings: callbacks.onSettings,
      onDigitalMenuSettings: (d) => callbacks.onDigitalMenuSettings?.(d),
      onProducts: callbacks.onProducts,
      onCombos: callbacks.onCombos,
      onSales: callbacks.onSales,
      onExpenses: callbacks.onExpenses,
      onOrders: (o) => callbacks.onOnlineOrders?.(o),
      onDeliveryCustomers: (c) => callbacks.onDeliveryCustomers?.(c),
      onDeliveryCustomerAddresses: (a) => callbacks.onDeliveryCustomerAddresses?.(a),
      onCustomerClassificationConfig: (cfg) => callbacks.onCustomerClassificationConfig?.(cfg),
      onDeliveryCouriers: (couriers) => callbacks.onDeliveryCouriers?.(couriers),
      onDeliveryDispatches: (dispatches) => callbacks.onDeliveryDispatches?.(dispatches),
      onDeliveryDispatchHistory: (history) => callbacks.onDeliveryDispatchHistory?.(history),
      onDeliveryRegions: (regions) => callbacks.onDeliveryRegions?.(regions),
      onDeliveryPricingSettings: (settings) => callbacks.onDeliveryPricingSettings?.(settings),
      onInventory: (bundle) => callbacks.onInventory?.(bundle),
      onReady: callbacks.onReady,
    });
  }

  
  // Modo Supabase (PostgreSQL + RLS + Realtime)
  if (
    ctx.tenant.accessAllowed === false ||
    ctx.tenant.onboardingCompleted === false
  ) {
    callbacks.onReady();
    return () => {};
  }

  const supabase = getSupabaseClient();
  const tenantId = ctx.tenant.tenantId;
  const canReadSales = hasTenantPermission(ctx.tenant.role, 'sales:read');
  const canReadExpenses = hasTenantPermission(ctx.tenant.role, 'expenses:read');
  const canAccessDelivery =
    hasTenantPermission(ctx.tenant.role, 'delivery:view') && canReadSales;
  const canAccessInventory =
    normalizeBusinessSegment(ctx.tenant.businessSegment) === 'adega' &&
    hasTenantPermission(ctx.tenant.role, 'inventory:read');
  let active = true;

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('shop_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!active) return;

    if (data) {
      callbacks.onSettings(
        mapShopSettingsRow(data as SupabaseShopSettingsRow, ctx.user.email),
      );
      return;
    }

    const defaultRow = {
      tenant_id: tenantId,
      owner_email: ctx.user.email,
      establishment_name: ctx.tenant.name || DEFAULT_SHOP_SETTINGS.establishmentName,
      x_salada_price: DEFAULT_SHOP_SETTINGS.xSaladaPrice,
      daily_goal: DEFAULT_SHOP_SETTINGS.dailyGoal,
      monthly_goal: DEFAULT_SHOP_SETTINGS.monthlyGoal,
      start_date: DEFAULT_SHOP_SETTINGS.startDate,
      timezone: DEFAULT_SHOP_SETTINGS.timezone || 'America/Manaus',
    };

    const { data: inserted, error: insertError } = await supabase
      .from('shop_settings')
      .upsert(defaultRow, { onConflict: 'tenant_id' })
      .select('*')
      .single();

    if (insertError) throw new Error(insertError.message);
    if (active && inserted) {
      callbacks.onSettings(
        mapShopSettingsRow(inserted as SupabaseShopSettingsRow, ctx.user.email),
      );
    }
  };

  const fetchDigitalMenuSettings = async () => {
    if (!callbacks.onDigitalMenuSettings) return;
    const { data, error } = await supabase
      .from('digital_menu_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      // Caso a tabela ainda nao exista em ambientes sem Migration 003, degrada graciosamente sem bloquear o sistema financeiro
      if (error.message.toLowerCase().includes('does not exist')) {
        if (active) {
          callbacks.onDigitalMenuSettings({
            tenantId,
            ...DEFAULT_DIGITAL_MENU_SETTINGS,
            slug: sanitizeMenuSlug(ctx.tenant.slug, 'mgw_lanches'),
            storeName: ctx.tenant.name || DEFAULT_DIGITAL_MENU_SETTINGS.storeName,
          });
        }
        return;
      }
      throw new Error(error.message);
    }

    if (!active) return;
    if (data) {
      callbacks.onDigitalMenuSettings(
        mapDigitalMenuSettingsRow(data as SupabaseDigitalMenuSettingsRow),
      );
    } else {
      callbacks.onDigitalMenuSettings({
        tenantId,
        ...DEFAULT_DIGITAL_MENU_SETTINGS,
        slug: sanitizeMenuSlug(ctx.tenant.slug, 'mgw_lanches'),
        storeName: ctx.tenant.name || DEFAULT_DIGITAL_MENU_SETTINGS.storeName,
      });
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    if (active) {
      const mapped = ((data ?? []) as SupabaseProductRow[]).map(mapProductRow);
      callbacks.onProducts(sortProducts(mapped));
    }
  };

  const fetchCombos = async () => {
    const { data, error } = await supabase
      .from('combos')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    if (active) {
      const mapped = ((data ?? []) as SupabaseComboRow[]).map(mapComboRow);
      callbacks.onCombos(sortCombos(mapped));
    }
  };

  const fetchSales = async () => {
    if (!canReadSales) {
      if (active) callbacks.onSales([]);
      return;
    }
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (active) {
      const mapped = ((data ?? []) as SupabaseSaleRow[]).map(mapSaleRow);
      callbacks.onSales(sortSales(mapped));
    }
  };

  const fetchExpenses = async () => {
    if (!canReadExpenses) {
      if (active) callbacks.onExpenses([]);
      return;
    }
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (active) {
      const mapped = ((data ?? []) as SupabaseExpenseRow[]).map(mapExpenseRow);
      callbacks.onExpenses(sortExpenses(mapped));
    }
  };

  const fetchOnlineOrders = async () => {
    if (!callbacks.onOnlineOrders) return;
    if (!canReadSales) {
      if (active) callbacks.onOnlineOrders([]);
      return;
    }
    const { data: orderRows, error: ordersError } = await supabase
      .from('online_orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (ordersError) {
      if (ordersError.message.toLowerCase().includes('does not exist')) {
        if (active) callbacks.onOnlineOrders([]);
        return;
      }
      throw new Error(ordersError.message);
    }

    const typedOrders = (orderRows ?? []) as SupabaseOnlineOrderRow[];
    if (typedOrders.length === 0) {
      if (active) callbacks.onOnlineOrders([]);
      return;
    }

    const [itemsRes, historyRes] = await Promise.all([
      supabase
        .from('online_order_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
      supabase
        .from('online_order_status_history')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    const itemsByOrder = new Map<string, ReturnType<typeof mapOnlineOrderItemRow>[]>();
    for (const row of (itemsRes.data ?? []) as SupabaseOnlineOrderItemRow[]) {
      const mapped = mapOnlineOrderItemRow(row);
      const list = itemsByOrder.get(row.order_id) ?? [];
      list.push(mapped);
      itemsByOrder.set(row.order_id, list);
    }

    const historyByOrder = new Map<
      string,
      ReturnType<typeof mapOnlineOrderStatusHistoryRow>[]
    >();
    for (const row of (historyRes.data ?? []) as SupabaseOnlineOrderStatusHistoryRow[]) {
      const mapped = mapOnlineOrderStatusHistoryRow(row);
      const list = historyByOrder.get(row.order_id) ?? [];
      list.push(mapped);
      historyByOrder.set(row.order_id, list);
    }

    if (active) {
      callbacks.onOnlineOrders(
        typedOrders.map((row) =>
          mapOnlineOrderRow(
            row,
            itemsByOrder.get(row.id) ?? [],
            historyByOrder.get(row.id) ?? [],
          ),
        ),
      );
    }
  };

  const fetchDeliveryCustomersData = async () => {
    if (
      !callbacks.onDeliveryCustomers &&
      !callbacks.onDeliveryCustomerAddresses &&
      !callbacks.onCustomerClassificationConfig
    ) {
      return;
    }
    if (!canAccessDelivery) {
      if (active) {
        callbacks.onDeliveryCustomers?.([]);
        callbacks.onDeliveryCustomerAddresses?.([]);
        callbacks.onCustomerClassificationConfig?.({
          ...DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
        });
      }
      return;
    }

    const [customersRes, addressesRes, configRes] = await Promise.all([
      supabase
        .from('delivery_customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true }),
      supabase
        .from('delivery_customer_addresses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('delivery_customer_classification_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    if (customersRes.error) {
      if (customersRes.error.message.toLowerCase().includes('does not exist')) {
        if (active) {
          callbacks.onDeliveryCustomers?.([]);
          callbacks.onDeliveryCustomerAddresses?.([]);
          callbacks.onCustomerClassificationConfig?.({
            ...DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
          });
        }
        return;
      }
      throw new Error(customersRes.error.message);
    }

    if (!active) return;

    const mappedCustomers = (
      (customersRes.data ?? []) as SupabaseDeliveryCustomerRow[]
    ).map(mapDeliveryCustomerRow);
    const mappedAddresses = addressesRes.error
      ? []
      : (
          (addressesRes.data ?? []) as SupabaseDeliveryCustomerAddressRow[]
        ).map(mapDeliveryCustomerAddressRow);
    const mappedConfig = configRes.error
      ? { ...DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG }
      : mapDeliveryCustomerClassificationSettingsRow(
          configRes.data as SupabaseDeliveryCustomerClassificationSettingsRow | null,
        );

    callbacks.onDeliveryCustomers?.(mappedCustomers);
    callbacks.onDeliveryCustomerAddresses?.(mappedAddresses);
    callbacks.onCustomerClassificationConfig?.(mappedConfig);
  };

  const fetchDeliveryCouriersData = async () => {
    if (!callbacks.onDeliveryCouriers) return;
    if (!canAccessDelivery) {
      if (active) callbacks.onDeliveryCouriers([]);
      return;
    }

    const { data, error } = await supabase
      .from('delivery_couriers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      if (error.message.toLowerCase().includes('does not exist')) {
        if (active) callbacks.onDeliveryCouriers([]);
        return;
      }
      throw new Error(error.message);
    }

    if (!active) return;
    callbacks.onDeliveryCouriers(
      ((data ?? []) as SupabaseDeliveryCourierRow[]).map(mapDeliveryCourierRow),
    );
  };

  const fetchDeliveryDispatchesData = async () => {
    if (
      !callbacks.onDeliveryDispatches &&
      !callbacks.onDeliveryDispatchHistory
    ) {
      return;
    }
    if (!canAccessDelivery) {
      if (active) {
        callbacks.onDeliveryDispatches?.([]);
        callbacks.onDeliveryDispatchHistory?.([]);
      }
      return;
    }

    const [dispatchesRes, historyRes] = await Promise.all([
      supabase
        .from('delivery_dispatches')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('delivery_dispatch_history')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    if (dispatchesRes.error) {
      if (dispatchesRes.error.message.toLowerCase().includes('does not exist')) {
        if (active) {
          callbacks.onDeliveryDispatches?.([]);
          callbacks.onDeliveryDispatchHistory?.([]);
        }
        return;
      }
      throw new Error(dispatchesRes.error.message);
    }

    if (!active) return;

    callbacks.onDeliveryDispatches?.(
      ((dispatchesRes.data ?? []) as SupabaseDeliveryDispatchRow[]).map(
        mapDeliveryDispatchRow,
      ),
    );
    callbacks.onDeliveryDispatchHistory?.(
      historyRes.error
        ? []
        : (
            (historyRes.data ?? []) as SupabaseDeliveryDispatchHistoryRow[]
          ).map(mapDeliveryDispatchHistoryRow),
    );
  };

  const fetchDeliveryRegionsData = async () => {
    if (
      !callbacks.onDeliveryRegions &&
      !callbacks.onDeliveryPricingSettings
    ) {
      return;
    }
    if (!canAccessDelivery) {
      if (active) {
        callbacks.onDeliveryRegions?.([]);
        callbacks.onDeliveryPricingSettings?.({
          tenantId,
          ...DEFAULT_DELIVERY_PRICING_SETTINGS,
        });
      }
      return;
    }

    const [regionsRes, pricingRes] = await Promise.all([
      supabase
        .from('delivery_regions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('city', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('delivery_pricing_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    if (regionsRes.error) {
      if (regionsRes.error.message.toLowerCase().includes('does not exist')) {
        if (active) {
          callbacks.onDeliveryRegions?.([]);
          callbacks.onDeliveryPricingSettings?.({
            tenantId,
            ...DEFAULT_DELIVERY_PRICING_SETTINGS,
          });
        }
        return;
      }
      throw new Error(regionsRes.error.message);
    }

    if (!active) return;

    callbacks.onDeliveryRegions?.(
      ((regionsRes.data ?? []) as SupabaseDeliveryRegionRow[]).map(
        mapDeliveryRegionRow,
      ),
    );
    callbacks.onDeliveryPricingSettings?.(
      pricingRes.error
        ? { tenantId, ...DEFAULT_DELIVERY_PRICING_SETTINGS }
        : mapDeliveryPricingSettingsRow(
            pricingRes.data as SupabaseDeliveryPricingSettingsRow | null,
            tenantId,
          ),
    );
  };

  const fetchInventoryData = async () => {
    if (!callbacks.onInventory) return;
    if (!canAccessInventory) {
      if (active) callbacks.onInventory({ ...EMPTY_INVENTORY_BUNDLE });
      return;
    }

    const [
      balancesRes,
      pkgRes,
      movementsRes,
      suppliersRes,
      productSuppliersRes,
      poRes,
      poItemsRes,
      receiptsRes,
      receiptItemsRes,
      countsRes,
      countItemsRes,
    ] = await Promise.all([
      supabase.from('inventory_balances').select('*').eq('tenant_id', tenantId),
      supabase
        .from('inventory_packaging_conversions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('package_label', { ascending: true }),
      supabase
        .from('inventory_movements')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true }),
      supabase.from('product_suppliers').select('*').eq('tenant_id', tenantId),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('order_number', { ascending: false }),
      supabase
        .from('purchase_order_items')
        .select('*')
        .eq('tenant_id', tenantId),
      supabase
        .from('purchase_receipts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: false }),
      supabase
        .from('purchase_receipt_items')
        .select('*')
        .eq('tenant_id', tenantId),
      supabase
        .from('inventory_counts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('count_number', { ascending: false }),
      supabase
        .from('inventory_count_items')
        .select('*')
        .eq('tenant_id', tenantId),
    ]);

    if (balancesRes.error) {
      if (balancesRes.error.message.toLowerCase().includes('does not exist')) {
        if (active) callbacks.onInventory({ ...EMPTY_INVENTORY_BUNDLE });
        return;
      }
      throw new Error(balancesRes.error.message);
    }

    if (!active) return;

    callbacks.onInventory({
      balances: (
        (balancesRes.data ?? []) as SupabaseInventoryBalanceRow[]
      ).map(mapInventoryBalanceRow),
      packagingConversions: pkgRes.error
        ? []
        : (
            (pkgRes.data ?? []) as SupabaseInventoryPackagingConversionRow[]
          ).map(mapInventoryPackagingConversionRow),
      movements: movementsRes.error
        ? []
        : ((movementsRes.data ?? []) as SupabaseInventoryMovementRow[]).map(
            mapInventoryMovementRow,
          ),
      suppliers: suppliersRes.error
        ? []
        : ((suppliersRes.data ?? []) as SupabaseSupplierRow[]).map(
            mapSupplierRow,
          ),
      productSuppliers: productSuppliersRes.error
        ? []
        : (
            (productSuppliersRes.data ?? []) as SupabaseProductSupplierRow[]
          ).map(mapProductSupplierRow),
      purchaseOrders: poRes.error
        ? []
        : ((poRes.data ?? []) as SupabasePurchaseOrderRow[]).map(
            mapPurchaseOrderRow,
          ),
      purchaseOrderItems: poItemsRes.error
        ? []
        : ((poItemsRes.data ?? []) as SupabasePurchaseOrderItemRow[]).map(
            mapPurchaseOrderItemRow,
          ),
      purchaseReceipts: receiptsRes.error
        ? []
        : ((receiptsRes.data ?? []) as SupabasePurchaseReceiptRow[]).map(
            mapPurchaseReceiptRow,
          ),
      purchaseReceiptItems: receiptItemsRes.error
        ? []
        : ((receiptItemsRes.data ?? []) as SupabasePurchaseReceiptItemRow[]).map(
            mapPurchaseReceiptItemRow,
          ),
      inventoryCounts: countsRes.error
        ? []
        : ((countsRes.data ?? []) as SupabaseInventoryCountRow[]).map(
            mapInventoryCountRow,
          ),
      inventoryCountItems: countItemsRes.error
        ? []
        : ((countItemsRes.data ?? []) as SupabaseInventoryCountItemRow[]).map(
            mapInventoryCountItemRow,
          ),
    });
  };

  const fetchAll = async () => {
    try {
      await Promise.all([
        fetchSettings(),
        fetchDigitalMenuSettings(),
        fetchProducts(),
        fetchCombos(),
        fetchSales(),
        fetchExpenses(),
        fetchOnlineOrders(),
        fetchDeliveryCustomersData(),
        fetchDeliveryCouriersData(),
        fetchDeliveryDispatchesData(),
        fetchDeliveryRegionsData(),
        fetchInventoryData(),
      ]);
      if (active) callbacks.onReady();
    } catch (err) {
      if (active) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        callbacks.onReady();
      }
    }
  };

  const setForTenant =
    supabaseRefreshListeners.get(tenantId) ?? new Set<() => Promise<void>>();
  setForTenant.add(fetchAll);
  supabaseRefreshListeners.set(tenantId, setForTenant);

  void fetchAll();

  let channel = supabase
    .channel(`tenant-sync-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shop_settings', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchSettings().catch((e) => active && callbacks.onError(e as Error)),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'digital_menu_settings', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchDigitalMenuSettings().catch((e) => active && callbacks.onError(e as Error)),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchProducts().catch((e) => active && callbacks.onError(e as Error)),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'combos', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchCombos().catch((e) => active && callbacks.onError(e as Error)),
    );

  if (canReadSales) {
    channel = channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales', filter: `tenant_id=eq.${tenantId}` },
        () => void fetchSales().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'online_orders', filter: `tenant_id=eq.${tenantId}` },
        () => {
          void fetchOnlineOrders().catch((e) => active && callbacks.onError(e as Error));
          if (canAccessDelivery) {
            void fetchDeliveryCustomersData().catch(
              (e) => active && callbacks.onError(e as Error),
            );
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'online_order_items', filter: `tenant_id=eq.${tenantId}` },
        () => void fetchOnlineOrders().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'online_order_status_history', filter: `tenant_id=eq.${tenantId}` },
        () => void fetchOnlineOrders().catch((e) => active && callbacks.onError(e as Error)),
      );
  }

  if (canAccessDelivery) {
    channel = channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_customers', filter: `tenant_id=eq.${tenantId}` },
        () => void fetchDeliveryCustomersData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_customer_addresses', filter: `tenant_id=eq.${tenantId}` },
        () => void fetchDeliveryCustomersData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_customer_classification_settings',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => void fetchDeliveryCustomersData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_couriers',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => void fetchDeliveryCouriersData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_dispatches',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => void fetchDeliveryDispatchesData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_dispatch_history',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => void fetchDeliveryDispatchesData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_regions',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => void fetchDeliveryRegionsData().catch((e) => active && callbacks.onError(e as Error)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_pricing_settings',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => void fetchDeliveryRegionsData().catch((e) => active && callbacks.onError(e as Error)),
      );
  }

  if (canReadExpenses) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchExpenses().catch((e) => active && callbacks.onError(e as Error)),
    );
  }

  if (canAccessInventory) {
    const refreshInv = () =>
      void fetchInventoryData().catch((e) => active && callbacks.onError(e as Error));
    for (const invTable of [
      'inventory_balances',
      'inventory_packaging_conversions',
      'inventory_movements',
      'suppliers',
      'product_suppliers',
      'purchase_orders',
      'purchase_order_items',
      'purchase_receipts',
      'purchase_receipt_items',
      'inventory_counts',
      'inventory_count_items',
    ]) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: invTable, filter: `tenant_id=eq.${tenantId}` },
        refreshInv,
      );
    }
  }

  channel.subscribe();

  return () => {
    active = false;
    const listeners = supabaseRefreshListeners.get(tenantId);
    if (listeners) {
      listeners.delete(fetchAll);
      if (listeners.size === 0) supabaseRefreshListeners.delete(tenantId);
    }
    void supabase.removeChannel(channel);
  };
}

// ==================== METODOS DE ESCRITA (CONTRATO UNIFICADO) ====================

export async function saveSettings(
  ctx: DataExecutionContext,
  input: Omit<ShopSettings, 'ownerId'>,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.saveSettings(input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildSettingsPayloadForSupabase(input);
  const { error } = await supabase.from('shop_settings').upsert(
    {
      tenant_id: ctx.tenant.tenantId,
      owner_email: ctx.user.email,
      ...payload,
    },
    { onConflict: 'tenant_id' },
  );
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function saveDigitalMenuSettings(
  ctx: DataExecutionContext,
  input: DigitalMenuSettingsInput,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.saveDigitalMenuSettings(input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildDigitalMenuSettingsPayloadForSupabase(input);
  const { error } = await supabase.from('digital_menu_settings').upsert(
    {
      tenant_id: ctx.tenant.tenantId,
      ...payload,
    },
    { onConflict: 'tenant_id' },
  );
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

function mapProductMutationErrorMessage(error: {
  code?: string;
  message: string;
}): string {
  const msg = error.message || '';
  if (
    error.code === '23505' &&
    (msg.includes('uq_products_tenant_barcode') || msg.toLowerCase().includes('barcode'))
  ) {
    return 'Este código de barras já está cadastrado em outro produto deste estabelecimento.';
  }
  return msg;
}

export async function addProduct(
  ctx: DataExecutionContext,
  input: ProductInput,
): Promise<string> {
  if (isDemoSandboxActive()) {
    return demoMutations.addProduct(input);
  }
  
  const supabase = getSupabaseClient();
  const payload = buildProductPayloadForSupabase(input);
  const { data, error } = await supabase
    .from('products')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      owner_email: ctx.user.email,
      ...payload,
    })
    .select('id')
    .single();
  if (error) throw new Error(mapProductMutationErrorMessage(error));
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function updateProduct(
  ctx: DataExecutionContext,
  productId: string,
  input: ProductInput,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.updateProduct(productId, input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildProductPayloadForSupabase(input);
  const { error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', productId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(mapProductMutationErrorMessage(error));
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function addCombo(
  ctx: DataExecutionContext,
  input: ComboInput,
): Promise<string> {
  if (isDemoSandboxActive()) {
    return demoMutations.addCombo(input);
  }
  
  const supabase = getSupabaseClient();
  const payload = buildComboPayloadForSupabase(input);
  const { data, error } = await supabase
    .from('combos')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      owner_email: ctx.user.email,
      ...payload,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function updateCombo(
  ctx: DataExecutionContext,
  comboId: string,
  input: ComboInput,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.updateCombo(comboId, input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildComboPayloadForSupabase(input);
  const { error } = await supabase
    .from('combos')
    .update(payload)
    .eq('id', comboId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function seedDefaultCatalog(
  ctx: DataExecutionContext,
  xSaladaPrice: number,
): Promise<void> {
  
  const basePrice = xSaladaPrice > 0 ? roundCurrency(xSaladaPrice) : 22;

  const pXSaladaId = await addProduct(ctx, {
    name: 'X-Salada',
    category: 'Lanche',
    unitPrice: basePrice,
    countsAsXSalada: true,
    active: true,
  });
  const pRefri250Id = await addProduct(ctx, {
    name: 'Refrigerante Tuchaua 250 ml',
    category: 'Bebida',
    unitPrice: 5,
    countsAsXSalada: false,
    active: true,
  });
  const pRefri1LId = await addProduct(ctx, {
    name: 'Refrigerante Tuchaua 1 litro',
    category: 'Bebida',
    unitPrice: 10,
    countsAsXSalada: false,
    active: true,
  });
  const pRefri15LId = await addProduct(ctx, {
    name: 'Refrigerante Tuchaua 1,5 litro',
    category: 'Bebida',
    unitPrice: 13,
    countsAsXSalada: false,
    active: true,
  });

  const examples: ComboInput[] = [
    {
      name: 'COMBO 1',
      description: '1 X-Salada + 1 Refrigerante Tuchaua 250 ml',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 1, countsAsXSalada: true },
        { productId: pRefri250Id, productName: 'Refrigerante Tuchaua 250 ml', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice + 4),
      estimatedCost: 0,
      active: true,
    },
    {
      name: 'COMBO 2',
      description: '2 X-Saladas + 1 Refrigerante Tuchaua 1 litro',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 2, countsAsXSalada: true },
        { productId: pRefri1LId, productName: 'Refrigerante Tuchaua 1 litro', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice * 2 + 7),
      estimatedCost: 0,
      active: true,
    },
    {
      name: 'COMBO 3',
      description: '3 X-Saladas + 1 Refrigerante Tuchaua 1 litro',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 3, countsAsXSalada: true },
        { productId: pRefri1LId, productName: 'Refrigerante Tuchaua 1 litro', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice * 3 + 7),
      estimatedCost: 0,
      active: true,
    },
    {
      name: 'COMBO 4',
      description: '4 X-Saladas + 1 Refrigerante Tuchaua 1,5 litro',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 4, countsAsXSalada: true },
        { productId: pRefri15LId, productName: 'Refrigerante Tuchaua 1,5 litro', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice * 4 + 9),
      estimatedCost: 0,
      active: true,
    },
  ];

  for (const combo of examples) {
    await addCombo(ctx, combo);
  }
}

export async function addSale(
  ctx: DataExecutionContext,
  input: SaleInput,
): Promise<SaleRecord> {
  if (isDemoSandboxActive()) {
    return demoMutations.addSale(input);
  }

  const supabase = getSupabaseClient();
  const payload = buildSalePayloadForSupabase(input);
  const saleId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('sales').insert({
    id: saleId,
    tenant_id: ctx.tenant.tenantId,
    owner_email: ctx.user.email,
    ...payload,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);

  return mapSaleRow({
    id: saleId,
    tenant_id: ctx.tenant.tenantId,
    owner_email: ctx.user.email,
    ...payload,
    created_at: nowIso,
    updated_at: nowIso,
  });
}

export async function updateSale(
  ctx: DataExecutionContext,
  saleId: string,
  input: SaleInput,
): Promise<SaleRecord> {
  if (isDemoSandboxActive()) {
    return demoMutations.updateSale(saleId, input);
  }

  const supabase = getSupabaseClient();
  const payload = buildSalePayloadForSupabase(input);
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('sales')
    .update(payload)
    .eq('id', saleId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);

  return mapSaleRow({
    id: saleId,
    tenant_id: ctx.tenant.tenantId,
    owner_email: ctx.user.email,
    ...payload,
    created_at: nowIso,
    updated_at: nowIso,
  });
}

export async function deleteSale(
  ctx: DataExecutionContext,
  saleId: string,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.deleteSale(saleId);
    return;
  }
  
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('sales')
    .delete()
    .eq('id', saleId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function addExpense(
  ctx: DataExecutionContext,
  input: ExpenseInput,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.addExpense(input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildExpensePayloadForSupabase(input);
  const { error } = await supabase.from('expenses').insert({
    tenant_id: ctx.tenant.tenantId,
    owner_email: ctx.user.email,
    ...payload,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function updateExpense(
  ctx: DataExecutionContext,
  expenseId: string,
  input: ExpenseInput,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.updateExpense(expenseId, input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildExpensePayloadForSupabase(input);
  const { error } = await supabase
    .from('expenses')
    .update(payload)
    .eq('id', expenseId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function deleteExpense(
  ctx: DataExecutionContext,
  expenseId: string,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.deleteExpense(expenseId);
    return;
  }
  
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

// ==================== PEDIDOS ONLINE (ADMIN & PUBLICO) ====================

export async function markOnlineOrderViewed(
  ctx: DataExecutionContext,
  order: OnlineOrderRecord,
): Promise<void> {
  if (order.viewedAtMs) return;
  if (isDemoSandboxActive()) {
    demoMutations.markOrderViewed(order.id);
    return;
  }
  
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('mark_online_order_viewed', {
    p_order_id: order.id,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function transitionOnlineOrderStatus(
  ctx: DataExecutionContext,
  order: OnlineOrderRecord,
  nextStatus: OnlineOrderStatus,
  reason = '',
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.transitionOrderStatus(order.id, nextStatus, reason);
    return;
  }
  
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('transition_online_order_status', {
    p_order_id: order.id,
    p_next_status: nextStatus,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function fetchPublicDigitalMenu(
  slug?: string,
): Promise<PublicDigitalMenuPayload> {
  if (isDemoSandboxActive()) {
    return demoMutations.fetchPublicMenu(slug);
  }
  
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_public_digital_menu', {
    p_slug: slug ?? null,
  });
  if (error) throw new Error(error.message);
  return mapPublicDigitalMenuRpcResponse(data);
}

export async function createPublicOnlineOrder(
  payload: CreatePublicOrderPayload,
): Promise<CreatePublicOrderResponse> {
  if (isDemoSandboxActive()) {
    return demoMutations.createPublicOrder(payload);
  }
  
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('create_public_online_order', {
    p_slug: payload.slug ?? null,
    p_customer_name: payload.customerName,
    p_customer_phone: payload.customerPhone,
    p_fulfillment_type: payload.fulfillmentType,
    p_delivery_address: payload.deliveryAddress,
    p_delivery_reference: payload.deliveryReference,
    p_payment_method: payload.paymentMethod,
    p_change_for: payload.changeFor,
    p_customer_note: payload.customerNote,
    p_items: payload.items,
    p_delivery_neighborhood: payload.deliveryNeighborhood ?? '',
    p_delivery_city: payload.deliveryCity ?? '',
    p_delivery_region_id: payload.deliveryRegionId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as CreatePublicOrderResponse;
}

export async function fetchPublicOrderByToken(
  token: string,
): Promise<PublicOrderTrackingRecord | null> {
  if (isDemoSandboxActive()) {
    return demoMutations.getPublicOrderByToken(token);
  }
  
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_public_order_by_token', {
    p_tracking_token: token,
  });
  if (error) throw new Error(error.message);
  return mapPublicOrderTrackingRpcResponse(data);
}

export interface PublicOrderPollingOptions {
  tokenHash?: string;
  intervalMs?: number;
  fetchOrder?: (token: string) => Promise<PublicOrderTrackingRecord | null>;
  isVisible?: () => boolean;
  addVisibilityListener?: (listener: () => void) => () => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearTimer?: (id: ReturnType<typeof setInterval>) => void;
}

export function createPublicOrderPollingController(params: {
  token: string;
  onUpdate: (order: PublicOrderTrackingRecord | null) => void;
  onError: (err: Error) => void;
  intervalMs?: number;
  fetchOrder: (token: string) => Promise<PublicOrderTrackingRecord | null>;
  isVisible?: () => boolean;
  addVisibilityListener?: (listener: () => void) => () => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearTimer?: (id: ReturnType<typeof setInterval>) => void;
}): () => void {
  const intervalMs = Math.max(2000, params.intervalMs ?? 10000);
  const checkVisible =
    params.isVisible ??
    (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const setTimerFn =
    params.setTimer ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearTimerFn =
    params.clearTimer ?? ((id) => globalThis.clearInterval(id));
  const addVisFn =
    params.addVisibilityListener ??
    ((listener) => {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    });

  let active = true;
  let stoppedForever = false;
  let inFlight = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let removeVisibilityListener: () => void = () => {};

  const stopTimer = () => {
    if (timerId !== null) {
      clearTimerFn(timerId);
      timerId = null;
    }
  };

  const cleanup = () => {
    active = false;
    stoppedForever = true;
    stopTimer();
    removeVisibilityListener();
    removeVisibilityListener = () => {};
  };

  const refreshOrder = async () => {
    if (!active || stoppedForever || inFlight || !checkVisible()) return;
    inFlight = true;
    try {
      const updated = await params.fetchOrder(params.token);
      if (!active || stoppedForever) return;
      params.onUpdate(updated);
      if (!updated || isTerminalOrderStatus(updated.status)) {
        cleanup();
      }
    } catch (e) {
      if (active && !stoppedForever) {
        params.onError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      inFlight = false;
    }
  };

  const startTimer = () => {
    if (!active || stoppedForever || timerId !== null || !checkVisible()) return;
    timerId = setTimerFn(() => {
      void refreshOrder();
    }, intervalMs);
  };

  const handleVisibilityChange = () => {
    if (!active || stoppedForever) return;
    if (checkVisible()) {
      startTimer();
      void refreshOrder();
    } else {
      stopTimer();
    }
  };

  removeVisibilityListener = addVisFn(handleVisibilityChange);
  startTimer();

  return cleanup;
}

export function subscribePublicOrderTracking(
  token: string,
  onUpdate: (order: PublicOrderTrackingRecord | null) => void,
  onError: (err: Error) => void,
  options?: PublicOrderPollingOptions,
): () => void {
  if (isDemoSandboxActive()) {
    return demoMutations.subscribeTrackingByToken(token, onUpdate);
  }
  
  return createPublicOrderPollingController({
    token,
    onUpdate,
    onError,
    intervalMs: options?.intervalMs,
    fetchOrder: options?.fetchOrder ?? fetchPublicOrderByToken,
    isVisible: options?.isVisible,
    addVisibilityListener: options?.addVisibilityListener,
    setTimer: options?.setTimer,
    clearTimer: options?.clearTimer,
  });
}

// ==================== MGW DELIVERY — GESTÃO DE CLIENTES ====================

function assertDeliveryCustomerPermission(ctx: DataExecutionContext): void {
  if (
    !hasTenantPermission(ctx.tenant.role, 'delivery:view') ||
    !hasTenantPermission(ctx.tenant.role, 'sales:read')
  ) {
    throw new Error('Permissão insuficiente para gerenciar clientes do delivery.');
  }
}

function mapDeliveryCustomerMutationError(message: string): Error {
  const lower = message.toLowerCase();
  if (
    lower.includes('uniq_delivery_customers_tenant_phone') ||
    lower.includes('duplicate key')
  ) {
    return new Error('Já existe um cliente cadastrado com este telefone neste estabelecimento.');
  }
  return new Error(message);
}

export async function createDeliveryCustomer(
  ctx: DataExecutionContext,
  input: DeliveryCustomerInput,
  initialAddress?: DeliveryCustomerAddressInput | null,
): Promise<string> {
  assertDeliveryCustomerPermission(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.createDeliveryCustomer(input, initialAddress);
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryCustomerPayloadForSupabase(input);
  const { data, error } = await supabase
    .from('delivery_customers')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      ...payload,
    })
    .select('id')
    .single();

  if (error) throw mapDeliveryCustomerMutationError(error.message);
  const customerId = String((data as { id: string }).id);

  if (initialAddress && hasNonEmptyAddressFields(initialAddress)) {
    const addrPayload = buildDeliveryCustomerAddressPayloadForSupabase({
      ...initialAddress,
      label: initialAddress.label || 'Principal',
      isPrimary: true,
    });
    const { error: addrError } = await supabase
      .from('delivery_customer_addresses')
      .insert({
        tenant_id: ctx.tenant.tenantId,
        customer_id: customerId,
        ...addrPayload,
      });
    if (addrError) {
      notifyTenantRefresh(ctx.tenant.tenantId);
      throw new Error(
        `Cliente salvo, mas não foi possível registrar o endereço inicial: ${addrError.message}`,
      );
    }
  }

  notifyTenantRefresh(ctx.tenant.tenantId);
  return customerId;
}

export async function updateDeliveryCustomer(
  ctx: DataExecutionContext,
  customerId: string,
  input: DeliveryCustomerInput,
): Promise<void> {
  assertDeliveryCustomerPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.updateDeliveryCustomer(customerId, input);
    return;
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryCustomerPayloadForSupabase(input);
  const { error } = await supabase
    .from('delivery_customers')
    .update(payload)
    .eq('id', customerId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw mapDeliveryCustomerMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function saveDeliveryCustomerAddress(
  ctx: DataExecutionContext,
  customerId: string,
  input: DeliveryCustomerAddressInput,
  addressId?: string,
  hasExistingAddresses = true,
): Promise<void> {
  assertDeliveryCustomerPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.saveDeliveryCustomerAddress(customerId, input, addressId);
    return;
  }

  const supabase = getSupabaseClient();
  const wantPrimary = Boolean(input.isPrimary) || (!addressId && !hasExistingAddresses);
  const payload = buildDeliveryCustomerAddressPayloadForSupabase({
    ...input,
    isPrimary: addressId ? false : wantPrimary && !hasExistingAddresses,
  });

  if (addressId) {
    const { error } = await supabase
      .from('delivery_customer_addresses')
      .update({
        label: payload.label,
        cep: payload.cep,
        street: payload.street,
        number: payload.number,
        neighborhood: payload.neighborhood,
        complement: payload.complement,
        reference: payload.reference,
        city: payload.city,
        state: payload.state,
      })
      .eq('id', addressId)
      .eq('customer_id', customerId)
      .eq('tenant_id', ctx.tenant.tenantId);
    if (error) throw new Error(error.message);

    if (wantPrimary) {
      const { error: rpcError } = await supabase.rpc(
        'set_primary_delivery_customer_address',
        {
          p_tenant_id: ctx.tenant.tenantId,
          p_customer_id: customerId,
          p_address_id: addressId,
        },
      );
      if (rpcError) throw new Error(rpcError.message);
    }
  } else {
    const { data, error } = await supabase
      .from('delivery_customer_addresses')
      .insert({
        tenant_id: ctx.tenant.tenantId,
        customer_id: customerId,
        ...payload,
        is_primary: !hasExistingAddresses,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    if (wantPrimary && hasExistingAddresses && data) {
      const newId = String((data as { id: string }).id);
      const { error: rpcError } = await supabase.rpc(
        'set_primary_delivery_customer_address',
        {
          p_tenant_id: ctx.tenant.tenantId,
          p_customer_id: customerId,
          p_address_id: newId,
        },
      );
      if (rpcError) throw new Error(rpcError.message);
    }
  }

  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function deleteDeliveryCustomerAddress(
  ctx: DataExecutionContext,
  customerId: string,
  addressId: string,
  remainingAddresses: DeliveryCustomerAddressRecord[] = [],
): Promise<void> {
  assertDeliveryCustomerPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.deleteDeliveryCustomerAddress(customerId, addressId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('delivery_customer_addresses')
    .delete()
    .eq('id', addressId)
    .eq('customer_id', customerId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw new Error(error.message);

  const others = remainingAddresses.filter((a) => a.id !== addressId);
  if (others.length > 0 && !others.some((a) => a.isPrimary)) {
    const { error: rpcError } = await supabase.rpc(
      'set_primary_delivery_customer_address',
      {
        p_tenant_id: ctx.tenant.tenantId,
        p_customer_id: customerId,
        p_address_id: others[0].id,
      },
    );
    if (rpcError) throw new Error(rpcError.message);
  }

  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function setPrimaryDeliveryCustomerAddress(
  ctx: DataExecutionContext,
  customerId: string,
  addressId: string,
): Promise<void> {
  assertDeliveryCustomerPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.setPrimaryDeliveryCustomerAddress(customerId, addressId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('set_primary_delivery_customer_address', {
    p_tenant_id: ctx.tenant.tenantId,
    p_customer_id: customerId,
    p_address_id: addressId,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function saveCustomerClassificationConfig(
  ctx: DataExecutionContext,
  config: DeliveryCustomerClassificationConfig,
): Promise<void> {
  assertDeliveryCustomerPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.saveCustomerClassificationConfig(config);
    return;
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryCustomerClassificationPayloadForSupabase(config);
  const { error } = await supabase
    .from('delivery_customer_classification_settings')
    .upsert(
      {
        tenant_id: ctx.tenant.tenantId,
        ...payload,
      },
      { onConflict: 'tenant_id' },
    );
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

// ==================== MGW DELIVERY — GESTÃO DE ENTREGADORES ====================

function assertDeliveryCourierPermission(ctx: DataExecutionContext): void {
  if (
    !hasTenantPermission(ctx.tenant.role, 'delivery:view') ||
    !hasTenantPermission(ctx.tenant.role, 'sales:read')
  ) {
    throw new Error('Permissão insuficiente para gerenciar entregadores do delivery.');
  }
}

function mapDeliveryCourierMutationError(message: string): Error {
  const lower = message.toLowerCase();
  if (
    lower.includes('uniq_delivery_couriers_tenant_phone') ||
    lower.includes('duplicate key')
  ) {
    return new Error(
      'Já existe um entregador cadastrado com este telefone neste estabelecimento.',
    );
  }
  if (
    lower.includes('foreign key') ||
    lower.includes('violates foreign key constraint') ||
    lower.includes('23503')
  ) {
    return new Error(
      'Este entregador possui registros vinculados e não pode ser excluído definitivamente. Desative-o para preservar o histórico.',
    );
  }
  return new Error(message);
}

export async function createDeliveryCourier(
  ctx: DataExecutionContext,
  input: DeliveryCourierInput,
): Promise<string> {
  assertDeliveryCourierPermission(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.createDeliveryCourier(input);
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryCourierPayloadForSupabase(input);
  const { data, error } = await supabase
    .from('delivery_couriers')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      ...payload,
    })
    .select('id')
    .single();

  if (error) throw mapDeliveryCourierMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function updateDeliveryCourier(
  ctx: DataExecutionContext,
  courierId: string,
  input: DeliveryCourierInput,
): Promise<void> {
  assertDeliveryCourierPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.updateDeliveryCourier(courierId, input);
    return;
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryCourierPayloadForSupabase(input);
  const { error } = await supabase
    .from('delivery_couriers')
    .update(payload)
    .eq('id', courierId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw mapDeliveryCourierMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function updateDeliveryCourierStatus(
  ctx: DataExecutionContext,
  courierId: string,
  status: DeliveryCourierStatus,
): Promise<void> {
  assertDeliveryCourierPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.setDeliveryCourierStatus(courierId, status);
    return;
  }

  const supabase = getSupabaseClient();
  const updatePayload: {
    status: DeliveryCourierStatus;
    availability_status?: DeliveryCourierAvailability;
  } = {
    status,
  };
  if (status === 'inactive') {
    updatePayload.availability_status = 'unavailable';
  }

  const { error } = await supabase
    .from('delivery_couriers')
    .update(updatePayload)
    .eq('id', courierId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw mapDeliveryCourierMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function updateDeliveryCourierAvailability(
  ctx: DataExecutionContext,
  courierId: string,
  availabilityStatus: DeliveryCourierAvailability,
): Promise<void> {
  assertDeliveryCourierPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.setDeliveryCourierAvailability(courierId, availabilityStatus);
    return;
  }

  const supabase = getSupabaseClient();
  const { data: currentRow, error: fetchError } = await supabase
    .from('delivery_couriers')
    .select('status')
    .eq('id', courierId)
    .eq('tenant_id', ctx.tenant.tenantId)
    .maybeSingle();

  if (fetchError) throw mapDeliveryCourierMutationError(fetchError.message);
  if (!currentRow) {
    throw new Error('Entregador não encontrado neste estabelecimento.');
  }
  if (
    (currentRow as { status: string }).status === 'inactive' &&
    availabilityStatus === 'available'
  ) {
    throw new Error('Ative o entregador antes de marcá-lo como disponível.');
  }

  const { error } = await supabase
    .from('delivery_couriers')
    .update({ availability_status: availabilityStatus })
    .eq('id', courierId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw mapDeliveryCourierMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function deleteDeliveryCourier(
  ctx: DataExecutionContext,
  courierId: string,
): Promise<void> {
  assertDeliveryCourierPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.deleteDeliveryCourier(courierId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('delivery_couriers')
    .delete()
    .eq('id', courierId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw mapDeliveryCourierMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

// ==================== MGW DELIVERY — CENTRAL DE DESPACHO ====================

function assertDeliveryDispatchPermission(ctx: DataExecutionContext): void {
  if (
    !hasTenantPermission(ctx.tenant.role, 'delivery:view') ||
    !hasTenantPermission(ctx.tenant.role, 'sales:read')
  ) {
    throw new Error('Permissão insuficiente para operar a Central de Despacho.');
  }
}

function mapDeliveryDispatchMutationError(message: string): Error {
  const lower = message.toLowerCase();
  if (
    lower.includes('uniq_delivery_dispatches_active_order') ||
    lower.includes('duplicate key')
  ) {
    return new Error('Este pedido já possui um entregador ativo atribuído.');
  }
  return new Error(message);
}

export async function assignDeliveryCourier(
  ctx: DataExecutionContext,
  orderId: string,
  courierId: string,
  notes = '',
): Promise<string> {
  assertDeliveryDispatchPermission(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.assignDeliveryCourier(
      orderId,
      courierId,
      notes,
      ctx.user.email,
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('assign_delivery_courier', {
    p_order_id: orderId,
    p_courier_id: courierId,
    p_notes: notes.trim().slice(0, 500),
  });

  if (error) throw mapDeliveryDispatchMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String(data || '');
}

export async function reassignDeliveryCourier(
  ctx: DataExecutionContext,
  dispatchId: string,
  newCourierId: string,
  reason = '',
): Promise<string> {
  assertDeliveryDispatchPermission(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.reassignDeliveryCourier(
      dispatchId,
      newCourierId,
      reason,
      ctx.user.email,
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('reassign_delivery_courier', {
    p_dispatch_id: dispatchId,
    p_new_courier_id: newCourierId,
    p_reason: reason.trim().slice(0, 300),
  });

  if (error) throw mapDeliveryDispatchMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String(data || '');
}

export async function cancelDeliveryDispatch(
  ctx: DataExecutionContext,
  dispatchId: string,
  reason: string,
): Promise<void> {
  assertDeliveryDispatchPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.cancelDeliveryDispatch(dispatchId, reason, ctx.user.email);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('cancel_delivery_dispatch', {
    p_dispatch_id: dispatchId,
    p_reason: reason.trim().slice(0, 300),
  });

  if (error) throw mapDeliveryDispatchMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function respondDeliveryDispatch(
  ctx: DataExecutionContext,
  dispatchId: string,
  decision: 'accept' | 'reject',
  reason = '',
): Promise<void> {
  assertDeliveryDispatchPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.respondDeliveryDispatch(
      dispatchId,
      decision,
      reason,
      ctx.user.email,
    );
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('respond_delivery_dispatch', {
    p_dispatch_id: dispatchId,
    p_decision: decision,
    p_reason: reason.trim().slice(0, 300),
  });

  if (error) throw mapDeliveryDispatchMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function advanceDeliveryDispatchStatus(
  ctx: DataExecutionContext,
  dispatchId: string,
  nextStatus: DeliveryDispatchStatus,
): Promise<void> {
  assertDeliveryDispatchPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.advanceDeliveryDispatchStatus(
      dispatchId,
      nextStatus,
      ctx.user.email,
    );
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('advance_delivery_dispatch_status', {
    p_dispatch_id: dispatchId,
    p_next_status: nextStatus,
  });

  if (error) throw mapDeliveryDispatchMutationError(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

// ==================== MGW DELIVERY — REGIÕES E TAXAS DE ENTREGA ====================

function assertDeliveryRegionsPermission(ctx: DataExecutionContext): void {
  if (
    !hasTenantPermission(ctx.tenant.role, 'delivery:view') ||
    !hasTenantPermission(ctx.tenant.role, 'sales:read')
  ) {
    throw new Error('Permissão insuficiente para gerenciar regiões e taxas de entrega.');
  }
}

export async function createDeliveryRegion(
  ctx: DataExecutionContext,
  input: DeliveryRegionInput,
): Promise<string> {
  assertDeliveryRegionsPermission(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.createDeliveryRegion(input);
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryRegionPayloadForSupabase(input);
  const { data, error } = await supabase
    .from('delivery_regions')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      ...payload,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function updateDeliveryRegion(
  ctx: DataExecutionContext,
  regionId: string,
  input: DeliveryRegionInput,
): Promise<void> {
  assertDeliveryRegionsPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.updateDeliveryRegion(regionId, input);
    return;
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryRegionPayloadForSupabase(input);
  const { error } = await supabase
    .from('delivery_regions')
    .update(payload)
    .eq('id', regionId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function toggleDeliveryRegionStatus(
  ctx: DataExecutionContext,
  regionId: string,
  status: DeliveryRegionStatus,
): Promise<void> {
  assertDeliveryRegionsPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.toggleDeliveryRegionStatus(regionId, status);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('delivery_regions')
    .update({ status })
    .eq('id', regionId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function toggleDeliveryRegionSuspension(
  ctx: DataExecutionContext,
  regionId: string,
  suspended: boolean,
  reason = '',
): Promise<void> {
  assertDeliveryRegionsPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.toggleDeliveryRegionSuspension(regionId, suspended, reason);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('delivery_regions')
    .update({
      is_temporarily_suspended: suspended,
      suspension_reason: suspended ? reason.trim().slice(0, 300) : '',
    })
    .eq('id', regionId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function deleteDeliveryRegion(
  ctx: DataExecutionContext,
  regionId: string,
): Promise<void> {
  assertDeliveryRegionsPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.deleteDeliveryRegion(regionId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('delivery_regions')
    .delete()
    .eq('id', regionId)
    .eq('tenant_id', ctx.tenant.tenantId);

  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function saveDeliveryPricingSettings(
  ctx: DataExecutionContext,
  input: DeliveryPricingSettingsInput,
): Promise<void> {
  assertDeliveryRegionsPermission(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.saveDeliveryPricingSettings(input);
    return;
  }

  const supabase = getSupabaseClient();
  const payload = buildDeliveryPricingSettingsPayloadForSupabase(input);
  const { error } = await supabase
    .from('delivery_pricing_settings')
    .upsert(
      {
        tenant_id: ctx.tenant.tenantId,
        ...payload,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

// ==================== ETAPA 4 — ESTOQUE PROFISSIONAL (SEGMENTO ADEGA) ====================

function assertAdegaInventoryRead(ctx: DataExecutionContext): void {
  if (normalizeBusinessSegment(ctx.tenant.businessSegment) !== 'adega') {
    throw new Error('O módulo de estoque profissional é exclusivo do segmento Adega.');
  }
  if (!hasTenantPermission(ctx.tenant.role, 'inventory:read')) {
    throw new Error('Permissão insuficiente para consultar o estoque.');
  }
}

function assertAdegaInventoryWrite(ctx: DataExecutionContext): void {
  assertAdegaInventoryRead(ctx);
  if (!hasTenantPermission(ctx.tenant.role, 'inventory:write')) {
    throw new Error('Permissão insuficiente para alterar ou movimentar o estoque.');
  }
}

export async function upsertInventoryProductConfig(
  ctx: DataExecutionContext,
  productId: string,
  minStockQty: number,
  allowNegativeStock: boolean,
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.upsertInventoryProductConfig(
      productId,
      minStockQty,
      allowNegativeStock,
    );
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('inventory_upsert_product_config', {
    p_tenant_id: ctx.tenant.tenantId,
    p_product_id: productId,
    p_min_stock_qty: Math.max(0, Number(minStockQty) || 0),
    p_allow_negative_stock: Boolean(allowNegativeStock),
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function saveInventoryPackagingConversion(
  ctx: DataExecutionContext,
  input: InventoryPackagingConversionInput,
  conversionId?: string,
): Promise<string> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.upsertInventoryPackagingConversion(input, conversionId);
  }

  const supabase = getSupabaseClient();
  const payload = buildInventoryPackagingConversionPayloadForSupabase(input);
  if (conversionId) {
    const { error } = await supabase
      .from('inventory_packaging_conversions')
      .update(payload)
      .eq('id', conversionId)
      .eq('tenant_id', ctx.tenant.tenantId);
    if (error) throw new Error(error.message);
    notifyTenantRefresh(ctx.tenant.tenantId);
    return conversionId;
  }

  const { data, error } = await supabase
    .from('inventory_packaging_conversions')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      ...payload,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function deleteInventoryPackagingConversion(
  ctx: DataExecutionContext,
  conversionId: string,
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.deleteInventoryPackagingConversion(conversionId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('inventory_packaging_conversions')
    .delete()
    .eq('id', conversionId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function recordInventoryMovement(
  ctx: DataExecutionContext,
  input: RecordInventoryMovementInput,
): Promise<{ movementId: string; newBalance: number }> {
  assertAdegaInventoryWrite(ctx);
  const idempotencyKey =
    input.idempotencyKey?.trim() || createInventoryIdempotencyKey('mov');

  if (isDemoSandboxActive()) {
    const mov = demoMutations.recordInventoryMovement(
      { ...input, idempotencyKey },
      ctx.user.email,
    );
    return { movementId: mov.id, newBalance: mov.newBalance };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('inventory_record_movement', {
    p_tenant_id: ctx.tenant.tenantId,
    p_product_id: input.productId,
    p_movement_type: input.movementType,
    p_input_quantity: input.inputQuantity,
    p_input_unit: input.inputUnit || 'unidade',
    p_conversion_factor: input.conversionFactor ?? 1,
    p_total_cost: input.totalCost ?? null,
    p_reason: input.reason ?? '',
    p_notes: input.notes ?? '',
    p_supplier_id: input.supplierId ?? null,
    p_packaging_conversion_id: input.packagingConversionId ?? null,
    p_idempotency_key: idempotencyKey,
    p_allow_negative_override: Boolean(input.allowNegativeOverride),
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  const res = (data ?? {}) as Record<string, unknown>;
  return {
    movementId: String(res.movementId || ''),
    newBalance: Number(res.newBalance ?? 0),
  };
}

export async function saveInventorySupplier(
  ctx: DataExecutionContext,
  input: SupplierInput,
  supplierId?: string,
): Promise<string> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.saveSupplier(input, supplierId);
  }

  const supabase = getSupabaseClient();
  const payload = buildSupplierPayloadForSupabase(input);
  if (supplierId) {
    const { error } = await supabase
      .from('suppliers')
      .update(payload)
      .eq('id', supplierId)
      .eq('tenant_id', ctx.tenant.tenantId);
    if (error) throw new Error(error.message);
    notifyTenantRefresh(ctx.tenant.tenantId);
    return supplierId;
  }

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      tenant_id: ctx.tenant.tenantId,
      ...payload,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function upsertProductSupplierLink(
  ctx: DataExecutionContext,
  input: ProductSupplierLinkInput,
): Promise<string> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    return demoMutations.upsertProductSupplierLink(input);
  }

  const supabase = getSupabaseClient();
  const payload = buildProductSupplierPayloadForSupabase(input);
  const { data, error } = await supabase
    .from('product_suppliers')
    .upsert(
      {
        tenant_id: ctx.tenant.tenantId,
        ...payload,
      },
      { onConflict: 'tenant_id,product_id,supplier_id' },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  return String((data as { id: string }).id);
}

export async function deleteProductSupplierLink(
  ctx: DataExecutionContext,
  linkId: string,
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.deleteProductSupplierLink(linkId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('product_suppliers')
    .delete()
    .eq('id', linkId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function createInventoryPurchaseOrder(
  ctx: DataExecutionContext,
  input: CreatePurchaseOrderInput,
): Promise<string> {
  assertAdegaInventoryWrite(ctx);
  const idempotencyKey =
    input.idempotencyKey?.trim() || createInventoryIdempotencyKey('po');

  if (isDemoSandboxActive()) {
    return demoMutations.createPurchaseOrder(
      { ...input, idempotencyKey },
      ctx.user.email,
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('inventory_create_purchase_order', {
    p_tenant_id: ctx.tenant.tenantId,
    p_supplier_id: input.supplierId,
    p_status: input.status === 'draft' ? 'draft' : 'pending',
    p_payment_terms: input.paymentTerms ?? '',
    p_expected_delivery_date: input.expectedDeliveryDate || null,
    p_discount_amount: Math.max(0, Number(input.discountAmount) || 0),
    p_additional_expenses: Math.max(0, Number(input.additionalExpenses) || 0),
    p_notes: input.notes ?? '',
    p_items: input.items.map((item) => ({
      productId: item.productId,
      packagingConversionId: item.packagingConversionId ?? null,
      unitLabel: item.unitLabel,
      conversionFactor: item.conversionFactor,
      orderedQty: item.orderedQty,
      unitCost: item.unitCost,
    })),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  const res = (data ?? {}) as Record<string, unknown>;
  return String(res.purchaseOrderId || '');
}

export async function updateInventoryPurchaseOrderStatus(
  ctx: DataExecutionContext,
  purchaseOrderId: string,
  nextStatus: 'pending' | 'cancelled',
  reason = '',
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.updatePurchaseOrderStatus(purchaseOrderId, nextStatus, reason);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('inventory_update_purchase_order_status', {
    p_tenant_id: ctx.tenant.tenantId,
    p_purchase_order_id: purchaseOrderId,
    p_next_status: nextStatus,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function receiveInventoryPurchaseItems(
  ctx: DataExecutionContext,
  purchaseOrderId: string,
  items: ReceivePurchaseItemInput[],
  notes = '',
  idempotencyKey?: string,
): Promise<string> {
  assertAdegaInventoryWrite(ctx);
  const key = idempotencyKey?.trim() || createInventoryIdempotencyKey('rec');

  if (isDemoSandboxActive()) {
    return demoMutations.receivePurchaseItems(
      purchaseOrderId,
      items,
      notes,
      key,
      ctx.user.email,
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('inventory_receive_purchase_items', {
    p_tenant_id: ctx.tenant.tenantId,
    p_purchase_order_id: purchaseOrderId,
    p_items: items,
    p_notes: notes,
    p_idempotency_key: key,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  const res = (data ?? {}) as Record<string, unknown>;
  return String(res.receiptId || '');
}

export async function startInventoryCount(
  ctx: DataExecutionContext,
  title: string,
  productIds: string[] | null,
  notes = '',
  idempotencyKey?: string,
): Promise<string> {
  assertAdegaInventoryWrite(ctx);
  const key = idempotencyKey?.trim() || createInventoryIdempotencyKey('cnt');

  if (isDemoSandboxActive()) {
    return demoMutations.startInventoryCount(
      title,
      productIds,
      notes,
      key,
      ctx.user.email,
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('inventory_start_count', {
    p_tenant_id: ctx.tenant.tenantId,
    p_title: title,
    p_product_ids: productIds,
    p_notes: notes,
    p_idempotency_key: key,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
  const res = (data ?? {}) as Record<string, unknown>;
  return String(res.countId || '');
}

export async function saveInventoryCountItems(
  ctx: DataExecutionContext,
  countId: string,
  items: Array<{ countItemId: string; countedQty: number | null; notes?: string }>,
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.saveInventoryCountItems(countId, items);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('inventory_save_count_items', {
    p_tenant_id: ctx.tenant.tenantId,
    p_count_id: countId,
    p_items: items,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function finalizeInventoryCount(
  ctx: DataExecutionContext,
  countId: string,
  idempotencyKey?: string,
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  const key = idempotencyKey?.trim() || createInventoryIdempotencyKey('fincnt');

  if (isDemoSandboxActive()) {
    demoMutations.finalizeInventoryCount(countId, ctx.user.email);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('inventory_finalize_count', {
    p_tenant_id: ctx.tenant.tenantId,
    p_count_id: countId,
    p_idempotency_key: key,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function cancelInventoryCount(
  ctx: DataExecutionContext,
  countId: string,
): Promise<void> {
  assertAdegaInventoryWrite(ctx);
  if (isDemoSandboxActive()) {
    demoMutations.cancelInventoryCount(countId);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('inventory_cancel_count', {
    p_tenant_id: ctx.tenant.tenantId,
    p_count_id: countId,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}
