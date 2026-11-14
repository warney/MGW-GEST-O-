import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth as firebaseAuth, googleProvider } from '../firebase';
import { getActiveDataProvider, getSupabaseClient } from '../lib/supabase';
import {
  ADMIN_EMAILS,
  type AuthSessionUser,
  type ComboInput,
  type ComboRecord,
  DEFAULT_SHOP_SETTINGS,
  type ExpenseInput,
  type ExpenseRecord,
  type ProductInput,
  type ProductRecord,
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
  createComboInFirestore,
  createExpenseInFirestore,
  createProductInFirestore,
  createSaleInFirestore,
  deleteExpenseInFirestore,
  deleteSaleInFirestore,
  saveSettingsToFirestore,
  seedDefaultCatalogInFirestore,
  subscribeCombos as subscribeCombosFirestore,
  subscribeExpenses as subscribeExpensesFirestore,
  subscribeProducts as subscribeProductsFirestore,
  subscribeSales as subscribeSalesFirestore,
  subscribeSettings as subscribeSettingsFirestore,
  updateComboInFirestore,
  updateExpenseInFirestore,
  updateProductInFirestore,
  updateSaleInFirestore,
} from './firestoreService';
import {
  buildComboPayloadForSupabase,
  buildExpensePayloadForSupabase,
  buildProductPayloadForSupabase,
  buildSalePayloadForSupabase,
  buildSettingsPayloadForSupabase,
  buildTenantContextFromRows,
  hasActiveTenantBillingAccess,
  mapComboRow,
  mapExpenseRow,
  mapProductRow,
  mapSaleRow,
  mapShopSettingsRow,
  mapSupabaseAuthErrorMessage,
  type SupabaseComboRow,
  type SupabaseExpenseRow,
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
  onProducts: (products: ProductRecord[]) => void;
  onCombos: (combos: ComboRecord[]) => void;
  onSales: (sales: SaleRecord[]) => void;
  onExpenses: (expenses: ExpenseRecord[]) => void;
  onReady: () => void;
  onError: (err: Error) => void;
}

export interface AuthResolutionState {
  user: AuthSessionUser | null;
  tenants: TenantContext[];
  errorMessage: string | null;
  legacyWorkspace?: WorkspaceAccess;
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
      'id, tenant_id, user_id, email, role, is_founder, active, tenants ( id, slug, name, is_founder_account, billing_exempt, status )',
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
      .select('tenant_id, status, grace_until')
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

  const authorizedTenants: TenantContext[] = [];
  let hasBlockedTenant = false;

  for (const member of typedMembers) {
    const tenantRaw = Array.isArray(member.tenants)
      ? member.tenants[0]
      : member.tenants;
    if (!tenantRaw) continue;
    const sub = subsByTenant.get(member.tenant_id);
    if (!hasActiveTenantBillingAccess(tenantRaw as SupabaseTenantRow, sub)) {
      hasBlockedTenant = true;
      continue;
    }
    const ctx = buildTenantContextFromRows(member, sub);
    if (ctx) {
      authorizedTenants.push(ctx);
    }
  }

  if (authorizedTenants.length === 0) {
    await supabase.auth.signOut();
    return {
      user: null,
      tenants: [],
      errorMessage: hasBlockedTenant
        ? 'O acesso deste estabelecimento está temporariamente suspenso ou aguardando ativação.'
        : 'Esta conta autenticada não possui vínculo ativo com nenhum estabelecimento autorizado.',
    };
  }

  return {
    user: { uid: userId, email, emailVerified },
    tenants: authorizedTenants,
    errorMessage: null,
  };
}

export function subscribeAuthSession(
  onChange: (state: AuthResolutionState) => void,
): () => void {
  const provider = getActiveDataProvider();

  if (provider === 'firebase') {
    return onAuthStateChanged(
      firebaseAuth,
      async (currentUser: FirebaseUser | null) => {
        if (!currentUser) {
          onChange({ user: null, tenants: [], errorMessage: null });
          return;
        }
        const resolved = resolveWorkspaceForEmail(currentUser.email);
        if (!resolved || !currentUser.emailVerified) {
          await signOut(firebaseAuth);
          onChange({
            user: null,
            tenants: [],
            errorMessage: `A conta ${currentUser.email || 'selecionada'} não tem permissão. Acesso autorizado para ${ADMIN_EMAILS.join(', ')} (MGW Lanches) ou ${SEPARATE_SHOP_EMAIL} (conta separada).`,
          });
          return;
        }
        onChange({
          user: {
            uid: currentUser.uid,
            email: currentUser.email || '',
            emailVerified: currentUser.emailVerified,
          },
          tenants: [
            {
              tenantId: resolved.id,
              slug: resolved.id,
              name: resolved.label,
              role: 'owner',
              isFounderAccount: true,
              billingExempt: true,
              subscriptionStatus: 'exempt',
              graceUntil: null,
            },
          ],
          legacyWorkspace: resolved,
          errorMessage: null,
        });
      },
    );
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
      if (event === 'SIGNED_OUT' || !session?.user) {
        onChange({
          user: null,
          tenants: [],
          errorMessage:
            event === 'TOKEN_REFRESHED'
              ? null
              : null,
        });
        return;
      }
      void handleSessionUser(session.user);
    },
  );

  return () => {
    active = false;
    subscription.subscription.unsubscribe();
  };
}

