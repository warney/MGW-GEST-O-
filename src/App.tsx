import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  Settings,
  ShoppingBag,
} from 'lucide-react';
import { getActiveDataProvider } from './lib/supabase';
import {
  addCombo,
  addExpense,
  addProduct,
  addSale,
  type DataExecutionContext,
  deleteExpense,
  deleteSale,
  loginWithEmailPassword,
  loginWithGoogle,
  logoutSession,
  markOnlineOrderViewed,
  requestPasswordReset,
  saveDigitalMenuSettings,
  saveSettings,
  seedDefaultCatalog,
  subscribeAllTenantData,
  subscribeAuthSession,
  transitionOnlineOrderStatus,
  updateCombo,
  updateExpense,
  updateProduct,
  updateSale,
} from './services/dataService';
import {
  type AppRoute,
  type AuthSessionUser,
  type ComboInput,
  type ComboRecord,
  DEFAULT_SHOP_SETTINGS,
  type DigitalMenuSettings,
  type DigitalMenuSettingsInput,
  type ExpenseInput,
  type ExpenseRecord,
  type OnlineOrderRecord,
  type OnlineOrderStatus,
  type ProductInput,
  type ProductRecord,
  type SaleInput,
  type SaleRecord,
  type ShopSettings,
  type TenantContext,
  type WorkspaceAccess,
} from './types/finance';
import {
  isLikelyDuplicateExpense,
  isLikelyDuplicateSale,
} from './utils/finance';
import {
  DEFAULT_DIGITAL_MENU_SETTINGS,
  isUnreadNewOrder,
  ORDER_STATUS_LABELS,
} from './utils/onlineOrders';
import {
  playNewOrderAlertChime,
  unlockAlertAudio,
} from './utils/soundAlert';
import { DashboardView } from './components/DashboardView';
import { ExpenseModal } from './components/ExpenseModal';
import { ExpensesView } from './components/ExpensesView';
import { LoginScreen } from './components/LoginScreen';
import { OrdersCenterView } from './components/OrdersCenterView';
import { PublicMenuView } from './components/PublicMenuView';
import { PublicOrderTrackingView } from './components/PublicOrderTrackingView';
import { ReportsView } from './components/ReportsView';
import { SaleModal } from './components/SaleModal';
import { SalesView } from './components/SalesView';
import { SettingsView } from './components/SettingsView';

const TENANT_PREF_KEY = 'mgw_active_tenant_id';
const SOUND_PREF_KEY = 'mgw_order_sound_enabled';

type PublicUrlRoute =
  | { kind: 'admin' }
  | { kind: 'menu'; slug?: string }
  | { kind: 'tracking'; token: string };

function parsePublicUrlRoute(pathname: string): PublicUrlRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/cardapio') {
    return { kind: 'menu' };
  }
  if (normalized.startsWith('/cardapio/')) {
    const slug = decodeURIComponent(normalized.slice('/cardapio/'.length));
    return slug ? { kind: 'menu', slug } : { kind: 'menu' };
  }
  if (normalized.startsWith('/pedido/')) {
    const token = decodeURIComponent(normalized.slice('/pedido/'.length));
    if (token) return { kind: 'tracking', token };
  }
  return { kind: 'admin' };
}

const NAV_ITEMS: Array<{
  id: AppRoute;
  label: string;
  mobileLabel: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Início', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', mobileLabel: 'Pedidos', icon: ClipboardList },
  { id: 'sales', label: 'Vendas', mobileLabel: 'Vendas', icon: ShoppingBag },
  { id: 'expenses', label: 'Despesas', mobileLabel: 'Despesas', icon: Receipt },
  { id: 'reports', label: 'Relatórios', mobileLabel: 'Relat.', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', mobileLabel: 'Ajustes', icon: Settings },
];

