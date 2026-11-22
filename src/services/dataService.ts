import {
  ADMIN_EMAILS,
  type AuthSessionUser,
  type ComboInput,
  type ComboRecord,
  type CreatePublicOrderPayload,
  type CreatePublicOrderResponse,
  DEFAULT_SHOP_SETTINGS,
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
} from '../types/finance';
import { roundCurrency } from '../utils/finance';
import {
  DEFAULT_DIGITAL_MENU_SETTINGS,
  isTerminalOrderStatus,
  sanitizeMenuSlug,
} from '../utils/onlineOrders';
import { demoMutations, isDemoSandboxActive, subscribeDemoAdminState } from './demoSandbox';
import { getSupabaseClient } from '../lib/supabase';
import { hasTenantPermission } from './rbacPolicy';
import {
  buildComboPayloadForSupabase,
  buildDigitalMenuSettingsPayloadForSupabase,
  buildExpensePayloadForSupabase,
  buildProductPayloadForSupabase,
  buildSalePayloadForSupabase,
  buildSettingsPayloadForSupabase,
  buildTenantContextFromRows,
  mapComboRow,
  mapDigitalMenuSettingsRow,
  mapExpenseRow,
  mapOnlineOrderItemRow,
  mapOnlineOrderRow,
  mapOnlineOrderStatusHistoryRow,
  mapProductRow,
  mapPublicDigitalMenuRpcResponse,
  mapPublicOrderTrackingRpcResponse,
  mapSaleRow,
  mapShopSettingsRow,
  mapSupabaseAuthErrorMessage,
  type SupabaseComboRow,
  type SupabaseDigitalMenuSettingsRow,
  type SupabaseExpenseRow,
  type SupabaseOnlineOrderItemRow,
  type SupabaseOnlineOrderRow,
  type SupabaseOnlineOrderStatusHistoryRow,
  type SupabaseProductRow,
  type SupabaseSaleRow,
  type SupabaseShopSettingsRow,
  type SupabaseSubscriptionRow,
  type SupabaseTenantMemberRow,
  type SupabaseTenantRow,
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
  onReady: () => void;
  onError: (err: Error) => void;
}

export interface AuthResolutionState {
  user: AuthSessionUser | null;
  tenants: TenantContext[];
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

  // Vincula automaticamente pre-cadastros pendentes (ex.: contas fundadoras) somente
  // quando auth.users.email_confirmed_at IS NOT NULL no PostgreSQL.
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
      'id, tenant_id, user_id, email, role, is_founder, active, tenants ( id, slug, name, is_founder_account, billing_exempt, status, onboarding_completed )',
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

export async function registerWithEmailPassword(
  name: string,
  storeName: string,
  email: string,
  password: string,
): Promise<void> {
  
  const cleanName = name.trim().slice(0, 80);
  const cleanStoreName = storeName.trim().slice(0, 80);
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanStoreName || !cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Preencha seu nome, o nome do estabelecimento e um e-mail válido.');
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
        shop_name: cleanStoreName,
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
}): Promise<{
  tenantId: string;
  slug: string;
  name: string;
  onboardingCompleted: boolean;
}> {
  
  const cleanStoreName = params.storeName.trim().slice(0, 80);
  const cleanOwnerName = (params.ownerName || '').trim().slice(0, 120);
  if (cleanStoreName.length < 2) {
    throw new Error('Informe o nome do estabelecimento (mínimo 2 caracteres).');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('complete_tenant_onboarding', {
    p_tenant_id: params.tenantId,
    p_store_name: cleanStoreName,
    p_owner_name: cleanOwnerName,
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
        () => void fetchOnlineOrders().catch((e) => active && callbacks.onError(e as Error)),
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

  if (canReadExpenses) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchExpenses().catch((e) => active && callbacks.onError(e as Error)),
    );
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.addSale(input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildSalePayloadForSupabase(input);
  const { error } = await supabase.from('sales').insert({
    tenant_id: ctx.tenant.tenantId,
    owner_email: ctx.user.email,
    ...payload,
  });
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
}

export async function updateSale(
  ctx: DataExecutionContext,
  saleId: string,
  input: SaleInput,
): Promise<void> {
  if (isDemoSandboxActive()) {
    demoMutations.updateSale(saleId, input);
    return;
  }
  
  const supabase = getSupabaseClient();
  const payload = buildSalePayloadForSupabase(input);
  const { error } = await supabase
    .from('sales')
    .update(payload)
    .eq('id', saleId)
    .eq('tenant_id', ctx.tenant.tenantId);
  if (error) throw new Error(error.message);
  notifyTenantRefresh(ctx.tenant.tenantId);
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
