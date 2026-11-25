import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import {
  inspectOrderPushDiagnostics,
  handlePushSubscriptionRotated,
  registerOrderPushSubscription,
  removeRegisteredPushDevice,
  sendBackendOrderPushTest,
  setOrderPushSubscriptionEnabled,
  syncExistingOrderPushSubscription,
  type OrderPushDiagnosticsSnapshot,
} from './services/orderPushNotifications';
import {
  addCombo,
  addExpense,
  addProduct,
  addSale,
  advanceDeliveryDispatchStatus,
  assignDeliveryCourier,
  cancelDeliveryDispatch,
  completeTenantOnboarding,
  createDeliveryCourier,
  createDeliveryCustomer,
  createDeliveryRegion,
  type DataExecutionContext,
  deleteDeliveryCourier,
  deleteDeliveryCustomerAddress,
  deleteDeliveryRegion,
  deleteExpense,
  deleteSale,
  loginWithEmailPassword,
  loginWithGoogle,
  logoutSession,
  markOnlineOrderViewed,
  reassignDeliveryCourier,
  requestPasswordReset,
  respondDeliveryDispatch,
  updateAccountPassword,
  registerWithEmailPassword,
  registerPartnerWithEmailPassword,
  type PartnerAuthProfile,
  saveCustomerClassificationConfig,
  saveDeliveryCustomerAddress,
  saveDeliveryPricingSettings,
  saveDigitalMenuSettings,
  saveSettings,
  seedDefaultCatalog,
  setPrimaryDeliveryCustomerAddress,
  subscribeAllTenantData,
  subscribeAuthSession,
  toggleDeliveryRegionStatus,
  toggleDeliveryRegionSuspension,
  transitionOnlineOrderStatus,
  updateCombo,
  updateDeliveryCourier,
  updateDeliveryCourierAvailability,
  updateDeliveryCourierStatus,
  updateDeliveryCustomer,
  updateDeliveryRegion,
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
  type DeliveryCourierInput,
  type DeliveryCourierRecord,
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
import { DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG } from './utils/deliveryCustomers';
import { DISPATCH_STATUS_LABELS } from './utils/deliveryDispatch';
import { DEFAULT_DELIVERY_PRICING_SETTINGS } from './utils/deliveryRegions';
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
  filterUnalertedOrderIds,
  markOrdersSoundAlerted,
  playNewOrderAlertChime,
  unlockAlertAudio,
} from './utils/soundAlert';
import { DashboardView } from './components/DashboardView';
import { DeliveryCouriersView } from './components/DeliveryCouriersView';
import { DeliveryCustomersView } from './components/DeliveryCustomersView';
import { DeliveryDashboardView } from './components/DeliveryDashboardView';
import { DeliveryDispatchView } from './components/DeliveryDispatchView';
import { DeliveryRegionsView } from './components/DeliveryRegionsView';
import { ExpenseModal } from './components/ExpenseModal';
import { ExpensesView } from './components/ExpensesView';
import { LoginScreen } from './components/LoginScreen';
import { PartnerAccessScreen } from './components/partners/PartnerAccessScreen';
import { PartnerDashboardView } from './components/partners/PartnerDashboardView';
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
import { AppShell } from './components/AppShell';