export async function loginWithGoogle(): Promise<void> {
  if (getActiveDataProvider() === 'firebase') {
    await signInWithPopup(firebaseAuth, googleProvider);
    return;
  }

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
  if (getActiveDataProvider() === 'firebase') {
    throw new Error('Login por e-mail e senha disponível após ativação do Supabase Auth.');
  }

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

export async function requestPasswordReset(email: string): Promise<void> {
  if (getActiveDataProvider() === 'firebase') {
    throw new Error('Recuperação de senha disponível após ativação do Supabase Auth.');
  }

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
  if (getActiveDataProvider() === 'firebase') {
    await signOut(firebaseAuth);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(mapSupabaseAuthErrorMessage(error));
  }
}

// ==================== LEITURA E ASSINATURA REATIVA ====================

export function subscribeAllTenantData(
  ctx: DataExecutionContext,
  callbacks: DataSubscriptionsCallbacks,
): () => void {
  if (getActiveDataProvider() === 'firebase') {
    const workspace =
      ctx.workspace ??
      resolveWorkspaceForEmail(ctx.user.email) ?? {
        id: 'mgw_lanches',
        label: ctx.tenant.name,
        defaultEstablishmentName: ctx.tenant.name,
        isSeparateAccount: false,
      };

    let settingsLoaded = false;
    let salesLoaded = false;
    let expensesLoaded = false;
    let productsLoaded = false;
    let combosLoaded = false;

    const checkReady = () => {
      if (
        settingsLoaded &&
        salesLoaded &&
        expensesLoaded &&
        productsLoaded &&
        combosLoaded
      ) {
        callbacks.onReady();
      }
    };

    const unsubSettings = subscribeSettingsFirestore(
      ctx.user.uid,
      (s) => {
        callbacks.onSettings(s);
        settingsLoaded = true;
        checkReady();
      },
      callbacks.onError,
      workspace,
    );

    const unsubSales = subscribeSalesFirestore(
      (list) => {
        callbacks.onSales(list);
        salesLoaded = true;
        checkReady();
      },
      callbacks.onError,
      workspace,
    );

    const unsubExpenses = subscribeExpensesFirestore(
      (list) => {
        callbacks.onExpenses(list);
        expensesLoaded = true;
        checkReady();
      },
      callbacks.onError,
      workspace,
    );

    const unsubProducts = subscribeProductsFirestore(
      (list) => {
        callbacks.onProducts(list);
        productsLoaded = true;
        checkReady();
      },
      callbacks.onError,
      workspace,
    );

    const unsubCombos = subscribeCombosFirestore(
      (list) => {
        callbacks.onCombos(list);
        combosLoaded = true;
        checkReady();
      },
      callbacks.onError,
      workspace,
    );

    return () => {
      unsubSettings();
      unsubSales();
      unsubExpenses();
      unsubProducts();
      unsubCombos();
    };
  }

  // Modo Supabase (PostgreSQL + RLS + Realtime)
  const supabase = getSupabaseClient();
  const tenantId = ctx.tenant.tenantId;
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

  const fetchAll = async () => {
    try {
      await Promise.all([
        fetchSettings(),
        fetchProducts(),
        fetchCombos(),
        fetchSales(),
        fetchExpenses(),
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

  const channel = supabase
    .channel(`tenant-sync-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shop_settings', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchSettings().catch((e) => active && callbacks.onError(e as Error)),
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
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sales', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchSales().catch((e) => active && callbacks.onError(e as Error)),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `tenant_id=eq.${tenantId}` },
      () => void fetchExpenses().catch((e) => active && callbacks.onError(e as Error)),
    )
    .subscribe();

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
  if (getActiveDataProvider() === 'firebase') {
    await saveSettingsToFirestore(ctx.user.uid, input, ctx.workspace);
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

export async function addProduct(
  ctx: DataExecutionContext,
  input: ProductInput,
): Promise<string> {
  if (getActiveDataProvider() === 'firebase') {
    return createProductInFirestore(ctx.user.uid, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await updateProductInFirestore(productId, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    return createComboInFirestore(ctx.user.uid, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await updateComboInFirestore(comboId, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await seedDefaultCatalogInFirestore(ctx.user.uid, xSaladaPrice, ctx.workspace);
    return;
  }

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
  if (getActiveDataProvider() === 'firebase') {
    await createSaleInFirestore(ctx.user.uid, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await updateSaleInFirestore(saleId, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await deleteSaleInFirestore(saleId, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await createExpenseInFirestore(ctx.user.uid, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await updateExpenseInFirestore(expenseId, input, ctx.workspace);
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
  if (getActiveDataProvider() === 'firebase') {
    await deleteExpenseInFirestore(expenseId, ctx.workspace);
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