export default function App() {
  const activeProvider = getActiveDataProvider();

  const [publicRoute, setPublicRoute] = useState<PublicUrlRoute>(() =>
    typeof window !== 'undefined'
      ? parsePublicUrlRoute(window.location.pathname)
      : { kind: 'admin' },
  );

  useEffect(() => {
    const onPopState = () => {
      setPublicRoute(parsePublicUrlRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigatePublicPath(path: string) {
    if (typeof window === 'undefined') return;
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    const nextUrl = isDemo && !path.includes('demo=') ? `${path}?demo=1` : path;
    window.history.pushState({}, '', nextUrl);
    setPublicRoute(parsePublicUrlRoute(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [tenants, setTenants] = useState<TenantContext[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [legacyWorkspace, setLegacyWorkspace] = useState<WorkspaceAccess | undefined>(
    undefined,
  );
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'shop' | 'catalog' | 'digital_menu'
  >('shop');
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [combos, setCombos] = useState<ComboRecord[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrderRecord[]>([]);
  const [settings, setSettings] = useState<ShopSettings>({
    ownerId: '',
    ...DEFAULT_SHOP_SETTINGS,
  });
  const [digitalMenuSettings, setDigitalMenuSettings] =
    useState<DigitalMenuSettings>({
      tenantId: '',
      ...DEFAULT_DIGITAL_MENU_SETTINGS,
    });
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(SOUND_PREF_KEY);
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const ordersInitializedRef = useRef(false);

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);

  const [toast, setToast] = useState<{ text: string; type: 'ok' | 'err' } | null>(
    null,
  );
  const toastTimerRef = useRef<number | null>(null);

  function showToast(text: string, type: 'ok' | 'err' = 'ok') {
    setToast({ text, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }

  function handleToggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_PREF_KEY, next ? '1' : '0');
      } catch {
        // Ignora erro de storage
      }
      if (next) {
        void unlockAlertAudio().then((ok) => {
          if (ok) void playNewOrderAlertChime();
        });
      }
      return next;
    });
  }

  useEffect(() => {
    if (!soundEnabled || publicRoute.kind !== 'admin') return;
    const unlock = () => {
      void unlockAlertAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [soundEnabled, publicRoute.kind]);

  // Autenticacao e resolucao de estabelecimentos autorizados (apenas rota administrativa)
  useEffect(() => {
    if (publicRoute.kind !== 'admin') return;
    const unsub = subscribeAuthSession((state) => {
      setUser(state.user);
      setTenants(state.tenants);
      setLegacyWorkspace(state.legacyWorkspace);
      setAuthError(state.errorMessage);

      if (state.tenants.length > 0) {
        let preferred = '';
        try {
          preferred = window.localStorage.getItem(TENANT_PREF_KEY) || '';
        } catch {
          preferred = '';
        }
        const matched = state.tenants.find((t) => t.tenantId === preferred);
        setSelectedTenantId((prev) => {
          if (prev && state.tenants.some((t) => t.tenantId === prev)) {
            return prev;
          }
          return matched ? matched.tenantId : state.tenants[0].tenantId;
        });
      } else {
        setSelectedTenantId('');
      }

      setAuthReady(true);
    });
    return unsub;
  }, [publicRoute.kind]);

  const activeTenant = useMemo<TenantContext | null>(() => {
    if (tenants.length === 0) return null;
    return tenants.find((t) => t.tenantId === selectedTenantId) ?? tenants[0];
  }, [tenants, selectedTenantId]);

  const dataContext = useMemo<DataExecutionContext | null>(() => {
    if (publicRoute.kind !== 'admin') return null;
    if (!user || !user.emailVerified || !activeTenant) return null;
    return {
      user,
      tenant: activeTenant,
      workspace: legacyWorkspace,
    };
  }, [publicRoute.kind, user, activeTenant, legacyWorkspace]);

  // Assinatura reativa dos dados do tenant selecionado
  useEffect(() => {
    if (!dataContext) {
      setSales([]);
      setExpenses([]);
      setProducts([]);
      setCombos([]);
      setOnlineOrders([]);
      setSettings({ ownerId: '', ...DEFAULT_SHOP_SETTINGS });
      setDigitalMenuSettings({
        tenantId: '',
        ...DEFAULT_DIGITAL_MENU_SETTINGS,
      });
      knownOrderIdsRef.current = new Set();
      ordersInitializedRef.current = false;
      setDataLoading(false);
      return;
    }

    setSales([]);
    setExpenses([]);
    setProducts([]);
    setCombos([]);
    setOnlineOrders([]);
    setSettings({
      ownerId: dataContext.user.uid,
      ...DEFAULT_SHOP_SETTINGS,
      establishmentName: dataContext.tenant.name,
    });
    setDigitalMenuSettings({
      tenantId: dataContext.tenant.tenantId,
      ...DEFAULT_DIGITAL_MENU_SETTINGS,
      slug: dataContext.tenant.slug,
      storeName: dataContext.tenant.name,
    });
    knownOrderIdsRef.current = new Set();
    ordersInitializedRef.current = false;
    setDataLoading(true);
    setDataError(null);

    const unsub = subscribeAllTenantData(dataContext, {
      onSettings: setSettings,
      onDigitalMenuSettings: setDigitalMenuSettings,
      onProducts: setProducts,
      onCombos: setCombos,
      onSales: setSales,
      onExpenses: setExpenses,
      onOnlineOrders: setOnlineOrders,
      onReady: () => setDataLoading(false),
      onError: (err) => {
        setDataError(err.message);
        setDataLoading(false);
      },
    });

    return unsub;
  }, [dataContext]);

  const unviewedOrdersCount = useMemo(
    () => onlineOrders.filter(isUnreadNewOrder).length,
    [onlineOrders],
  );

  // Alerta sonoro imediato na chegada de novos pedidos nao visualizados
  useEffect(() => {
    if (publicRoute.kind !== 'admin') return;
    if (!ordersInitializedRef.current) {
      if (!dataLoading) {
        knownOrderIdsRef.current = new Set(onlineOrders.map((o) => o.id));
        ordersInitializedRef.current = true;
      }
      return;
    }

    const newlyArrived = onlineOrders.filter(
      (o) => !knownOrderIdsRef.current.has(o.id) && isUnreadNewOrder(o),
    );
    knownOrderIdsRef.current = new Set(onlineOrders.map((o) => o.id));

    if (newlyArrived.length > 0 && soundEnabled) {
      void playNewOrderAlertChime();
    }
  }, [onlineOrders, dataLoading, soundEnabled, publicRoute.kind]);

  // Reforco sonoro sutil enquanto houver pedido aguardando visualizacao
  useEffect(() => {
    if (publicRoute.kind !== 'admin' || !soundEnabled || unviewedOrdersCount === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void playNewOrderAlertChime();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [publicRoute.kind, soundEnabled, unviewedOrdersCount]);

  function handleSelectTenant(nextTenantId: string) {
    if (!tenants.some((t) => t.tenantId === nextTenantId)) return;
    setSelectedTenantId(nextTenantId);
    try {
      window.localStorage.setItem(TENANT_PREF_KEY, nextTenantId);
    } catch {
      // Ignora erro de storage bloqueado
    }
  }

  async function handleGoogleLogin() {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Não foi possível iniciar sessão com o Google.',
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleEmailLogin(email: string, password: string) {
    setAuthError(null);
    await loginWithEmailPassword(email, password);
  }

  async function handlePasswordReset(email: string) {
    setAuthError(null);
    await requestPasswordReset(email);
  }

  async function handleLogout() {
    await logoutSession();
  }

  async function handleSaveSale(input: SaleInput, editingId?: string) {
    if (!editingId && isLikelyDuplicateSale(sales, input)) {
      throw new Error(
        'Venda idêntica registrada há poucos segundos. Evitamos duplicação acidental.',
      );
    }

    if (!dataContext) return;
    if (editingId) {
      await updateSale(dataContext, editingId, input);
      showToast('Venda atualizada no banco de dados.');
    } else {
      await addSale(dataContext, input);
      showToast('Venda salva permanentemente.');
    }
  }

  async function handleDeleteSale(saleId: string) {
    if (!dataContext) return;
    await deleteSale(dataContext, saleId);
    showToast('Venda excluída.');
  }

  async function handleSaveExpense(input: ExpenseInput, editingId?: string) {
    if (!editingId && isLikelyDuplicateExpense(expenses, input)) {
      throw new Error(
        'Despesa idêntica lançada há poucos segundos. Evitamos duplicação acidental.',
      );
    }

    if (!dataContext) return;
    if (editingId) {
      await updateExpense(dataContext, editingId, input);
      showToast('Despesa atualizada no banco de dados.');
    } else {
      await addExpense(dataContext, input);
      showToast('Despesa salva permanentemente.');
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!dataContext) return;
    await deleteExpense(dataContext, expenseId);
    showToast('Despesa excluída.');
  }

  async function handleSaveSettings(next: Omit<ShopSettings, 'ownerId'>) {
    if (!dataContext) return;
    await saveSettings(dataContext, next);
    showToast('Configurações salvas.');
  }

  async function handleCreateProduct(input: ProductInput): Promise<string> {
    if (!dataContext) return '';
    const id = await addProduct(dataContext, input);
    showToast('Produto cadastrado.');
    return id;
  }

  async function handleUpdateProduct(
    productId: string,
    input: ProductInput,
  ): Promise<void> {
    if (!dataContext) return;
    await updateProduct(dataContext, productId, input);
    showToast('Produto atualizado.');
  }

  async function handleCreateCombo(input: ComboInput): Promise<string> {
    if (!dataContext) return '';
    const id = await addCombo(dataContext, input);
    showToast('Combo cadastrado.');
    return id;
  }

  async function handleUpdateCombo(
    comboId: string,
    input: ComboInput,
  ): Promise<void> {
    if (!dataContext) return;
    await updateCombo(dataContext, comboId, input);
    showToast('Combo atualizado.');
  }

  async function handleSaveDigitalMenuSettings(next: DigitalMenuSettingsInput) {
    if (!dataContext) return;
    await saveDigitalMenuSettings(dataContext, next);
    showToast('Configurações do cardápio digital salvas.');
  }

  async function handleMarkOnlineOrderViewed(order: OnlineOrderRecord) {
    if (!dataContext) return;
    await markOnlineOrderViewed(dataContext, order);
  }

  async function handleTransitionOnlineOrderStatus(
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
    reason = '',
  ) {
    if (!dataContext) return;
    await transitionOnlineOrderStatus(dataContext, order, nextStatus, reason);
    showToast(
      `Pedido #${String(order.orderNumber).padStart(4, '0')} atualizado para "${ORDER_STATUS_LABELS[nextStatus]}".`,
    );
  }

  async function handleSeedCatalog(): Promise<void> {
    if (!dataContext) return;
    await seedDefaultCatalog(dataContext, settings.xSaladaPrice);
    showToast('Produtos base e Combos 1 a 4 criados.');
  }

  if (publicRoute.kind === 'menu') {
    return (
      <PublicMenuView
        slug={publicRoute.slug}
        onOrderCreated={(token) => navigatePublicPath(`/pedido/${token}`)}
      />
    );
  }

  if (publicRoute.kind === 'tracking') {
    return (
      <PublicOrderTrackingView
        token={publicRoute.token}
        onBackToMenu={(slug) =>
          navigatePublicPath(slug ? `/cardapio/${slug}` : '/cardapio')
        }
      />
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0B0D11] text-[#9CA3AF] flex items-center justify-center text-sm">
        Carregando MGW GESTÃO...
      </div>
    );
  }

  if (!user || !dataContext) {
    return (
      <LoginScreen
        onGoogleLogin={handleGoogleLogin}
        onEmailLogin={handleEmailLogin}
        onPasswordReset={handlePasswordReset}
        supportsEmailAuth={activeProvider === 'supabase'}
        isSigningIn={isSigningIn}
        errorMessage={authError}
      />
    );
  }

  const currentNav = NAV_ITEMS.find((item) => item.id === route) ?? NAV_ITEMS[0];
  const hasMultipleTenants = tenants.length > 1;

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#12151C] border-r border-[#232834]">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-[#232834]">
          <div className="w-9 h-9 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731] font-display font-bold">
            M
          </div>
          <span className="font-display font-bold text-base tracking-tight text-[#F3F4F6] whitespace-nowrap">
            MGW GESTÃO
          </span>
        </div>

        <nav
          aria-label="Navegação principal"
          className="flex-1 p-3 space-y-1 overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            const showOrdersBadge = item.id === 'orders' && unviewedOrdersCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'settings') setSettingsInitialTab('shop');
                  setRoute(item.id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center justify-between gap-2 text-sm font-medium whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#F5B731]/12 text-[#F5B731]'
                    : 'text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#181C24]'
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {showOrdersBadge && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#F5B731] text-[#0B0D11] text-[11px] font-bold font-mono tabular-nums flex items-center justify-center">
                    {unviewedOrdersCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#232834] space-y-3">
          {hasMultipleTenants && (
            <div>
              <label
                htmlFor="desktop-tenant-select"
                className="flex items-center gap-1.5 text-[11px] font-medium text-[#9CA3AF] mb-1.5"
              >
                <Building2 className="w-3.5 h-3.5 text-[#F5B731]" />
                Estabelecimento
              </label>
              <select
                id="desktop-tenant-select"
                value={activeTenant?.tenantId ?? ''}
                onChange={(e) => handleSelectTenant(e.target.value)}
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-xs text-[#F3F4F6]"
              >
                {tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-xs text-[#9CA3AF] truncate">
            {user.email}
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full min-h-[42px] px-3 rounded-xl border border-[#232834] hover:border-[#374151] text-xs font-medium text-[#D1D5DB] hover:text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (Desktop 64px / Mobile 52px) */}
        <header className="sticky top-0 z-30 h-[52px] lg:h-16 bg-[#0B0D11]/95 backdrop-blur-md border-b border-[#232834] px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden font-display font-bold text-sm text-[#F5B731] whitespace-nowrap shrink-0">
              MGW GESTÃO
            </span>
            {hasMultipleTenants && (
              <select
                aria-label="Selecionar estabelecimento"
                value={activeTenant?.tenantId ?? ''}
                onChange={(e) => handleSelectTenant(e.target.value)}
                className="lg:hidden max-w-[120px] min-h-[34px] px-2 rounded-lg bg-[#12151C] border border-[#232834] text-[11px] text-[#F3F4F6]"
              >
                {tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <h1 className="hidden lg:block text-lg font-bold text-[#F3F4F6] whitespace-nowrap truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setExpenseModalOpen(true);
              }}
              className="min-h-[40px] lg:min-h-[42px] px-3 lg:px-4 rounded-xl border border-[#F5B731]/40 hover:border-[#F5B731] bg-[#12151C] text-[#F5B731] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nova Despesa</span>
              <span className="sm:hidden">Despesa</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingSale(null);
                setSaleModalOpen(true);
              }}
              className="min-h-[40px] lg:min-h-[42px] px-3 lg:px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nova Venda</span>
              <span className="sm:hidden">Venda</span>
            </button>
          </div>
        </header>

        {/* Toast Feedback */}
        {toast && (
          <div
            role="status"
            className={`mx-4 lg:mx-8 mt-4 px-4 py-3 rounded-xl text-xs font-medium border ${
              toast.type === 'ok'
                ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#86EFAC]'
                : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#FCA5A5]'
            }`}
          >
            {toast.text}
          </div>
        )}

        {dataError && (
          <div
            role="alert"
            className="mx-4 lg:mx-8 mt-4 px-4 py-3 rounded-xl text-xs bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#FCA5A5]"
          >
            Erro ao sincronizar dados: {dataError}
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-7xl w-full mx-auto">
          {dataLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-[#12151C] border border-[#232834] rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {route === 'dashboard' && (
                <DashboardView
                  sales={sales}
                  expenses={expenses}
                  settings={settings}
                  onlineOrders={onlineOrders}
                  onOpenNewSale={() => {
                    setEditingSale(null);
                    setSaleModalOpen(true);
                  }}
                  onOpenNewExpense={() => {
                    setEditingExpense(null);
                    setExpenseModalOpen(true);
                  }}
                  onOpenOrders={() => setRoute('orders')}
                />
              )}

              {route === 'orders' && (
                <OrdersCenterView
                  orders={onlineOrders}
                  digitalMenuSettings={digitalMenuSettings}
                  soundEnabled={soundEnabled}
                  onToggleSound={handleToggleSound}
                  onMarkViewed={handleMarkOnlineOrderViewed}
                  onTransitionStatus={handleTransitionOnlineOrderStatus}
                  onOpenDigitalMenuSettings={() => {
                    setSettingsInitialTab('digital_menu');
                    setRoute('settings');
                  }}
                />
              )}

              {route === 'sales' && (
                <SalesView
                  sales={sales}
                  onOpenNewSale={() => {
                    setEditingSale(null);
                    setSaleModalOpen(true);
                  }}
                  onEditSale={(sale) => {
                    setEditingSale(sale);
                    setSaleModalOpen(true);
                  }}
                  onDeleteSale={handleDeleteSale}
                />
              )}

              {route === 'expenses' && (
                <ExpensesView
                  expenses={expenses}
                  onOpenNewExpense={() => {
                    setEditingExpense(null);
                    setExpenseModalOpen(true);
                  }}
                  onEditExpense={(expense) => {
                    setEditingExpense(expense);
                    setExpenseModalOpen(true);
                  }}
                  onDeleteExpense={handleDeleteExpense}
                />
              )}

              {route === 'reports' && (
                <ReportsView
                  sales={sales}
                  expenses={expenses}
                  settings={settings}
                />
              )}

              {route === 'settings' && (
                <SettingsView
                  settings={settings}
                  products={products}
                  combos={combos}
                  digitalMenuSettings={digitalMenuSettings}
                  initialTab={settingsInitialTab}
                  onSaveSettings={handleSaveSettings}
                  onSaveDigitalMenuSettings={handleSaveDigitalMenuSettings}
                  onCreateProduct={handleCreateProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onCreateCombo={handleCreateCombo}
                  onUpdateCombo={handleUpdateCombo}
                  onSeedCatalog={handleSeedCatalog}
                  onPreviewPublicMenu={(slug) =>
                    navigatePublicPath(slug ? `/cardapio/${slug}` : '/cardapio')
                  }
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (64px) */}
      <nav
        aria-label="Menu inferior"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#12151C]/95 backdrop-blur-md border-t border-[#232834] grid grid-cols-6 items-center"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          const showOrdersBadge = item.id === 'orders' && unviewedOrdersCount > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'settings') setSettingsInitialTab('shop');
                setRoute(item.id);
              }}
              aria-current={active ? 'page' : undefined}
              className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer ${
                active ? 'text-[#F5B731]' : 'text-[#9CA3AF]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {showOrdersBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#F5B731] text-[#0B0D11] text-[9px] font-bold font-mono tabular-nums flex items-center justify-center">
                    {unviewedOrdersCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      <SaleModal
        isOpen={saleModalOpen}
        editingSale={editingSale}
        defaultUnitPrice={settings.xSaladaPrice}
        establishmentName={settings.establishmentName}
        products={products}
        combos={combos}
        onClose={() => {
          setSaleModalOpen(false);
          setEditingSale(null);
        }}
        onSubmit={handleSaveSale}
      />

      <ExpenseModal
        isOpen={expenseModalOpen}
        editingExpense={editingExpense}
        establishmentName={settings.establishmentName}
        onClose={() => {
          setExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        onSubmit={handleSaveExpense}
      />
    </div>
  );
}