import { LandingPageView } from './components/landing/LandingPageView';
import { LegalDocumentView } from './components/landing/LegalDocumentView';
import { isDemoSandboxActive } from './services/demoSandbox';
import { getSupabaseClient } from './lib/supabase';
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

    // Mantém o tema independente do Cardápio Digital público.
    document.documentElement.classList.toggle('dark', isPublicMenuApp);
    document.documentElement.style.colorScheme = isPublicMenuApp ? 'dark' : 'light';
    document.body.style.backgroundColor = isPublicMenuApp ? '#0B0D11' : '#F5F6FA';

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

    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (themeMeta) {
      themeMeta.content = isPublicMenuApp ? '#0B0D11' : '#F5F6FA';
    }

    const iconLink = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"]',
    );
    if (iconLink) {
      iconLink.href = isPublicMenuApp ? '/icon-cardapio.svg' : '/icon.svg';
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
  const [partner, setPartner] = useState<PartnerAuthProfile | null>(null);
  const [tenants, setTenants] = useState<TenantContext[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const activeTenant = useMemo<TenantContext | null>(
    () => selectAuthorizedTenant(tenants, selectedTenantId),
    [tenants, selectedTenantId],
  );
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
  const [deliveryCustomers, setDeliveryCustomers] = useState<DeliveryCustomerRecord[]>([]);
  const [deliveryCustomerAddresses, setDeliveryCustomerAddresses] = useState<
    DeliveryCustomerAddressRecord[]
  >([]);
  const [deliveryCouriers, setDeliveryCouriers] = useState<DeliveryCourierRecord[]>([]);
  const [deliveryDispatches, setDeliveryDispatches] = useState<DeliveryDispatchRecord[]>([]);
  const [deliveryDispatchHistory, setDeliveryDispatchHistory] = useState<
    DeliveryDispatchHistoryRecord[]
  >([]);
  const [deliveryRegions, setDeliveryRegions] = useState<DeliveryRegionRecord[]>([]);
  const [deliveryPricingSettings, setDeliveryPricingSettings] =
    useState<DeliveryPricingSettings>({
      tenantId: '',
      ...DEFAULT_DELIVERY_PRICING_SETTINGS,
    });
  const [customerClassificationConfig, setCustomerClassificationConfig] =
    useState<DeliveryCustomerClassificationConfig>(
      DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG,
    );
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
  const [pushDiagnostics, setPushDiagnostics] =
    useState<OrderPushDiagnosticsSnapshot | null>(null);
  const [pushDiagnosticsLoading, setPushDiagnosticsLoading] = useState(false);
  const [liveOrderBanner, setLiveOrderBanner] = useState<
    OnlineOrderRecord[] | null
  >(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const swPushedOrderIdsRef = useRef<Set<string>>(new Set());
  const ordersInitializedRef = useRef(false);
  const [ordersSyncTick, setOrdersSyncTick] = useState(0);
  const prevSyncedTenantRef = useRef<string | null>(null);
  const ordersRefreshPromiseRef = useRef<{
    resolve: () => void;
    reject: (err: Error) => void;
  } | null>(null);

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

  const refreshPushDiagnostics = useCallback(
    async (tenantIdOverride?: string, userIdOverride?: string) => {
      const targetTenantId = tenantIdOverride ?? activeTenant?.tenantId;
      const targetUserId = userIdOverride ?? user?.uid;
      if (!targetTenantId || !targetUserId) return;
      setPushDiagnosticsLoading(true);
      try {
        const snapshot = await inspectOrderPushDiagnostics({
          tenantId: targetTenantId,
          userId: targetUserId,
        });
        setPushDiagnostics(snapshot);
        setNotificationPermission(snapshot.permission);
      } finally {
        setPushDiagnosticsLoading(false);
      }
    },
    [activeTenant?.tenantId, user?.uid],
  );

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
          error instanceof Error ? error.message : 'Não foi possível cadastrar este dispositivo para notificações.',
          'err',
        );
        void refreshPushDiagnostics(tenantId, user.uid);
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
        title: `🔔 Notificações ativadas — ${digitalMenuSettings.storeName || settings.establishmentName || 'MGW GESTÃO'}`,
        body: 'Este dispositivo foi inscrito para receber novos pedidos mesmo com o MGW Gestão em segundo plano.',
        tag: 'mgw-notifications-enabled',
        orderId: null,
      });
      void refreshPushDiagnostics(tenantId, user.uid);
      showToast('Dispositivo inscrito para receber notificações de novos pedidos!');
      return;
    }

    void refreshPushDiagnostics();
    if (permission === 'denied') {
      showToast('Permissão bloqueada no navegador. Libere as notificações no cadeado ao lado do endereço.', 'err');
      return;
    }

    if (permission === 'unsupported') {
      showToast('Este navegador não suporta Web Push. No iPhone, adicione o MGW Gestão à Tela de Início.', 'err');
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
    void refreshPushDiagnostics(activeTenant.tenantId, user.uid);
    showToast(next ? 'Notificações Push reativadas.' : 'Notificações Push pausadas neste dispositivo.');
  }

  async function handleTestOrderAlert() {
    if (soundEnabled) {
      await unlockAlertAudio();
      void playNewOrderAlertChime();
    }
    vibrateMobileDevice();

    const currentPermission = getBrowserNotificationPermission();
    setNotificationPermission(currentPermission);

    if (currentPermission === 'granted' && user && activeTenant) {
      try {
        const result = await sendBackendOrderPushTest({
          tenantId: activeTenant.tenantId,
          userId: user.uid,
        });
        void refreshPushDiagnostics(activeTenant.tenantId, user.uid);
        if (result.ok) {
          showToast(result.message);
          return;
        }
        showToast(result.message, 'err');
        return;
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Falha ao enviar teste Web Push pelo servidor.';
        showToast(msg, 'err');
        void refreshPushDiagnostics(activeTenant.tenantId, user.uid);
        return;
      }
    }

    showToast(
      currentPermission === 'denied'
        ? 'Som testado, mas as notificações estão bloqueadas no navegador.'
        : 'Som testado! Clique em "Ativar notificações" para testar o alerta Push no dispositivo.',
      currentPermission === 'denied' ? 'err' : 'ok',
    );
  }

  async function handleRemovePushDevice(subscriptionId: string) {
    if (!user || !activeTenant) return;
    try {
      await removeRegisteredPushDevice({
        tenantId: activeTenant.tenantId,
        userId: user.uid,
        subscriptionId,
      });
      await refreshPushDiagnostics(activeTenant.tenantId, user.uid);
      showToast('Dispositivo removido da lista de alertas.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Não foi possível remover o dispositivo.',
        'err',
      );
    }
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
        if (route === 'orders') {
          void refreshPushDiagnostics();
        }
      }
    };
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', onFocusOrVisibility);

    let cleanupSwListener: (() => void) | undefined;
    if ('serviceWorker' in navigator) {
      const onSwMessage = (event: MessageEvent) => {
        const data = event.data as
          | {
              type?: string;
              orderId?: string | null;
              tenantId?: string | null;
              oldEndpoint?: string | null;
            }
          | undefined;
        if (data?.type === 'MGW_OPEN_ORDERS') {
          if (
            data.tenantId &&
            tenants.some((t) => t.tenantId === data.tenantId) &&
            data.tenantId !== selectedTenantId
          ) {
            setSelectedTenantId(data.tenantId);
          }
          setRoute('orders');
          setLiveOrderBanner(null);
          setOrdersSyncTick((n) => n + 1);
        } else if (data?.type === 'MGW_NEW_ORDER_PUSH') {
          if (data.orderId) {
            swPushedOrderIdsRef.current.add(data.orderId);
          }
          setOrdersSyncTick((n) => n + 1);
        } else if (data?.type === 'MGW_PUSH_SUBSCRIPTION_CHANGED') {
          if (user && activeTenant) {
            void handlePushSubscriptionRotated({
              tenantId: activeTenant.tenantId,
              userId: user.uid,
              oldEndpoint: data.oldEndpoint,
            }).then(() => refreshPushDiagnostics(activeTenant.tenantId, user.uid));
          }
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
  }, [isShellRoute, route, tenants, selectedTenantId, user, activeTenant, refreshPushDiagnostics]);

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
      setPartner(state.partner ?? null);
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
      prevSyncedTenantRef.current = null;
      setSales([]);
      setExpenses([]);
      setProducts([]);
      setCombos([]);
      setOnlineOrders([]);
      setDeliveryCustomers([]);
      setDeliveryCustomerAddresses([]);
      setDeliveryCouriers([]);
      setDeliveryDispatches([]);
      setDeliveryDispatchHistory([]);
      setDeliveryRegions([]);
      setDeliveryPricingSettings({
        tenantId: '',
        ...DEFAULT_DELIVERY_PRICING_SETTINGS,
      });
      setCustomerClassificationConfig(DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG);
      setSettings({ ownerId: '', ...DEFAULT_SHOP_SETTINGS });
      setDigitalMenuSettings({
        tenantId: '',
        ...DEFAULT_DIGITAL_MENU_SETTINGS,
      });
      knownOrderIdsRef.current = new Set();
      ordersInitializedRef.current = false;
      setDataLoading(false);
      ordersRefreshPromiseRef.current?.resolve();
      ordersRefreshPromiseRef.current = null;
      return;
    }

    const isSameTenantResync =
      prevSyncedTenantRef.current === dataContext.tenant.tenantId;
    prevSyncedTenantRef.current = dataContext.tenant.tenantId;

    if (!isSameTenantResync) {
      setSales([]);
      setExpenses([]);
      setProducts([]);
      setCombos([]);
      setOnlineOrders([]);
      setDeliveryCustomers([]);
      setDeliveryCustomerAddresses([]);
      setDeliveryCouriers([]);
      setDeliveryDispatches([]);
      setDeliveryDispatchHistory([]);
      setDeliveryRegions([]);
      setDeliveryPricingSettings({
        tenantId: dataContext.tenant.tenantId,
        ...DEFAULT_DELIVERY_PRICING_SETTINGS,
      });
      setCustomerClassificationConfig(DEFAULT_CUSTOMER_CLASSIFICATION_CONFIG);
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
    }
    setDataError(null);

    const unsub = subscribeAllTenantData(dataContext, {
      onSettings: setSettings,
      onDigitalMenuSettings: setDigitalMenuSettings,
      onProducts: setProducts,
      onCombos: setCombos,
      onSales: setSales,
      onExpenses: setExpenses,
      onOnlineOrders: setOnlineOrders,
      onDeliveryCustomers: setDeliveryCustomers,
      onDeliveryCustomerAddresses: setDeliveryCustomerAddresses,
      onDeliveryCouriers: setDeliveryCouriers,
      onDeliveryDispatches: setDeliveryDispatches,
      onDeliveryDispatchHistory: setDeliveryDispatchHistory,
      onDeliveryRegions: setDeliveryRegions,
      onDeliveryPricingSettings: setDeliveryPricingSettings,
      onCustomerClassificationConfig: setCustomerClassificationConfig,
      onReady: () => {
        setDataLoading(false);
        const pending = ordersRefreshPromiseRef.current;
        if (pending) {
          ordersRefreshPromiseRef.current = null;
          pending.resolve();
        }
      },
      onError: (err) => {
        setDataError(err.message);
        setDataLoading(false);
        const pending = ordersRefreshPromiseRef.current;
        if (pending) {
          ordersRefreshPromiseRef.current = null;
          pending.reject(err);
        }
      },
    });

    return unsub;
  }, [dataContext, ordersSyncTick]);

  function handleRefreshOrders(): Promise<void> {
    if (!dataContext) return Promise.resolve();
    if (ordersRefreshPromiseRef.current) {
      ordersRefreshPromiseRef.current.resolve();
      ordersRefreshPromiseRef.current = null;
    }
    return new Promise<void>((resolve, reject) => {
      ordersRefreshPromiseRef.current = { resolve, reject };
      setOrdersSyncTick((n) => n + 1);
    });
  }

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

  // Sincronizacao silenciosa de assinatura Web Push ja autorizada (sem pedir permissao)
  useEffect(() => {
    if (!dataContext) {
      setPushDiagnostics(null);
      return;
    }
    let cancelled = false;
    let localPaused = false;
    try {
      localPaused = window.localStorage.getItem(PUSH_PREF_KEY) === '0';
    } catch {
      localPaused = false;
    }

    void (async () => {
      if (getBrowserNotificationPermission() === 'granted') {
        const synced = await syncExistingOrderPushSubscription({
          tenantId: dataContext.tenant.tenantId,
          userId: dataContext.user.uid,
          localPausedPreference: localPaused,
        });
        if (!cancelled && synced.synced) {
          setPushEnabled(synced.enabled);
          try {
            window.localStorage.setItem(PUSH_PREF_KEY, synced.enabled ? '1' : '0');
          } catch {
            // Ignora erro de storage
          }
        }
      }
      if (!cancelled) {
        await refreshPushDiagnostics(
          dataContext.tenant.tenantId,
          dataContext.user.uid,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataContext, refreshPushDiagnostics]);

  // Alerta imediato (notificacao mobile, vibracao, banner e som unico por pedido) na chegada de novos pedidos
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

      const unalertedSoundIds = filterUnalertedOrderIds(
        newlyArrived.map((o) => o.id),
      );
      if (soundEnabled && unalertedSoundIds.length > 0) {
        markOrdersSoundAlerted(unalertedSoundIds);
        void playNewOrderAlertChime();
      }

      const perm = getBrowserNotificationPermission();
      setNotificationPermission(perm);
      const pendingLocalNotify = newlyArrived.filter(
        (o) => !swPushedOrderIdsRef.current.has(o.id),
      );
      if (pushEnabled && perm === 'granted' && pendingLocalNotify.length > 0) {
        const payload = buildNewOrderNotificationContent(
          pendingLocalNotify,
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

  async function handlePartnerRegister(name: string, email: string, password: string) {
    setAuthError(null);
    await registerPartnerWithEmailPassword(name, email, password);
  }

  async function handlePartnerLogin(email: string, password: string) {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await loginWithEmailPassword(email, password);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handlePasswordReset(email: string) {
    setAuthError(null);
    await requestPasswordReset(email);
  }

  async function handleUpdatePassword(password: string) {
    setAuthError(null);
    await updateAccountPassword(password);
  }

  async function handleSubscribePix(tenantId: string) {
    if (!activeTenant || activeTenant.tenantId !== tenantId || activeTenant.role !== 'owner') {
      throw new Error('Somente o proprietário do estabelecimento pode contratar.');
    }
    const { data, error } = await getSupabaseClient().functions.invoke('create-mp-pix-payment', { body: { tenantId } });
    if (error) throw new Error(data?.error || 'Não foi possível gerar a cobrança Pix.');
    if (typeof data?.qrCode !== 'string' || typeof data?.qrCodeBase64 !== 'string' || typeof data?.paymentId !== 'string') {
      throw new Error(data?.error || 'O Mercado Pago não retornou os dados do Pix.');
    }
    return data as { paymentId: string; amountCents: number; qrCode: string; qrCodeBase64: string; ticketUrl: string; expiresAt: string | null };
  }

  async function handleSubscribe(tenantId: string) {
    if (!activeTenant || activeTenant.tenantId !== tenantId || activeTenant.role !== 'owner') {
      throw new Error('Somente o proprietário do estabelecimento pode contratar.');
    }
    const { data, error } = await getSupabaseClient().functions.invoke('create-mp-subscription', {
      body: { tenantId },
    });
    if (error) throw new Error(data?.error || 'Não foi possível conectar ao serviço de cobrança. Tente novamente.');
    const checkoutUrl = typeof data?.checkoutUrl === 'string' ? data.checkoutUrl : '';
    let parsed: URL;
    try {
      parsed = new URL(checkoutUrl);
    } catch {
      throw new Error(data?.error || 'O Mercado Pago não retornou um checkout válido.');
    }
    if (
      parsed.protocol !== 'https:' ||
      !['www.mercadopago.com.br', 'mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(parsed.hostname)
    ) {
      throw new Error('O endereço de checkout retornado não é oficial do Mercado Pago.');
    }
    window.location.assign(parsed.toString());
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

  async function handleCreateDeliveryCustomer(
    input: DeliveryCustomerInput,
    initialAddress?: DeliveryCustomerAddressInput | null,
  ): Promise<string> {
    if (!dataContext) return '';
    const id = await createDeliveryCustomer(dataContext, input, initialAddress);
    showToast('Cliente cadastrado com sucesso.');
    return id;
  }

  async function handleUpdateDeliveryCustomer(
    customerId: string,
    input: DeliveryCustomerInput,
  ): Promise<void> {
    if (!dataContext) return;
    await updateDeliveryCustomer(dataContext, customerId, input);
    showToast('Dados do cliente atualizados.');
  }

  async function handleSaveDeliveryCustomerAddress(
    customerId: string,
    input: DeliveryCustomerAddressInput,
    addressId?: string,
    hasExistingAddresses?: boolean,
  ): Promise<void> {
    if (!dataContext) return;
    await saveDeliveryCustomerAddress(
      dataContext,
      customerId,
      input,
      addressId,
      hasExistingAddresses,
    );
    showToast('Endereço salvo.');
  }

  async function handleDeleteDeliveryCustomerAddress(
    customerId: string,
    addressId: string,
    remainingAddresses: DeliveryCustomerAddressRecord[],
  ): Promise<void> {
    if (!dataContext) return;
    await deleteDeliveryCustomerAddress(
      dataContext,
      customerId,
      addressId,
      remainingAddresses,
    );
    showToast('Endereço removido.');
  }

  async function handleSetPrimaryDeliveryCustomerAddress(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    if (!dataContext) return;
    await setPrimaryDeliveryCustomerAddress(dataContext, customerId, addressId);
    showToast('Endereço principal atualizado.');
  }

  async function handleSaveCustomerClassificationConfig(
    config: DeliveryCustomerClassificationConfig,
  ): Promise<void> {
    if (!dataContext) return;
    await saveCustomerClassificationConfig(dataContext, config);
    showToast('Critérios de classificação atualizados.');
  }

  async function handleCreateDeliveryCourier(
    input: DeliveryCourierInput,
  ): Promise<string> {
    if (!dataContext) return '';
    const id = await createDeliveryCourier(dataContext, input);
    showToast('Entregador cadastrado com sucesso.');
    return id;
  }

  async function handleUpdateDeliveryCourier(
    courierId: string,
    input: DeliveryCourierInput,
  ): Promise<void> {
    if (!dataContext) return;
    await updateDeliveryCourier(dataContext, courierId, input);
    showToast('Cadastro do entregador atualizado.');
  }

  async function handleToggleDeliveryCourierStatus(
    courier: DeliveryCourierRecord,
  ): Promise<void> {
    if (!dataContext) return;
    const nextStatus = courier.status === 'active' ? 'inactive' : 'active';
    await updateDeliveryCourierStatus(dataContext, courier.id, nextStatus);
    showToast(
      nextStatus === 'active'
        ? `${courier.name} ativado na equipe.`
        : `${courier.name} desativado.`,
    );
  }

  async function handleToggleDeliveryCourierAvailability(
    courier: DeliveryCourierRecord,
  ): Promise<void> {
    if (!dataContext) return;
    const nextAvailability =
      courier.availabilityStatus === 'available' ? 'unavailable' : 'available';
    await updateDeliveryCourierAvailability(
      dataContext,
      courier.id,
      nextAvailability,
    );
    showToast(
      nextAvailability === 'available'
        ? `${courier.name} marcado como disponível.`
        : `${courier.name} marcado como indisponível.`,
    );
  }

  async function handleDeleteDeliveryCourier(
    courier: DeliveryCourierRecord,
  ): Promise<void> {
    if (!dataContext) return;
    await deleteDeliveryCourier(dataContext, courier.id);
    showToast('Cadastro do entregador removido.');
  }

  async function handleAssignDeliveryCourier(
    orderId: string,
    courierId: string,
    notes: string,
  ): Promise<void> {
    if (!dataContext) return;
    await assignDeliveryCourier(dataContext, orderId, courierId, notes);
    const assignedCourier = deliveryCouriers.find((c) => c.id === courierId);
    const assignedOrder = onlineOrders.find((o) => o.id === orderId);
    vibrateMobileDevice();
    if (
      pushEnabled &&
      getBrowserNotificationPermission() === 'granted' &&
      assignedCourier &&
      assignedOrder
    ) {
      void sendMobileSystemNotification({
        title: `Despacho · ${formatOrderNumber(assignedOrder.orderNumber)}`,
        body: `Entrega enviada para ${assignedCourier.name}. Aguardando aceite.`,
        tag: `mgw-dispatch-${orderId}`,
        orderId,
      });
    }
    showToast(
      assignedCourier
        ? `Entregador ${assignedCourier.name} atribuído! Entrega aguardando aceite.`
        : 'Entregador atribuído! Entrega aguardando aceite.',
    );
  }

  async function handleReassignDeliveryCourier(
    dispatchId: string,
    newCourierId: string,
    reason: string,
  ): Promise<void> {
    if (!dataContext) return;
    await reassignDeliveryCourier(dataContext, dispatchId, newCourierId, reason);
    const nextCourier = deliveryCouriers.find((c) => c.id === newCourierId);
    showToast(
      nextCourier
        ? `Entrega reatribuída para ${nextCourier.name}.`
        : 'Entrega reatribuída para o novo entregador.',
    );
  }

  async function handleCancelDeliveryDispatch(
    dispatchId: string,
    reason: string,
  ): Promise<void> {
    if (!dataContext) return;
    await cancelDeliveryDispatch(dataContext, dispatchId, reason);
    showToast('Envio cancelado e pedido retornado para a fila de despacho.');
  }

  async function handleRespondDeliveryDispatch(
    dispatchId: string,
    decision: 'accept' | 'reject',
    reason: string,
  ): Promise<void> {
    if (!dataContext) return;
    await respondDeliveryDispatch(dataContext, dispatchId, decision, reason);
    showToast(
      decision === 'accept'
        ? 'Aceite do entregador registrado.'
        : 'Recusa registrada; pedido retornou à fila de despacho.',
    );
  }

  async function handleAdvanceDeliveryDispatchStatus(
    dispatchId: string,
    nextStatus: DeliveryDispatchStatus,
  ): Promise<void> {
    if (!dataContext) return;
    await advanceDeliveryDispatchStatus(dataContext, dispatchId, nextStatus);
    showToast(
      `Status da entrega atualizado para "${DISPATCH_STATUS_LABELS[nextStatus]}".`,
    );
  }

  async function handleCreateDeliveryRegion(
    input: DeliveryRegionInput,
  ): Promise<string> {
    if (!dataContext) throw new Error('Sessão não inicializada.');
    const regionId = await createDeliveryRegion(dataContext, input);
    showToast(`Região "${input.name}" cadastrada com sucesso.`);
    return regionId;
  }

  async function handleUpdateDeliveryRegion(
    regionId: string,
    input: DeliveryRegionInput,
  ): Promise<void> {
    if (!dataContext) return;
    await updateDeliveryRegion(dataContext, regionId, input);
    showToast(`Região "${input.name}" atualizada.`);
  }

  async function handleToggleDeliveryRegionStatus(
    region: DeliveryRegionRecord,
    status: DeliveryRegionStatus,
  ): Promise<void> {
    if (!dataContext) return;
    await toggleDeliveryRegionStatus(dataContext, region.id, status);
    showToast(
      status === 'active'
        ? `Região "${region.name}" ativada.`
        : `Região "${region.name}" desativada.`,
    );
  }

  async function handleToggleDeliveryRegionSuspension(
    region: DeliveryRegionRecord,
    suspended: boolean,
    reason?: string,
  ): Promise<void> {
    if (!dataContext) return;
    await toggleDeliveryRegionSuspension(dataContext, region.id, suspended, reason);
    showToast(
      suspended
        ? `Entregas na região "${region.name}" suspensas temporariamente.`
        : `Entregas na região "${region.name}" retomadas.`,
    );
  }

  async function handleDeleteDeliveryRegion(
    region: DeliveryRegionRecord,
  ): Promise<void> {
    if (!dataContext) return;
    await deleteDeliveryRegion(dataContext, region.id);
    showToast(`Região "${region.name}" excluída.`);
  }

  async function handleSaveDeliveryPricingSettings(
    input: DeliveryPricingSettingsInput,
  ): Promise<void> {
    if (!dataContext) return;
    await saveDeliveryPricingSettings(dataContext, input);
    showToast('Regras gerais de entrega salvas com sucesso.');
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
  const initialSearchRoute =
    typeof window !== 'undefined'
      ? resolveInitialRouteFromSearch(window.location.search)
      : 'dashboard';
  const viewOrdersRequested =
    initialSearchRoute === 'orders' || initialSearchRoute === 'delivery_dispatch';

  if (publicRoute.kind === 'landing' && !demoActive && !callbackPending && !viewOrdersRequested) {
    if (!authReady) {
      return (
        <div className="min-h-screen bg-[#F5F6FA] text-[#778094] flex items-center justify-center text-sm">
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
      <div className="min-h-screen bg-[#F5F6FA] text-[#778094] flex items-center justify-center text-sm">
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

  const isPartnerRoute =
    publicRoute.kind === 'partnerLogin' ||
    publicRoute.kind === 'partnerRegister' ||
    publicRoute.kind === 'partnerPortal';

  if (isPartnerRoute && partner && user) {
    return (
      <PartnerDashboardView
        partner={partner}
        onLogout={() => void handleLogout()}
      />
    );
  }

  if (isPartnerRoute) {
    return (
      <PartnerAccessScreen
        mode={publicRoute.kind === 'partnerRegister' ? 'register' : 'login'}
        busy={isSigningIn}
        errorMessage={authError || (user && !partner
          ? 'Esta conta não está cadastrada como parceiro. Use o e-mail de uma conta MGW Parceiros.'
          : null)}
        onLogin={handlePartnerLogin}
        onRegister={handlePartnerRegister}
        onForgotPassword={handlePasswordReset}
        onNavigate={navigatePublicPath}
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
        onSubscribe={handleSubscribe}
        onSubscribePix={handleSubscribePix}
      />
    );
  }

  if (activeTenant.onboardingCompleted === false) {
    return (
      <StoreOnboardingScreen
        accountEmail={user.email}
        initialStoreName={activeTenant.name}
        tenantId={activeTenant.tenantId}
        onComplete={handleCompleteOnboarding}
        onLogout={handleLogout}
        onSubscribe={handleSubscribe}
        onSubscribePix={handleSubscribePix}
      />
    );
  }

  const canViewDashboard = hasTenantPermission(activeTenant.role, 'dashboard:view');
  const canReadSales = hasTenantPermission(activeTenant.role, 'sales:read');
  const canAccessDelivery =
    hasTenantPermission(activeTenant.role, 'delivery:view') && canReadSales;
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

  const visibleRouteIds: AppRoute[] = [];
  if (canViewDashboard) visibleRouteIds.push('dashboard');
  if (canReadSales) visibleRouteIds.push('orders');
  if (canAccessDelivery) {
    visibleRouteIds.push('delivery');
    visibleRouteIds.push('delivery_dispatch');
    visibleRouteIds.push('delivery_customers');
    visibleRouteIds.push('delivery_couriers');
    visibleRouteIds.push('delivery_regions');
  }
  if (canReadSales || canCreateSales) visibleRouteIds.push('sales');
  if (canReadExpenses) visibleRouteIds.push('expenses');
  if (canViewReports) visibleRouteIds.push('reports');
  if (canAccessSettingsRoute) visibleRouteIds.push('settings');

  const effectiveRoute: AppRoute = visibleRouteIds.includes(route)
    ? route
    : visibleRouteIds[0] ?? 'dashboard';

  const topBanners = (
    <>
      {canReadSales &&
        liveOrderBanner &&
        liveOrderBanner.length > 0 &&
        unviewedOrdersCount > 0 &&
        effectiveRoute !== 'orders' && (
          <div
            role="alert"
            data-testid="live-order-alert"
            className="mx-4 lg:mx-8 mt-4 rounded-2xl border border-[#F5B900] bg-[#FFFBEB] px-4 py-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F5B900]/15 border border-[#F5B900]/40 text-[#B38300] flex items-center justify-center shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-[#172033] truncate">
                  {liveOrderBanner.length === 1
                    ? `Novo Pedido ${formatOrderNumber(liveOrderBanner[0].orderNumber)} — ${liveOrderBanner[0].customerName}`
                    : `${liveOrderBanner.length} novos pedidos online recebidos!`}
                </p>
                <p className="text-[11px] sm:text-xs text-[#778094] truncate">
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
                className="min-h-[38px] px-3.5 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Ver Pedido
              </button>
              <button
                type="button"
                onClick={() => setLiveOrderBanner(null)}
                aria-label="Dispensar alerta de novo pedido"
                className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      {toast && (
        <div
          role="status"
          className={`mx-4 lg:mx-8 mt-4 px-4 py-3 rounded-xl text-xs font-medium border ${
            toast.type === 'ok'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#16A36A]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#E35D62]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {dataError && (
        <div
          role="alert"
          className="mx-4 lg:mx-8 mt-4 px-4 py-3 rounded-xl text-xs bg-[#FEF2F2] border border-[#FECACA] text-[#E35D62]"
        >
          Erro ao sincronizar dados: {dataError}
        </div>
      )}
    </>
  );

  const overlays = (
    <>
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
    </>
  );

  return (
    <AppShell
      effectiveRoute={effectiveRoute}
      activeSettingsTab={settingsInitialTab}
      onNavigate={(nextRoute, nextSettingsTab) => {
        if (nextSettingsTab) {
          setSettingsInitialTab(nextSettingsTab);
        } else if (nextRoute === 'settings') {
          setSettingsInitialTab(canWriteSettings ? 'shop' : 'catalog');
        }
        setRoute(nextRoute);
      }}
      canViewDashboard={canViewDashboard}
      canAccessDelivery={canAccessDelivery}
      canReadSales={canReadSales}
      canCreateSales={canCreateSales}
      canReadExpenses={canReadExpenses}
      canCreateExpenses={canCreateExpenses}
      canViewReports={canViewReports}
      canAccessSettingsRoute={canAccessSettingsRoute}
      canWriteSettings={canWriteSettings}
      canWriteCatalog={canWriteCatalog}
      unviewedOrdersCount={unviewedOrdersCount}
      activeTenant={activeTenant}
      tenants={tenants}
      establishmentName={
        digitalMenuSettings.storeName || settings.establishmentName || activeTenant.name
      }
      userEmail={user.email}
      onSelectTenant={handleSelectTenant}
      onLogout={handleLogout}
      onOpenNewSale={() => {
        setEditingSale(null);
        setSaleModalOpen(true);
      }}
      onOpenNewExpense={() => {
        setEditingExpense(null);
        setExpenseModalOpen(true);
      }}
      onOpenOrdersNotifications={() => {
        setLiveOrderBanner(null);
        setRoute('orders');
      }}
      topBannerSlot={topBanners}
      overlaysSlot={overlays}
    >
      {dataLoading &&
      effectiveRoute !== 'dashboard' &&
      effectiveRoute !== 'orders' &&
      effectiveRoute !== 'delivery' &&
      effectiveRoute !== 'delivery_dispatch' &&
      effectiveRoute !== 'delivery_customers' &&
      effectiveRoute !== 'delivery_couriers' &&
      effectiveRoute !== 'delivery_regions' &&
      effectiveRoute !== 'sales' &&
      effectiveRoute !== 'expenses' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="mgw-skeleton h-32" />
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
              userEmail={user.email}
              isLoading={dataLoading}
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
              pushDiagnostics={pushDiagnostics}
              pushDiagnosticsLoading={pushDiagnosticsLoading}
              isLoading={dataLoading}
              errorMessage={dataError}
              onRefreshOrders={handleRefreshOrders}
              onRefreshPushDiagnostics={() => void refreshPushDiagnostics()}
              onRemovePushDevice={(id) => void handleRemovePushDevice(id)}
              onOpenNewOrder={
                canCreateSales
                  ? () => {
                      setEditingSale(null);
                      setSaleModalOpen(true);
                    }
                  : undefined
              }
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

          {effectiveRoute === 'delivery' && canAccessDelivery && (
            <DeliveryDashboardView
              establishmentName={
                digitalMenuSettings.storeName ||
                settings.establishmentName ||
                activeTenant.name
              }
              orders={onlineOrders}
              customers={deliveryCustomers}
              couriers={deliveryCouriers}
              dispatches={deliveryDispatches}
              regions={deliveryRegions}
              digitalMenuSettings={digitalMenuSettings}
              isLoading={dataLoading}
              errorMessage={dataError}
              canOpenOrders={canReadSales}
              canManageDigitalMenu={canWriteSettings}
              onRefreshOrders={handleRefreshOrders}
              onOpenOrders={() => {
                if (canReadSales) setRoute('orders');
              }}
              onOpenCustomers={() => setRoute('delivery_customers')}
              onOpenCouriers={() => setRoute('delivery_couriers')}
              onOpenDispatch={() => setRoute('delivery_dispatch')}
              onOpenRegions={() => setRoute('delivery_regions')}
              onOpenDigitalMenuSettings={() => {
                if (!canWriteSettings) return;
                setSettingsInitialTab('digital_menu');
                setRoute('settings');
              }}
            />
          )}

          {effectiveRoute === 'delivery_dispatch' && canAccessDelivery && (
            <DeliveryDispatchView
              establishmentName={
                digitalMenuSettings.storeName ||
                settings.establishmentName ||
                activeTenant.name
              }
              orders={onlineOrders}
              couriers={deliveryCouriers}
              dispatches={deliveryDispatches}
              dispatchHistory={deliveryDispatchHistory}
              digitalMenuSettings={digitalMenuSettings}
              operatorEmail={user.email}
              isLoading={dataLoading}
              errorMessage={dataError}
              canOpenOrders={canReadSales}
              onRefresh={handleRefreshOrders}
              onOpenOrders={() => {
                if (canReadSales) setRoute('orders');
              }}
              onOpenCouriers={() => setRoute('delivery_couriers')}
              onAssignCourier={handleAssignDeliveryCourier}
              onReassignCourier={handleReassignDeliveryCourier}
              onCancelDispatch={handleCancelDeliveryDispatch}
              onRespondDispatch={handleRespondDeliveryDispatch}
              onAdvanceDispatchStatus={handleAdvanceDeliveryDispatchStatus}
            />
          )}

          {effectiveRoute === 'delivery_customers' && canAccessDelivery && (
            <DeliveryCustomersView
              establishmentName={
                digitalMenuSettings.storeName ||
                settings.establishmentName ||
                activeTenant.name
              }
              customers={deliveryCustomers}
              addresses={deliveryCustomerAddresses}
              orders={onlineOrders}
              classificationConfig={customerClassificationConfig}
              digitalMenuSettings={digitalMenuSettings}
              isLoading={dataLoading}
              errorMessage={dataError}
              onRefresh={handleRefreshOrders}
              onCreateCustomer={handleCreateDeliveryCustomer}
              onUpdateCustomer={handleUpdateDeliveryCustomer}
              onSaveAddress={handleSaveDeliveryCustomerAddress}
              onDeleteAddress={handleDeleteDeliveryCustomerAddress}
              onSetPrimaryAddress={handleSetPrimaryDeliveryCustomerAddress}
              onSaveClassificationConfig={handleSaveCustomerClassificationConfig}
              onMarkOrderViewed={handleMarkOnlineOrderViewed}
              onTransitionOrderStatus={handleTransitionOnlineOrderStatus}
            />
          )}

          {effectiveRoute === 'delivery_couriers' && canAccessDelivery && (
            <DeliveryCouriersView
              establishmentName={
                digitalMenuSettings.storeName ||
                settings.establishmentName ||
                activeTenant.name
              }
              couriers={deliveryCouriers}
              dispatches={deliveryDispatches}
              isLoading={dataLoading}
              errorMessage={dataError}
              onRefresh={handleRefreshOrders}
              onCreateCourier={handleCreateDeliveryCourier}
              onUpdateCourier={handleUpdateDeliveryCourier}
              onToggleCourierStatus={handleToggleDeliveryCourierStatus}
              onToggleCourierAvailability={handleToggleDeliveryCourierAvailability}
              onDeleteCourier={handleDeleteDeliveryCourier}
            />
          )}

          {effectiveRoute === 'delivery_regions' && canAccessDelivery && (
            <DeliveryRegionsView
              establishmentName={
                digitalMenuSettings.storeName ||
                settings.establishmentName ||
                activeTenant.name
              }
              regions={deliveryRegions}
              pricingSettings={deliveryPricingSettings}
              orders={onlineOrders}
              digitalMenuSettings={digitalMenuSettings}
              isLoading={dataLoading}
              errorMessage={dataError}
              onRefresh={handleRefreshOrders}
              onCreateRegion={handleCreateDeliveryRegion}
              onUpdateRegion={handleUpdateDeliveryRegion}
              onToggleRegionStatus={handleToggleDeliveryRegionStatus}
              onToggleRegionSuspension={handleToggleDeliveryRegionSuspension}
              onDeleteRegion={handleDeleteDeliveryRegion}
              onSavePricingSettings={handleSaveDeliveryPricingSettings}
            />
          )}

          {effectiveRoute === 'sales' && (canReadSales || canCreateSales) && (
            <SalesView
              sales={sales}
              canCreateSales={canCreateSales}
              canEditSales={canEditSales}
              canDeleteSales={canDeleteSales}
              isLoading={dataLoading}
              errorMessage={dataError}
              onRetry={() => void handleRefreshOrders()}
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
              isLoading={dataLoading}
              errorMessage={dataError}
              onRetry={() => void handleRefreshOrders()}
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
              tenant={activeTenant}
              onSubscribe={handleSubscribe}
              onSubscribePix={handleSubscribePix}
              settings={settings}
              products={products}
              combos={combos}
              digitalMenuSettings={digitalMenuSettings}
              initialTab={settingsInitialTab}
              hideNavigationTabs
              onTabChange={setSettingsInitialTab}
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
              onOpenDeliveryRegions={
                canAccessDelivery ? () => setRoute('delivery_regions') : undefined
              }
            />
          )}
        </>
      )}
    </AppShell>
  );
}
