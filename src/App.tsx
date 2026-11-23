import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BellRing,
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  Settings,
  ShoppingBag,
  X,
} from 'lucide-react';
import { registerOrderPushSubscription, setOrderPushSubscriptionEnabled } from './services/orderPushNotifications';
import {
  addCombo,
  addExpense,
  addProduct,
  addSale,
  completeTenantOnboarding,
  type DataExecutionContext,
  deleteExpense,
  deleteSale,
  loginWithEmailPassword,
  loginWithGoogle,
  logoutSession,
  markOnlineOrderViewed,
  requestPasswordReset,
  updateAccountPassword,
  registerWithEmailPassword,
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
import { hasTenantPermission, selectAuthorizedTenant } from './services/rbacPolicy';
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
  formatCurrencyBRL,
  isLikelyDuplicateExpense,
  isLikelyDuplicateSale,
} from './utils/finance';
import {
  DEFAULT_DIGITAL_MENU_SETTINGS,
  formatOrderNumber,
  isUnreadNewOrder,
  ORDER_STATUS_LABELS,
} from './utils/onlineOrders';
import {
  BASE_APP_TITLE,
  type BrowserNotificationPermissionState,
  buildNewOrderNotificationContent,
  formatPendingOrdersDocumentTitle,
  getBrowserNotificationPermission,
  requestMobileOrderNotificationsPermission,
  resolveInitialRouteFromSearch,
  sendMobileSystemNotification,
  updateAppUnreadBadge,
  vibrateMobileDevice,
} from './utils/orderNotifications';
import {
  playNewOrderAlertChime,
  unlockAlertAudio,
} from './utils/soundAlert';
import { DashboardView } from './components/DashboardView';
import { ExpenseModal } from './components/ExpenseModal';
import { ExpensesView } from './components/ExpensesView';
import { LoginScreen } from './components/LoginScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OrdersCenterView } from './components/OrdersCenterView';
import { PublicMenuView } from './components/PublicMenuView';
import { PublicOrderTrackingView } from './components/PublicOrderTrackingView';
import { PasswordRecoveryScreen } from './components/PasswordRecoveryScreen';
import { ReportsView } from './components/ReportsView';
import { SaleModal } from './components/SaleModal';
import { SalesView } from './components/SalesView';
import { SettingsView } from './components/SettingsView';
import { StoreOnboardingScreen } from './components/StoreOnboardingScreen';
import { SubscriptionBlockedScreen } from './components/SubscriptionBlockedScreen';
import { PWAInstallButton } from './components/PWAInstallButton';

import { LandingPageView } from './components/landing/LandingPageView';
import { LegalDocumentView } from './components/landing/LegalDocumentView';
import { isDemoSandboxActive } from './services/demoSandbox';
import {
  hasAuthCallbackParams,
  isAuthShellRoute,
  parsePublicUrlRoute,
  type PublicUrlRoute,
} from './utils/publicRoutes';

const TENANT_PREF_KEY = 'mgw_active_tenant_id';
const SOUND_PREF_KEY = 'mgw_order_sound_enabled';
const PUSH_PREF_KEY = 'mgw_order_push_enabled';

function resolveCurrentPublicRoute(): PublicUrlRoute {
  if (typeof window === 'undefined') return { kind: 'landing' };
  let lastPublicMenuSlug = '';
  try {
    lastPublicMenuSlug = window.localStorage.getItem('mgw_public_menu_last_slug') || '';
  } catch {
    lastPublicMenuSlug = '';
  }
  return parsePublicUrlRoute(window.location.pathname, lastPublicMenuSlug);
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
  const [publicRoute, setPublicRoute] = useState<PublicUrlRoute>(() =>
    resolveCurrentPublicRoute(),
  );

  useEffect(() => {
    const onPopState = () => {
      setPublicRoute(resolveCurrentPublicRoute());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Cada experiência pública usa seu próprio manifesto instalável.
  // O painel administrativo mantém o manifesto principal do MGW Gestão.
  useEffect(() => {
    const isPublicMenuApp =
      publicRoute.kind === 'menu' || publicRoute.kind === 'tracking';
    const manifestHref = isPublicMenuApp
      ? '/manifest-cardapio.webmanifest'
      : '/manifest.webmanifest';

    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestHref;

    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (appleTitle) {
      appleTitle.content = isPublicMenuApp ? 'MGW Cardápio' : 'MGW Gestão';
    }
  }, [publicRoute.kind]);

  function navigatePublicPath(path: string) {
    if (typeof window === 'undefined') return;
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    const nextUrl = isDemo && !path.includes('demo=') ? `${path}?demo=1` : path;
    window.history.pushState({}, '', nextUrl);
    let lastSlug = '';
    try {
      lastSlug = window.localStorage.getItem('mgw_public_menu_last_slug') || '';
    } catch {
      lastSlug = '';
    }
    setPublicRoute(parsePublicUrlRoute(path, lastSlug));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [tenants, setTenants] = useState<TenantContext[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [legacyWorkspace, setLegacyWorkspace] = useState<WorkspaceAccess | undefined>(
    undefined,
  );
  const [authReady, setAuthReady] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined'
      ? resolveInitialRouteFromSearch(window.location.search)
      : 'dashboard',
  );
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
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(PUSH_PREF_KEY);
      return saved === null ? false : saved === '1';
    } catch {
      return false;
    }
  });
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermissionState>(() =>
      getBrowserNotificationPermission(),
    );
  const [liveOrderBanner, setLiveOrderBanner] = useState<
    OnlineOrderRecord[] | null
  >(null);
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

  async function handleEnableMobileNotifications() {
    if (soundEnabled) void unlockAlertAudio();
    const permission = await requestMobileOrderNotificationsPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      const tenantId = activeTenant?.tenantId;
      if (!user || !tenantId) {
        showToast('Não foi possível identificar o estabelecimento ativo.', 'err');
        return;
      }

      try {
        await registerOrderPushSubscription({ tenantId, userId: user.uid });
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Não foi possível cadastrar este celular para notificações.',
          'err',
        );
        return;
      }

      setPushEnabled(true);
      try {
        window.localStorage.setItem(PUSH_PREF_KEY, '1');
      } catch {
        // Ignora erro de storage
      }
      if (soundEnabled) void playNewOrderAlertChime();
      vibrateMobileDevice();
      await sendMobileSystemNotification({
        title: `Notificações ativadas — ${digitalMenuSettings.storeName || settings.establishmentName || 'MGW GESTÃO'}`,
        body: 'Este celular foi cadastrado para receber novos pedidos mesmo com o MGW Gestão fechado.',
        tag: 'mgw-notifications-enabled',
        orderId: null,
      });
      showToast('Este celular está cadastrado para receber novos pedidos!');
      return;
    }

    if (permission === 'denied') {
      showToast('Permissão bloqueada no navegador. Libere as notificações nas configurações do site.', 'err');
      return;
    }

    if (permission === 'unsupported') {
      showToast('Este navegador não suporta Web Push. No iPhone, instale o MGW Gestão na Tela de Início.', 'err');
    }
  }

  async function handleTogglePushNotifications() {
    const currentPermission = getBrowserNotificationPermission();
    setNotificationPermission(currentPermission);
    if (currentPermission !== 'granted') {
      await handleEnableMobileNotifications();
      return;
    }

    if (!user || !activeTenant) {
      showToast('Não foi possível identificar o estabelecimento ativo.', 'err');
      return;
    }

    const next = !pushEnabled;
    try {
      await setOrderPushSubscriptionEnabled({
        tenantId: activeTenant.tenantId,
        userId: user.uid,
        enabled: next,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível atualizar as notificações.', 'err');
      return;
    }

    setPushEnabled(next);
    try {
      window.localStorage.setItem(PUSH_PREF_KEY, next ? '1' : '0');
    } catch {
      // Ignora erro de storage
    }
    showToast(next ? 'Notificações Push reativadas.' : 'Notificações Push pausadas.');
  }

  async function handleTestOrderAlert() {
    if (soundEnabled) {
      await unlockAlertAudio();
      void playNewOrderAlertChime();
    }
    vibrateMobileDevice();

    const currentPermission = getBrowserNotificationPermission();
    setNotificationPermission(currentPermission);

    if (currentPermission === 'granted') {
      const sent = await sendMobileSystemNotification({
        title: `Teste de alerta de pedido — ${digitalMenuSettings.storeName || settings.establishmentName || 'MGW GESTÃO'}`,
        body: 'Se você viu esta notificação, os alertas em tempo real no dispositivo estão funcionando.',
        tag: 'mgw-test-order',
        orderId: null,
      });
      if (sent) {
        showToast('Alerta de teste enviado para o dispositivo!');
        return;
      }
    }

    showToast(
      'Alerta sonoro testado! Ative as notificações do navegador para receber no celular.',
      currentPermission === 'denied' ? 'err' : 'ok',
    );
  }

  const isShellRoute = isAuthShellRoute(publicRoute);

  useEffect(() => {
    if (!isShellRoute) return;
    const syncPermission = () => {
      setNotificationPermission(getBrowserNotificationPermission());
    };
    const onFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncPermission();
      }
    };
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', onFocusOrVisibility);

    let cleanupSwListener: (() => void) | undefined;
    if ('serviceWorker' in navigator) {
      const onSwMessage = (event: MessageEvent) => {
        const data = event.data as { type?: string } | undefined;
        if (data?.type === 'MGW_OPEN_ORDERS') {
          setRoute('orders');
          setLiveOrderBanner(null);
        }
      };
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      cleanupSwListener = () =>
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }

    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', onFocusOrVisibility);
      cleanupSwListener?.();
    };
  }, [isShellRoute]);

  useEffect(() => {
    if (!soundEnabled || !isShellRoute) return;
    const unlock = () => {
      void unlockAlertAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [soundEnabled, isShellRoute]);

  // Autenticacao e resolucao de estabelecimentos autorizados (rotas da landing, login, cadastro e painel)
  useEffect(() => {
    if (!isShellRoute) return;
    const unsub = subscribeAuthSession((state) => {
      setUser(state.user);
      setTenants(state.tenants);
      setLegacyWorkspace(state.legacyWorkspace);
      setAuthError(state.errorMessage);
      setPasswordRecovery(Boolean(state.passwordRecovery));

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
  }, [isShellRoute]);

  const activeTenant = useMemo<TenantContext | null>(
    () => selectAuthorizedTenant(tenants, selectedTenantId),
    [tenants, selectedTenantId],
  );

  const dataContext = useMemo<DataExecutionContext | null>(() => {
    if (!isShellRoute) return null;
    if (!user || !user.emailVerified || !activeTenant) return null;
    if (activeTenant.accessAllowed === false) return null;
    if (activeTenant.onboardingCompleted === false) return null;
    return {
      user,
      tenant: activeTenant,
      workspace: legacyWorkspace,
    };
  }, [isShellRoute, user, activeTenant, legacyWorkspace]);

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

  // Atualiza titulo da aba e badge no icone do app instalado (PWA)
  useEffect(() => {
    if (publicRoute.kind === 'terms') {
      document.title = 'Termos de Uso — MGW Gestão';
      return;
    }
    if (publicRoute.kind === 'privacy') {
      document.title = 'Política de Privacidade — MGW Gestão';
      return;
    }
    if (publicRoute.kind === 'menu' || publicRoute.kind === 'tracking') {
      return;
    }
    if (dataContext) {
      document.title = formatPendingOrdersDocumentTitle(
        unviewedOrdersCount,
        BASE_APP_TITLE,
      );
      updateAppUnreadBadge(unviewedOrdersCount);
      if (unviewedOrdersCount === 0) {
        setLiveOrderBanner(null);
      }
      return;
    }
    if (publicRoute.kind === 'login') {
      document.title = 'Entrar no sistema — MGW Gestão';
    } else if (publicRoute.kind === 'register') {
      document.title = 'Criar conta e testar grátis — MGW Gestão';
    } else if (publicRoute.kind === 'landing') {
      document.title =
        'MGW Gestão — Sistema para Lanchonetes e Cardápio Digital';
    }
  }, [publicRoute.kind, dataContext, unviewedOrdersCount]);

  // Alerta imediato (notificacao mobile, vibracao, banner e som) na chegada de novos pedidos
  useEffect(() => {
    if (!dataContext) return;
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

    if (newlyArrived.length > 0) {
      setLiveOrderBanner(newlyArrived);
      vibrateMobileDevice();
      if (soundEnabled) {
        void playNewOrderAlertChime();
      }
      const perm = getBrowserNotificationPermission();
      setNotificationPermission(perm);
      if (pushEnabled && perm === 'granted') {
        const payload = buildNewOrderNotificationContent(
          newlyArrived,
          digitalMenuSettings.storeName || settings.establishmentName,
        );
        if (payload) {
          void sendMobileSystemNotification(payload);
        }
      }
    }
  }, [
    dataContext,
    onlineOrders,
    dataLoading,
    soundEnabled,
    pushEnabled,
    digitalMenuSettings.storeName,
    settings.establishmentName,
  ]);

  // Reforco sonoro sutil enquanto houver pedido aguardando visualizacao
  useEffect(() => {
    if (!dataContext || !soundEnabled || unviewedOrdersCount === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void playNewOrderAlertChime();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [dataContext, soundEnabled, unviewedOrdersCount]);

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

  async function handleRegister(name: string, storeName: string, email: string, password: string) {
    setAuthError(null);
    await registerWithEmailPassword(name, storeName, email, password);
  }

  async function handlePasswordReset(email: string) {
    setAuthError(null);
    await requestPasswordReset(email);
  }

  async function handleUpdatePassword(password: string) {
    setAuthError(null);
    await updateAccountPassword(password);
  }

  async function handleLogout() {
    try {
      await logoutSession();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Não foi possível encerrar a sessão.',
        'err',
      );
    }
  }

  async function handleCompleteOnboarding(storeName: string, ownerName: string) {
    if (!activeTenant) return;
    const updated = await completeTenantOnboarding({
      tenantId: activeTenant.tenantId,
      storeName,
      ownerName,
    });
    setTenants((prev) =>
      prev.map((t) =>
        t.tenantId === updated.tenantId
          ? {
              ...t,
              name: updated.name,
              slug: updated.slug || t.slug,
              onboardingCompleted: true,
            }
          : t,
      ),
    );
    showToast('Estabelecimento configurado com sucesso!');
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
    if (!dataContext || !hasTenantPermission(dataContext.tenant.role, 'sales:delete')) return;
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
    if (!dataContext || !hasTenantPermission(dataContext.tenant.role, 'expenses:delete')) return;
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
        onOrderCreated={(token) => navigatePublicPath(`/cardapio/pedido/${token}`)}
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

  if (publicRoute.kind === 'terms') {
    return (
      <LegalDocumentView kind="terms" onNavigate={navigatePublicPath} />
    );
  }

  if (publicRoute.kind === 'privacy') {
    return (
      <LegalDocumentView kind="privacy" onNavigate={navigatePublicPath} />
    );
  }

  const demoActive = isDemoSandboxActive();
  const callbackPending =
    typeof window !== 'undefined' &&
    hasAuthCallbackParams(window.location.search, window.location.hash);

  if (publicRoute.kind === 'landing' && !demoActive && !callbackPending) {
    if (!authReady) {
      return <LandingPageView onNavigate={navigatePublicPath} />;
    }
    if (passwordRecovery) {
      return (
        <PasswordRecoveryScreen
          onSave={handleUpdatePassword}
          errorMessage={authError}
        />
      );
    }
    if (authError && (!user || !user.emailVerified || !activeTenant)) {
      return (
        <LoginScreen
          onGoogleLogin={handleGoogleLogin}
          onEmailLogin={handleEmailLogin}
          onRegister={handleRegister}
          onPasswordReset={handlePasswordReset}
          supportsEmailAuth={true}
          isSigningIn={isSigningIn}
          errorMessage={authError}
          onBackToHome={() => navigatePublicPath('/')}
        />
      );
    }
    if (!user || !user.emailVerified || !activeTenant) {
      return <LandingPageView onNavigate={navigatePublicPath} />;
    }
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] text-[#6B7280] flex items-center justify-center text-sm">
        Carregando MGW GESTÃO...
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <PasswordRecoveryScreen
        onSave={handleUpdatePassword}
        errorMessage={authError}
      />
    );
  }

  if (!user || !user.emailVerified || !activeTenant) {
    return (
      <LoginScreen
        initialMode={publicRoute.kind === 'register' ? 'register' : 'login'}
        onModeChange={(nextMode) => {
          if (typeof window === 'undefined') return;
          if (nextMode === 'register' && window.location.pathname !== '/cadastro') {
            window.history.replaceState({}, '', '/cadastro');
          } else if (nextMode === 'login' && window.location.pathname !== '/login') {
            window.history.replaceState({}, '', '/login');
          }
        }}
        onBackToHome={() => navigatePublicPath('/')}
        onGoogleLogin={handleGoogleLogin}
        onEmailLogin={handleEmailLogin}
        onRegister={handleRegister}
        onPasswordReset={handlePasswordReset}
        supportsEmailAuth={true}
        isSigningIn={isSigningIn}
        errorMessage={authError}
      />
    );
  }

  if (activeTenant.accessAllowed === false) {
    return (
      <SubscriptionBlockedScreen
        accountEmail={user.email}
        tenant={activeTenant}
        tenants={tenants}
        onSelectTenant={handleSelectTenant}
        onLogout={handleLogout}
      />
    );
  }

  if (activeTenant.onboardingCompleted === false) {
    return (
      <StoreOnboardingScreen
        accountEmail={user.email}
        initialStoreName={activeTenant.name}
        onComplete={handleCompleteOnboarding}
        onLogout={handleLogout}
      />
    );
  }

  const canViewDashboard = hasTenantPermission(activeTenant.role, 'dashboard:view');
  const canReadSales = hasTenantPermission(activeTenant.role, 'sales:read');
  const canCreateSales = hasTenantPermission(activeTenant.role, 'sales:create');
  const canEditSales = hasTenantPermission(activeTenant.role, 'sales:update');
  const canDeleteSales = hasTenantPermission(activeTenant.role, 'sales:delete');
  const canReadExpenses = hasTenantPermission(activeTenant.role, 'expenses:read');
  const canCreateExpenses = hasTenantPermission(activeTenant.role, 'expenses:create');
  const canEditExpenses = hasTenantPermission(activeTenant.role, 'expenses:update');
  const canDeleteExpenses = hasTenantPermission(activeTenant.role, 'expenses:delete');
  const canViewReports = hasTenantPermission(activeTenant.role, 'reports:view');
  const canWriteSettings = hasTenantPermission(activeTenant.role, 'settings:write');
  const canWriteCatalog = hasTenantPermission(activeTenant.role, 'catalog:write');
  const canAccessSettingsRoute = canWriteSettings || canWriteCatalog;

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.id === 'dashboard') return canViewDashboard;
    if (item.id === 'orders') return canReadSales;
    if (item.id === 'sales') return canReadSales || canCreateSales;
    if (item.id === 'expenses') return canReadExpenses;
    if (item.id === 'reports') return canViewReports;
    if (item.id === 'settings') return canAccessSettingsRoute;
    return false;
  });

  const effectiveRoute: AppRoute = visibleNavItems.some((item) => item.id === route)
    ? route
    : visibleNavItems[0]?.id ?? 'dashboard';
  const currentNav =
    visibleNavItems.find((item) => item.id === effectiveRoute) ??
    visibleNavItems[0] ??
    NAV_ITEMS[0];
  const hasMultipleTenants = tenants.length > 1;
  const mobileNavGridClass =
    (
      {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
      } as Record<number, string>
    )[visibleNavItems.length] ?? 'grid-cols-6';

  return (
    <div className="mgw-app-theme min-h-screen bg-[#F6F7F9] text-[#111827] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-[#E5E7EB]">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-[#E5E7EB]">
          <div className="w-9 h-9 rounded-xl bg-[#FFF9E8] border border-[#F0DFB1] flex items-center justify-center text-[#A87500] font-display font-bold">
            M
          </div>
          <span className="font-display font-bold text-base tracking-tight text-[#111827] whitespace-nowrap">
            MGW GESTÃO
          </span>
        </div>

        <nav
          aria-label="Navegação principal"
          className="flex-1 p-3 space-y-1 overflow-y-auto"
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = effectiveRoute === item.id;
            const showOrdersBadge = item.id === 'orders' && unviewedOrdersCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'settings') {
                    setSettingsInitialTab(canWriteSettings ? 'shop' : 'catalog');
                  }
                  setRoute(item.id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center justify-between gap-2 text-sm font-medium whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#F5B731]/12 text-[#F5B731]'
                    : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]'
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
                className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-xs text-[#111827]"
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
            className="w-full min-h-[42px] px-3 rounded-xl border border-[#E5E7EB] hover:border-[#D1D5DB] text-xs font-medium text-[#4B5563] hover:text-[#111827] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (Desktop 64px / Mobile 52px) */}
        <header className="sticky top-0 z-30 h-[52px] lg:h-16 bg-[#0B0D11]/95 backdrop-blur-md border-b border-[#E5E7EB] px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden font-display font-bold text-sm text-[#F5B731] whitespace-nowrap shrink-0">
              MGW GESTÃO
            </span>
            {hasMultipleTenants && (
              <select
                aria-label="Selecionar estabelecimento"
                value={activeTenant?.tenantId ?? ''}
                onChange={(e) => handleSelectTenant(e.target.value)}
                className="lg:hidden max-w-[120px] min-h-[34px] px-2 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] text-[11px] text-[#111827]"
              >
                {tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <h1 className="hidden lg:block text-lg font-bold text-[#111827] whitespace-nowrap truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton appName="MGW Gestão" installLabel="Instalar gestão" />
            {canCreateExpenses && (
              <button
                type="button"
                onClick={() => {
                  setEditingExpense(null);
                  setExpenseModalOpen(true);
                }}
                className="min-h-[40px] lg:min-h-[42px] px-3 lg:px-4 rounded-xl border border-[#F5B731]/40 hover:border-[#F5B731] bg-white text-[#A87500] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nova Despesa</span>
                <span className="sm:hidden">Despesa</span>
              </button>
            )}

            {canCreateSales && (
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
            )}
          </div>
        </header>

        {/* Real-time Sticky Order Alert Banner across all Admin Screens */}
        {canReadSales &&
          liveOrderBanner &&
          liveOrderBanner.length > 0 &&
          unviewedOrdersCount > 0 &&
          effectiveRoute !== 'orders' && (
            <div
              role="alert"
              data-testid="live-order-alert"
              className="mx-4 lg:mx-8 mt-4 rounded-2xl border border-[#F5B731] bg-[#FFFBEB] px-4 py-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/40 text-[#F5B731] flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-[#111827] truncate">
                    {liveOrderBanner.length === 1
                      ? `Novo Pedido ${formatOrderNumber(liveOrderBanner[0].orderNumber)} — ${liveOrderBanner[0].customerName}`
                      : `${liveOrderBanner.length} novos pedidos online recebidos!`}
                  </p>
                  <p className="text-[11px] sm:text-xs text-[#4B5563] truncate">
                    {liveOrderBanner.length === 1
                      ? `${
                          liveOrderBanner[0].fulfillmentType === 'delivery'
                            ? 'Entrega'
                            : 'Retirada'
                        } · ${formatCurrencyBRL(liveOrderBanner[0].totalAmount)} · ${liveOrderBanner[0].items
                          .slice(0, 2)
                          .map((i) => `${i.quantity}x ${i.itemName}`)
                          .join(', ')}`
                      : `Total somado: ${formatCurrencyBRL(
                          liveOrderBanner.reduce((acc, o) => acc + o.totalAmount, 0),
                        )} · Toque para confirmar`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => {
                    setLiveOrderBanner(null);
                    setRoute('orders');
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Ver Pedido
                </button>
                <button
                  type="button"
                  onClick={() => setLiveOrderBanner(null)}
                  aria-label="Dispensar alerta de novo pedido"
                  className="w-9 h-9 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

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
                  className="h-32 bg-white border border-[#E5E7EB] rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {effectiveRoute === 'dashboard' && canViewDashboard && (
                <DashboardView
                  sales={sales}
                  expenses={expenses}
                  settings={settings}
                  onlineOrders={onlineOrders}
                  onOpenNewSale={() => {
                    if (!canCreateSales) return;
                    setEditingSale(null);
                    setSaleModalOpen(true);
                  }}
                  onOpenNewExpense={() => {
                    if (!canCreateExpenses) return;
                    setEditingExpense(null);
                    setExpenseModalOpen(true);
                  }}
                  onOpenOrders={() => {
                    if (canReadSales) setRoute('orders');
                  }}
                />
              )}

              {effectiveRoute === 'orders' && canReadSales && (
                <OrdersCenterView
                  orders={onlineOrders}
                  digitalMenuSettings={digitalMenuSettings}
                  soundEnabled={soundEnabled}
                  pushEnabled={pushEnabled}
                  notificationPermission={notificationPermission}
                  onToggleSound={handleToggleSound}
                  onTogglePush={handleTogglePushNotifications}
                  onEnableMobileNotifications={() =>
                    void handleEnableMobileNotifications()
                  }
                  onTestAlert={() => void handleTestOrderAlert()}
                  onMarkViewed={handleMarkOnlineOrderViewed}
                  onTransitionStatus={handleTransitionOnlineOrderStatus}
                  onOpenDigitalMenuSettings={() => {
                    if (!canAccessSettingsRoute) return;
                    setSettingsInitialTab(canWriteSettings ? 'digital_menu' : 'catalog');
                    setRoute('settings');
                  }}
                />
              )}

              {effectiveRoute === 'sales' && (canReadSales || canCreateSales) && (
                <SalesView
                  sales={sales}
                  canCreateSales={canCreateSales}
                  canEditSales={canEditSales}
                  canDeleteSales={canDeleteSales}
                  onOpenNewSale={() => {
                    if (!canCreateSales) return;
                    setEditingSale(null);
                    setSaleModalOpen(true);
                  }}
                  onEditSale={(sale) => {
                    if (!canEditSales) return;
                    setEditingSale(sale);
                    setSaleModalOpen(true);
                  }}
                  onDeleteSale={handleDeleteSale}
                />
              )}

              {effectiveRoute === 'expenses' && canReadExpenses && (
                <ExpensesView
                  expenses={expenses}
                  canCreateExpenses={canCreateExpenses}
                  canEditExpenses={canEditExpenses}
                  canDeleteExpenses={canDeleteExpenses}
                  onOpenNewExpense={() => {
                    if (!canCreateExpenses) return;
                    setEditingExpense(null);
                    setExpenseModalOpen(true);
                  }}
                  onEditExpense={(expense) => {
                    if (!canEditExpenses) return;
                    setEditingExpense(expense);
                    setExpenseModalOpen(true);
                  }}
                  onDeleteExpense={handleDeleteExpense}
                />
              )}

              {effectiveRoute === 'reports' && canViewReports && (
                <ReportsView
                  sales={sales}
                  expenses={expenses}
                  settings={settings}
                />
              )}

              {effectiveRoute === 'settings' && canAccessSettingsRoute && (
                <SettingsView
                  workspaceId={dataContext?.tenant.tenantId || activeTenant.tenantId}
                  settings={settings}
                  products={products}
                  combos={combos}
                  digitalMenuSettings={digitalMenuSettings}
                  initialTab={settingsInitialTab}
                  accountEmail={user.email}
                  canManageShopSettings={canWriteSettings}
                  canManageDigitalMenu={canWriteSettings}
                  onLogout={handleLogout}
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
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-[#E5E7EB] grid ${mobileNavGridClass} items-center`}
      >
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = effectiveRoute === item.id;
          const showOrdersBadge = item.id === 'orders' && unviewedOrdersCount > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'settings') {
                  setSettingsInitialTab(canWriteSettings ? 'shop' : 'catalog');
                }
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

      <OfflineIndicator />
    </div>
  );
}
