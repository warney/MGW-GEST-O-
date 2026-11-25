import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Laptop,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  DigitalMenuSettings,
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import { formatCurrencyBRL, getLocalTodayDate } from '../utils/finance';
import {
  buildWhatsappUrl,
  formatOrderNumber,
  formatTimeBR,
  getNextStatusActions,
  isUnreadNewOrder,
} from '../utils/onlineOrders';
import {
  fromOnlineOrderRecord,
  type PrintableOrderSource,
} from '../utils/orderPrint';
import type { BrowserNotificationPermissionState } from '../utils/orderNotifications';
import type { OrderPushDiagnosticsSnapshot } from '../services/orderPushNotifications';
import {
  computeOrdersCenterSummary,
  filterAndSearchOrders,
  formatOrdersDeltaBR,
  getOrderStatusBadgeSpec,
  type OrdersCenterFilterTab,
  paginateOrders,
  PRIMARY_ORDER_FILTER_TABS,
  SECONDARY_ORDER_FILTER_TABS,
  summarizeOrderItems,
} from '../utils/ordersCenter';
import { OrderDetailsModal, OrderStatusIcon } from './OrderDetailsModal';
import { OrderPrintModal } from './OrderPrintModal';
import { PWAInstallButton } from './PWAInstallButton';
import { DeliveryDispatchAssignModal } from './DeliveryDispatchAssignModal';
import type { DeliveryCourierRecord, DeliveryDispatchRecord } from '../types/finance';

interface OrdersCenterViewProps {
  orders: OnlineOrderRecord[];
  couriers: DeliveryCourierRecord[];
  dispatches: DeliveryDispatchRecord[];
  operatorEmail?: string;
  onAssignCourier: (orderId: string, courierId: string, notes: string) => Promise<void>;
  onOpenCouriers?: () => void;
  digitalMenuSettings: DigitalMenuSettings;
  soundEnabled: boolean;
  pushEnabled: boolean;
  notificationPermission: BrowserNotificationPermissionState;
  pushDiagnostics?: OrderPushDiagnosticsSnapshot | null;
  pushDiagnosticsLoading?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefreshOrders?: () => Promise<void> | void;
  onRefreshPushDiagnostics?: () => void;
  onRemovePushDevice?: (subscriptionId: string) => void;
  onOpenNewOrder?: () => void;
  onToggleSound: () => void;
  onTogglePush: () => void;
  onEnableMobileNotifications: () => void;
  onTestAlert: () => void;
  onMarkViewed: (order: OnlineOrderRecord) => Promise<void>;
  onTransitionStatus: (
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
    reason?: string,
  ) => Promise<void>;
  onOpenDigitalMenuSettings: () => void;
}

const ORDERS_PAGE_SIZE = 15;

const QUICK_REASONS = [
  'Produto indisponível no momento',
  'Fora da área de entrega',
  'Cozinha sobrecarregada / encerrando expediente',
  'Cancelado a pedido do cliente',
];

function OrdersCenterSkeleton() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Carregando Central de Pedidos"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-7 w-52 rounded-lg" />
          <div className="mgw-skeleton h-4 w-64 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-28 rounded-xl" />
          <div className="mgw-skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((idx) => (
          <div key={idx} className="mgw-skeleton h-[132px] rounded-2xl" />
        ))}
      </div>

      <div className="mgw-skeleton h-12 w-full rounded-xl" />
      <div className="mgw-skeleton h-[340px] w-full rounded-2xl" />
    </div>
  );
}

export function OrdersCenterView({
  orders,
  couriers,
  dispatches,
  operatorEmail,
  onAssignCourier,
  onOpenCouriers,
  digitalMenuSettings,
  soundEnabled,
  pushEnabled,
  notificationPermission,
  pushDiagnostics = null,
  pushDiagnosticsLoading = false,
  isLoading = false,
  errorMessage = null,
  onRefreshOrders,
  onRefreshPushDiagnostics,
  onRemovePushDevice,
  onOpenNewOrder,
  onToggleSound,
  onTogglePush,
  onEnableMobileNotifications,
  onTestAlert,
  onMarkViewed,
  onTransitionStatus,
  onOpenDigitalMenuSettings,
}: OrdersCenterViewProps) {
  const [filterTab, setFilterTab] = useState<OrdersCenterFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStatusText, setRefreshStatusText] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPushDiagnostics, setShowPushDiagnostics] = useState(false);
  const [reasonModal, setReasonModal] = useState<{
    order: OnlineOrderRecord;
    nextStatus: 'rejected' | 'cancelled';
    title: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [printingOrder, setPrintingOrder] =
    useState<PrintableOrderSource | null>(null);

  const actionMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const today = getLocalTodayDate();

  const summary = useMemo(
    () => computeOrdersCenterSummary(orders, today),
    [orders, today],
  );

  const filteredOrders = useMemo(
    () => filterAndSearchOrders(orders, filterTab, searchQuery),
    [orders, filterTab, searchQuery],
  );

  const pagination = useMemo(
    () => paginateOrders(filteredOrders, page, ORDERS_PAGE_SIZE),
    [filteredOrders, page],
  );

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  // Reset to page 1 when filter or search query changes
  useEffect(() => {
    setPage(1);
  }, [filterTab, searchQuery]);

  // Close row dropdown menu on outside click or Escape
  useEffect(() => {
    if (!openMenuOrderId) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        actionMenuContainerRef.current &&
        !actionMenuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuOrderId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuOrderId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuOrderId]);

  useEffect(() => {
    if (!reasonModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setReasonModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reasonModal]);

  useEffect(() => {
    if (!refreshStatusText) return;
    const timer = window.setTimeout(() => setRefreshStatusText(null), 2600);
    return () => window.clearTimeout(timer);
  }, [refreshStatusText]);

  async function handleRefreshClick() {
    if (!onRefreshOrders || isRefreshing) return;
    setIsRefreshing(true);
    setActionError(null);
    setRefreshStatusText(null);
    try {
      await onRefreshOrders();
      setRefreshStatusText('Atualizado');
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar os pedidos.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function runDirectTransition(
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
  ) {
    if (busyOrderId) return;
    if (nextStatus === 'out_for_delivery' && order.fulfillmentType === 'delivery') {
      setAssigningOrderId(order.id);
      setSelectedOrderId(null);
      return;
    }
    setActionError(null);
    setOpenMenuOrderId(null);
    setBusyOrderId(order.id);
    try {
      await onTransitionStatus(order, nextStatus, '');
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar o status do pedido.',
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleConfirmReasonSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonModal || busyOrderId) return;

    const cleanReason = reasonText.trim();
    if (cleanReason.length < 3) {
      setReasonError('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }

    setReasonError(null);
    setActionError(null);
    setBusyOrderId(reasonModal.order.id);
    try {
      await onTransitionStatus(
        reasonModal.order,
        reasonModal.nextStatus,
        cleanReason,
      );
      setReasonModal(null);
      setReasonText('');
    } catch (err) {
      setReasonError(
        err instanceof Error ? err.message : 'Erro ao atualizar pedido.',
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleMarkAsViewed(order: OnlineOrderRecord) {
    if (busyOrderId) return;
    setActionError(null);
    setOpenMenuOrderId(null);
    setBusyOrderId(order.id);
    try {
      await onMarkViewed(order);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível confirmar a visualização.',
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  function openPrintModalForOrder(order: OnlineOrderRecord) {
    setOpenMenuOrderId(null);
    setPrintingOrder(
      fromOnlineOrderRecord(order, {
        storeName: digitalMenuSettings.storeName,
        storePhone: digitalMenuSettings.phoneWhatsapp,
        storeAddress: digitalMenuSettings.address,
      }),
    );
  }

  function openReasonModalForOrder(
    order: OnlineOrderRecord,
    nextStatus: 'rejected' | 'cancelled',
    actionLabel: string,
  ) {
    setOpenMenuOrderId(null);
    setReasonText('');
    setReasonError(null);
    setReasonModal({
      order,
      nextStatus,
      title: `${actionLabel} · ${formatOrderNumber(order.orderNumber)}`,
    });
  }

  if (isLoading) {
    return <OrdersCenterSkeleton />;
  }

  const menuStatusLabel = !digitalMenuSettings.isActive
    ? 'Desativado'
    : digitalMenuSettings.isOpen
      ? 'Aberto'
      : 'Fechado';

  const menuStatusColor = !digitalMenuSettings.isActive
    ? 'text-[#778094]'
    : digitalMenuSettings.isOpen
      ? 'text-[#16A36A]'
      : 'text-[#B45309]';

  const hasFiltersActive = filterTab !== 'all' || searchQuery.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Error State Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#B91C1C] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Não foi possível sincronizar os pedidos: {errorMessage}
            </span>
          </div>
          {onRefreshOrders && (
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={isRefreshing}
              className="min-h-[34px] px-3 rounded-lg bg-white border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer shrink-0"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Unviewed New Order Alert Banner */}
      {summary.unviewedCount > 0 && (
        <div
          role="status"
          className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_2px_8px_rgba(23,32,51,0.04)]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#172033]">
                {summary.unviewedCount === 1
                  ? 'Novo pedido recebido aguardando visualização!'
                  : `${summary.unviewedCount} novos pedidos recebidos aguardando confirmação!`}
              </p>
              <p className="text-xs text-[#778094] mt-0.5">
                Revise os itens e clique em ACEITAR PEDIDO ou RECUSAR PEDIDO.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFilterTab('received')}
            className="mgw-btn-primary shrink-0 whitespace-nowrap"
          >
            Ver novos pedidos
          </button>
        </div>
      )}

      {/* 1. Cabeçalho da Página */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
            Central de Pedidos
          </h2>
          <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
            Gerencie os pedidos em{' '}
            <span className="font-semibold text-[#172033]">tempo real</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onRefreshOrders && (
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={isRefreshing}
              className="mgw-btn-secondary whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#172033] ${
                  isRefreshing ? 'animate-spin' : ''
                }`}
                aria-hidden="true"
              />
              <span>
                {isRefreshing
                  ? 'Atualizando...'
                  : refreshStatusText || 'Atualizar'}
              </span>
            </button>
          )}

          {onOpenNewOrder && (
            <button
              type="button"
              onClick={onOpenNewOrder}
              className="mgw-btn-primary whitespace-nowrap shrink-0"
            >
              <span>Novo Pedido</span>
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      {/* Barra Operacional do Cardápio & Alertas */}
      <section
        aria-label="Controles operacionais de pedidos"
        className="bg-white border border-[#E8EAF0] rounded-2xl px-4 py-3 shadow-[0_2px_8px_rgba(23,32,51,0.03)] space-y-2.5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#778094] min-w-0">
            <span className="font-medium text-[#172033]">Cardápio Digital</span>
            <span aria-hidden="true">·</span>
            <span className={`font-semibold ${menuStatusColor}`}>
              {menuStatusLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#778094] truncate max-w-[260px]">
              /cardapio/{digitalMenuSettings.slug}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {notificationPermission === 'granted' ? (
              <>
                <button
                  type="button"
                  onClick={onTogglePush}
                  aria-pressed={pushEnabled}
                  className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    pushEnabled
                      ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]'
                      : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                  }`}
                >
                  {pushEnabled ? (
                    <>
                      <BellRing className="w-3.5 h-3.5 shrink-0" />
                      <span>Notificações Push ativas</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-3.5 h-3.5 shrink-0" />
                      <span>Notificações pausadas</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onTestAlert}
                  className="min-h-[36px] px-3 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Bell className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                  <span>Testar Push</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onEnableMobileNotifications}
                className="min-h-[36px] px-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] hover:bg-[#FEF3C7] text-[#B45309] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" />
                <span>Ativar notificações</span>
              </button>
            )}

            <PWAInstallButton showManualFallback />

            <button
              type="button"
              onClick={onToggleSound}
              aria-pressed={soundEnabled}
              className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                soundEnabled
                  ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]'
                  : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Alerta sonoro ligado</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 shrink-0" />
                  <span>Som silenciado</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                const nextOpen = !showPushDiagnostics;
                setShowPushDiagnostics(nextOpen);
                if (nextOpen) onRefreshPushDiagnostics?.();
              }}
              aria-expanded={showPushDiagnostics}
              className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                showPushDiagnostics
                  ? 'bg-[#F5F6FA] border-[#CBD5E1] text-[#172033]'
                  : 'bg-white border-[#E8EAF0] hover:border-[#D5D9E4] text-[#4B5563] hover:text-[#172033]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
              <span>
                Dispositivos
                {pushDiagnostics ? ` (${pushDiagnostics.devices.length})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenDigitalMenuSettings}
              className="min-h-[36px] px-3 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Settings className="w-3.5 h-3.5 text-[#778094] shrink-0" />
              <span>Configurar cardápio</span>
            </button>
          </div>
        </div>

        {notificationPermission === 'denied' && (
          <p className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3.5 py-2">
            As notificações estão bloqueadas nas permissões do navegador. Toque no ícone de cadeado (ou ajustes do site) ao lado do endereço para permitir notificações e receber pedidos em segundo plano.
          </p>
        )}

        {pushDiagnostics?.needsIOSHomeScreenInstall && (
          <p className="text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3.5 py-2">
            No iPhone/iPad, o Web Push só funciona quando o MGW Gestão está instalado na Tela de Início (iOS 16.4+). Toque em <strong>Compartilhar</strong> no Safari e escolha <strong>Adicionar à Tela de Início</strong>.
          </p>
        )}

        {pushDiagnostics?.backend &&
          pushDiagnostics.backend.available &&
          (!pushDiagnostics.backend.hasWebhookSecret ||
            !pushDiagnostics.backend.hasVapidPublicKey ||
            !pushDiagnostics.backend.hasVapidPrivateKey ||
            pushDiagnostics.backend.vapidKeyMatchesFrontend === false) && (
            <div className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3.5 py-2.5 space-y-1">
              <p className="font-bold">
                Configuração pendente no servidor Supabase para Web Push em segundo plano:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {!pushDiagnostics.backend.hasWebhookSecret && (
                  <li>Secret PUSH_WEBHOOK_SECRET ausente na Edge Function send-order-push.</li>
                )}
                {(!pushDiagnostics.backend.hasVapidPublicKey ||
                  !pushDiagnostics.backend.hasVapidPrivateKey) && (
                  <li>Chaves VAPID_PUBLIC_KEY e/ou VAPID_PRIVATE_KEY não configuradas no Supabase.</li>
                )}
                {pushDiagnostics.backend.vapidKeyMatchesFrontend === false && (
                  <li>VAPID_PUBLIC_KEY do servidor não coincide com a chave pública do frontend.</li>
                )}
              </ul>
            </div>
          )}

        {showPushDiagnostics && (
          <div
            data-testid="push-diagnostics-panel"
            className="mt-2 pt-3 border-t border-[#E8EAF0] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-[#172033]">
                  Status das notificações e dispositivos inscritos
                </h3>
                <p className="text-[11px] text-[#778094]">
                  Com o painel aberto toca o alerta sonoro do MGW; em segundo plano ou fechado o alerta usa Web Push e o som padrão do dispositivo.
                </p>
              </div>
              {onRefreshPushDiagnostics && (
                <button
                  type="button"
                  onClick={onRefreshPushDiagnostics}
                  disabled={pushDiagnosticsLoading}
                  className="min-h-[32px] px-2.5 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-[11px] font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${pushDiagnosticsLoading ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Verificar agora</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E8EAF0] p-2.5">
                <p className="text-[11px] text-[#778094]">Permissão do navegador</p>
                <p className="font-bold text-[#172033] mt-0.5">
                  {notificationPermission === 'granted'
                    ? 'Autorizada'
                    : notificationPermission === 'denied'
                      ? 'Bloqueada'
                      : notificationPermission === 'unsupported'
                        ? 'Não suportada'
                        : 'Aguardando ativação'}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFC] border border-[#E8EAF0] p-2.5">
                <p className="text-[11px] text-[#778094]">Service Worker</p>
                <p className="font-bold text-[#172033] mt-0.5">
                  {pushDiagnostics?.serviceWorkerStatus === 'active'
                    ? 'Ativo'
                    : pushDiagnostics?.serviceWorkerStatus === 'installing'
                      ? 'Instalando...'
                      : pushDiagnostics?.serviceWorkerStatus === 'unsupported'
                        ? 'Indisponível'
                        : 'Inativo'}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFC] border border-[#E8EAF0] p-2.5">
                <p className="text-[11px] text-[#778094]">Este dispositivo</p>
                <p className="font-bold text-[#172033] mt-0.5">
                  {pushDiagnostics?.hasBrowserSubscription
                    ? pushEnabled
                      ? 'Inscrito e ativo'
                      : 'Inscrito (pausado)'
                    : 'Não inscrito ainda'}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFC] border border-[#E8EAF0] p-2.5">
                <p className="text-[11px] text-[#778094]">Servidor Push</p>
                <p className="font-bold text-[#172033] mt-0.5">
                  {pushDiagnostics?.backend
                    ? pushDiagnostics.backend.available
                      ? pushDiagnostics.backend.hasVapidPublicKey &&
                        pushDiagnostics.backend.hasVapidPrivateKey &&
                        pushDiagnostics.backend.hasWebhookSecret &&
                        pushDiagnostics.backend.vapidKeyMatchesFrontend !== false
                        ? 'Configurado'
                        : 'Ajuste necessário'
                      : 'Atualize a Edge Function'
                    : 'Verificando...'}
                </p>
              </div>
            </div>

            {pushDiagnostics && pushDiagnostics.devices.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-[#172033]">
                  Dispositivos cadastrados neste estabelecimento
                </p>
                <div className="divide-y divide-[#E8EAF0] rounded-xl border border-[#E8EAF0] bg-white overflow-hidden">
                  {pushDiagnostics.devices.map((device) => (
                    <div
                      key={device.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {device.deviceLabel.includes('Android') ||
                        device.deviceLabel.includes('iPhone') ||
                        device.deviceLabel.includes('iPad') ? (
                          <Smartphone className="w-4 h-4 text-[#778094] shrink-0" />
                        ) : (
                          <Laptop className="w-4 h-4 text-[#778094] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-[#172033] truncate">
                            {device.deviceLabel}
                            {device.isCurrentDevice ? ' (Este dispositivo)' : ''}
                          </p>
                          <p className="text-[11px] text-[#778094] truncate">
                            {device.memberEmail ? `${device.memberEmail} · ` : ''}
                            {device.isEnabled ? 'Recebendo alertas' : 'Pausado'}
                          </p>
                        </div>
                      </div>

                      {device.isCurrentUser && onRemovePushDevice && (
                        <button
                          type="button"
                          onClick={() => onRemovePushDevice(device.id)}
                          aria-label={`Remover ${device.deviceLabel}`}
                          className="p-1.5 rounded-lg text-[#778094] hover:text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pushDiagnostics && pushDiagnostics.recentLogs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-[#172033]">
                  Últimos registros de envio do servidor
                </p>
                <div className="rounded-xl border border-[#E8EAF0] bg-[#F8FAFC] px-3 py-2 space-y-1 text-[11px] text-[#4B5563]">
                  {pushDiagnostics.recentLogs.slice(0, 3).map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="font-medium text-[#172033]">
                        {log.eventType === 'manual_test' ? 'Teste manual' : 'Novo pedido'} ·{' '}
                        <span
                          className={
                            log.status === 'sent'
                              ? 'text-[#15803D]'
                              : log.status === 'no_subscriptions'
                                ? 'text-[#B45309]'
                                : 'text-[#DC2626]'
                          }
                        >
                          {log.status}
                        </span>
                      </span>
                      <span className="text-[#778094]">
                        Enviados: {log.sentCount}
                        {log.errorMessage ? ` · ${log.errorMessage}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. Cartões de Indicadores */}
      <section
        aria-label="Indicadores da Central de Pedidos"
        className="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4"
      >
        {/* Card 1 — Pedidos Hoje */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#3478E5] flex items-center justify-center shrink-0">
              <ShoppingCart className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Hoje
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Pedidos Hoje
            </p>
            <p
              data-testid="orders-kpi-today"
              className="text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.receivedTodayCount}
            </p>
            {summary.todayDeltaPct !== null ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] sm:text-xs truncate">
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold font-mono tabular-nums ${
                    summary.todayDeltaPct >= 0
                      ? 'text-[#16A36A]'
                      : 'text-[#E35D62]'
                  }`}
                >
                  {summary.todayDeltaPct >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {formatOrdersDeltaBR(summary.todayDeltaPct)}
                </span>
                <span className="text-[#778094]">vs ontem</span>
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
                Sem base de ontem
              </p>
            )}
          </div>
        </article>

        {/* Card 2 — Em Preparo */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#D97706] flex items-center justify-center shrink-0">
              <UtensilsCrossed
                className="w-[18px] h-[18px]"
                aria-hidden="true"
              />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Produção
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Em Preparo
            </p>
            <p
              data-testid="orders-kpi-preparing"
              className="text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.preparingCount}
            </p>
            <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
              {summary.pendingBeforePrepCount > 0
                ? `+ ${summary.pendingBeforePrepCount} aguardando início`
                : 'Na cozinha agora'}
            </p>
          </div>
        </article>

        {/* Card 3 — Prontos */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]/70 text-[#16A36A] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Saída
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Prontos
            </p>
            <p
              data-testid="orders-kpi-ready"
              className="text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.readyCount}
            </p>
            <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
              {summary.dispatchCount > 0
                ? `+ ${summary.dispatchCount} em entrega/retirada`
                : 'Prontos para saída'}
            </p>
          </div>
        </article>

        {/* Card 4 — Entregues */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#3478E5] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Concluídos
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregues
            </p>
            <p
              data-testid="orders-kpi-completed"
              className="text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.completedCount}
            </p>
            <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
              {summary.completedTodayCount > 0
                ? `${summary.completedTodayCount} concluído(s) hoje`
                : 'Total concluído'}
            </p>
          </div>
        </article>
      </section>

      {/* Fluxo operacional visual — os contadores acompanham os status reais */}
      <section aria-label="Fluxo dos pedidos" className="bg-white border border-[#E8EAF0] rounded-2xl p-3 sm:p-4 shadow-[0_2px_8px_rgba(23,32,51,0.03)]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: 'all' as const, label: 'Todos', count: summary.totalCount, tone: 'border-[#F5B900] bg-[#FFFBEB] text-[#9A6B00]' },
            { id: 'preparing' as const, label: 'Em preparo', count: summary.preparingCount, tone: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]' },
            { id: 'ready' as const, label: 'Prontos', count: summary.readyCount, tone: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#15803D]' },
            { id: 'dispatch' as const, label: 'Saiu para entrega', count: summary.dispatchCount, tone: 'border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]' },
            { id: 'completed' as const, label: 'Entregues', count: summary.completedCount, tone: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#15803D]' },
          ].map((step) => (
            <button key={step.id} type="button" onClick={() => setFilterTab(step.id)} aria-pressed={filterTab === step.id}
              className={`min-h-[76px] rounded-xl border px-3 py-2 text-left transition-all ${step.tone} ${filterTab === step.id ? 'ring-2 ring-[#F5B900] ring-offset-1' : 'hover:shadow-sm'}`}>
              <span className="block text-[11px] font-semibold opacity-80">{step.label}</span>
              <span className="block text-2xl font-extrabold font-mono tabular-nums">{step.count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Barra de Filtros por Status & Busca */}
      <section
        aria-label="Filtros e busca de pedidos"
        className="space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Primary Segmented Tabs matching visual reference */}
          <div
            role="tablist"
            aria-label="Filtrar pedidos por etapa principal"
            className="inline-flex items-center gap-1 p-1 bg-white border border-[#E8EAF0] rounded-xl shadow-[0_1px_2px_rgba(23,32,51,0.03)] overflow-x-auto max-w-full"
          >
            {PRIMARY_ORDER_FILTER_TABS.map((tab) => {
              const isActive = filterTab === tab.id;
              const count = summary.countsByTab[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilterTab(tab.id)}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#F5B900] text-[#172033] font-bold shadow-[0_1px_2px_rgba(23,32,51,0.08)]'
                      : 'text-[#4B5563] hover:text-[#172033] hover:bg-[#F7F8FC] font-semibold'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="font-mono tabular-nums opacity-85">
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search input */}
          <div className="relative w-full lg:w-72 shrink-0">
            <Search
              className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar pedidos"
              placeholder="Buscar #pedido, cliente ou item..."
              className="mgw-input !pl-9 !pr-8 !min-h-[40px] !text-xs sm:!text-[13px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Preserved Additional Operational Status Filters */}
        <div
          role="tablist"
          aria-label="Etapas operacionais adicionais"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="text-[11px] font-semibold text-[#778094] mr-1">
            Mais etapas:
          </span>
          {SECONDARY_ORDER_FILTER_TABS.map((tab) => {
            const isActive = filterTab === tab.id;
            const count = summary.countsByTab[tab.id];
            const highlightNew = tab.id === 'received' && count > 0 && !isActive;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilterTab(tab.id)}
                className={`min-h-[32px] px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#172033] border-[#172033] text-white'
                    : highlightNew
                      ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309] hover:bg-[#FEF3C7]'
                      : 'bg-white border-[#E8EAF0] text-[#4B5563] hover:border-[#D5D9E4] hover:text-[#172033]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono tabular-nums opacity-85">
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {actionError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-center justify-between gap-2"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dispensar erro"
            className="text-[#B91C1C] hover:text-[#7F1D1D] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Tabela de Pedidos / Estado Vazio */}
      {filteredOrders.length === 0 ? (
        <section className="bg-white border border-[#E8EAF0] rounded-2xl p-8 sm:p-12 text-center shadow-[0_2px_8px_rgba(23,32,51,0.04)] space-y-2.5">
          <div className="w-12 h-12 rounded-full bg-[#F7F8FC] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
            <ShoppingCart className="w-5 h-5" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-[#172033]">
            {orders.length === 0
              ? 'Nenhum pedido encontrado.'
              : 'Nenhum pedido corresponde ao filtro selecionado.'}
          </p>
          <p className="text-xs text-[#778094] max-w-md mx-auto">
            {orders.length === 0
              ? 'Quando um cliente enviar um pedido pelo Cardápio Digital, ele aparecerá aqui em tempo real.'
              : 'Altere o status ou limpe o campo de busca para visualizar os demais pedidos.'}
          </p>
          {hasFiltersActive && orders.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setFilterTab('all');
                  setSearchQuery('');
                }}
                className="mgw-btn-secondary"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Desktop & Tablet Table */}
          <div className="hidden md:block bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
            <div className="overflow-x-auto rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F8FC] border-b border-[#E8EAF0] text-[12px] font-semibold text-[#778094]">
                    <th className="py-3.5 px-4 whitespace-nowrap"># Pedido</th>
                    <th className="py-3.5 px-4">Cliente</th>
                    <th className="py-3.5 px-4">Itens</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Valor</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EAF0]">
                  {pagination.items.map((order, rowIdx) => {
                    const unread = isUnreadNewOrder(order);
                    const badgeSpec = getOrderStatusBadgeSpec(order.status);
                    const itemsSummary = summarizeOrderItems(order);
                    const actions = getNextStatusActions(
                      order.status,
                      order.fulfillmentType,
                    );
                    const isBusy = busyOrderId === order.id;
                    const menuOpen = openMenuOrderId === order.id;
                    const openUpward =
                      pagination.items.length > 3 &&
                      rowIdx >= pagination.items.length - 2;
                    const orderCode = formatOrderNumber(order.orderNumber);
                    const whatsappUrl = buildWhatsappUrl(
                      order.customerPhone,
                      `Olá ${order.customerName}! Sobre o seu pedido ${orderCode}:`,
                    );

                    return (
                      <tr
                        key={order.id}
                        data-testid={`admin-order-card-${order.orderNumber}`}
                        tabIndex={0}
                        aria-label={`Abrir detalhes do pedido ${orderCode} de ${order.customerName}`}
                        onClick={() => setSelectedOrderId(order.id)}
                        onKeyDown={(e) => {
                          if (
                            (e.key === 'Enter' || e.key === ' ') &&
                            e.target === e.currentTarget
                          ) {
                            e.preventDefault();
                            setSelectedOrderId(order.id);
                          }
                        }}
                        className={`transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F5B900] focus-visible:outline-offset-[-2px] ${
                          unread
                            ? 'bg-[#FFFBEB]/65 hover:bg-[#FFFBEB]'
                            : 'hover:bg-[#F7F8FC]/85'
                        }`}
                      >
                        {/* # Pedido */}
                        <td className="py-3.5 px-4 whitespace-nowrap align-middle">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-[#172033] font-mono tabular-nums">
                              {orderCode}
                            </span>
                            <span className="text-[11px] text-[#778094] font-mono tabular-nums">
                              {formatTimeBR(order.createdAtMs)}
                              {unread ? ' · Novo' : ''}
                            </span>
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="py-3.5 px-4 align-middle max-w-[220px]">
                          <p className="text-[13px] font-semibold text-[#172033] truncate">
                            {order.customerName}
                          </p>
                          <p className="text-[11px] text-[#778094] truncate">
                            {order.fulfillmentType === 'delivery'
                              ? 'Entrega'
                              : 'Retirada'}
                            {' · '}
                            {order.paymentMethod}
                          </p>
                          {order.fulfillmentType === 'delivery' &&
                            (order.deliveryNeighborhood || order.deliveryRegionName) && (
                              <p className="text-[11px] text-[#8A6200] font-medium truncate">
                                Bairro: {order.deliveryNeighborhood || order.deliveryRegionName}
                                {order.deliveryCity ? ` · ${order.deliveryCity}` : ''}
                              </p>
                            )}
                        </td>

                        {/* Itens */}
                        <td className="py-3.5 px-4 align-middle max-w-[260px]">
                          <p className="text-[13px] font-medium text-[#172033] tabular-nums">
                            {itemsSummary.countLabel}
                          </p>
                          <p className="text-[11px] text-[#778094] truncate">
                            {itemsSummary.previewText || 'Sem detalhes'}
                          </p>
                        </td>

                        {/* Valor */}
                        <td className="py-3.5 px-4 whitespace-nowrap align-middle">
                          <span className="text-[13px] font-bold text-[#172033] font-mono tabular-nums">
                            {formatCurrencyBRL(order.totalAmount)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap align-middle">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${badgeSpec.containerClass}`}
                          >
                            <OrderStatusIcon
                              status={order.status}
                              className="w-3 h-3 shrink-0"
                            />
                            <span>{badgeSpec.label}</span>
                          </span>
                        </td>

                        {/* Ações */}
                        <td
                          className="py-3.5 px-4 whitespace-nowrap align-middle text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            ref={menuOpen ? actionMenuContainerRef : undefined}
                            className="relative inline-flex items-center justify-end gap-1.5"
                          >
                            {unread && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleMarkAsViewed(order)}
                                title="Confirmar visualização"
                                aria-label={`Confirmar visualização do pedido ${orderCode}`}
                                className="min-h-[32px] px-2.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] hover:bg-[#FEF3C7] text-[#B45309] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>
                            )}

                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              aria-label={`Ações do pedido ${orderCode}`}
                              onClick={() =>
                                setOpenMenuOrderId((curr) =>
                                  curr === order.id ? null : order.id,
                                )
                              }
                              className="w-9 h-8 rounded-lg border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white hover:bg-[#F7F8FC] text-[#4B5563] hover:text-[#172033] inline-flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {menuOpen && (
                              <div
                                role="menu"
                                aria-label={`Menu de ações para ${orderCode}`}
                                className={`absolute right-0 ${
                                  openUpward
                                    ? 'bottom-full mb-1.5'
                                    : 'top-full mt-1.5'
                                } z-30 w-56 bg-white border border-[#E8EAF0] rounded-xl shadow-[0_12px_32px_rgba(23,32,51,0.14)] p-1.5 text-left`}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuOrderId(null);
                                    setSelectedOrderId(order.id);
                                  }}
                                  className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#172033] hover:bg-[#F7F8FC] flex items-center gap-2 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#778094]" />
                                  <span>Visualizar detalhes</span>
                                </button>

                                {unread && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={isBusy}
                                    onClick={() =>
                                      void handleMarkAsViewed(order)
                                    }
                                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#B45309] hover:bg-[#FFFBEB] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Confirmar visualização</span>
                                  </button>
                                )}

                                {actions.map((action) => (
                                  <button
                                    key={action.nextStatus}
                                    type="button"
                                    role="menuitem"
                                    disabled={isBusy}
                                    onClick={() => {
                                      if (action.requiresReason) {
                                        openReasonModalForOrder(
                                          order,
                                          action.nextStatus as
                                            | 'rejected'
                                            | 'cancelled',
                                          action.label,
                                        );
                                      } else {
                                        void runDirectTransition(
                                          order,
                                          action.nextStatus,
                                        );
                                      }
                                    }}
                                    className={`w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                                      action.tone === 'danger'
                                        ? 'text-[#B91C1C] hover:bg-[#FEF2F2]'
                                        : action.tone === 'success'
                                          ? 'text-[#15803D] hover:bg-[#ECFDF5]'
                                          : 'text-[#172033] hover:bg-[#F7F8FC]'
                                    }`}
                                  >
                                    {action.tone === 'danger' ? (
                                      <X className="w-3.5 h-3.5" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                    <span>{action.label}</span>
                                  </button>
                                ))}

                                <div className="my-1 border-t border-[#E8EAF0]" />

                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => openPrintModalForOrder(order)}
                                  className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#172033] hover:bg-[#F7F8FC] flex items-center gap-2 cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5 text-[#778094]" />
                                  <span>Imprimir pedido</span>
                                </button>

                                {whatsappUrl && (
                                  <a
                                    role="menuitem"
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setOpenMenuOrderId(null)}
                                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#15803D] hover:bg-[#ECFDF5] flex items-center gap-2"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    <span>Chamar no WhatsApp</span>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Responsive Cards (< md) */}
          <div className="md:hidden space-y-3">
            {pagination.items.map((order) => {
              const unread = isUnreadNewOrder(order);
              const badgeSpec = getOrderStatusBadgeSpec(order.status);
              const itemsSummary = summarizeOrderItems(order);
              const actions = getNextStatusActions(
                order.status,
                order.fulfillmentType,
              );
              const primaryAction = actions.find((a) => !a.requiresReason);
              const isBusy = busyOrderId === order.id;
              const orderCode = formatOrderNumber(order.orderNumber);

              return (
                <article
                  key={order.id}
                  data-testid={`admin-order-mobile-card-${order.orderNumber}`}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`bg-white border rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] space-y-3 cursor-pointer ${
                    unread ? 'border-[#F5B900] bg-[#FFFBEB]/40' : 'border-[#E8EAF0]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-[#172033] font-mono tabular-nums">
                          {orderCode}
                        </span>
                        <span className="text-[11px] text-[#778094] font-mono tabular-nums">
                          {formatTimeBR(order.createdAtMs)}
                        </span>
                        {unread && (
                          <span className="text-[11px] font-bold text-[#B45309]">
                            · Novo
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-[#172033] truncate mt-0.5">
                        {order.customerName}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold shrink-0 ${badgeSpec.containerClass}`}
                    >
                      <OrderStatusIcon
                        status={order.status}
                        className="w-3 h-3 shrink-0"
                      />
                      <span>{badgeSpec.label}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs pt-2 border-t border-[#E8EAF0]">
                    <div className="min-w-0">
                      <span className="font-semibold text-[#172033] tabular-nums">
                        {itemsSummary.countLabel}
                      </span>
                      <span className="text-[#778094]"> · </span>
                      <span className="text-[#778094]">
                        {order.fulfillmentType === 'delivery'
                          ? 'Entrega'
                          : 'Retirada'}
                      </span>
                      {order.fulfillmentType === 'delivery' &&
                        (order.deliveryNeighborhood || order.deliveryRegionName) && (
                          <span className="block text-[11px] font-medium text-[#8A6200] truncate mt-0.5">
                            Bairro: {order.deliveryNeighborhood || order.deliveryRegionName}
                            {order.deliveryCity ? ` · ${order.deliveryCity}` : ''}
                          </span>
                        )}
                    </div>
                    <span className="text-sm font-extrabold text-[#172033] font-mono tabular-nums shrink-0">
                      {formatCurrencyBRL(order.totalAmount)}
                    </span>
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8EAF0]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {primaryAction ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void runDirectTransition(
                            order,
                            primaryAction.nextStatus,
                          )
                        }
                        className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                          primaryAction.tone === 'success'
                            ? 'bg-[#16A36A] text-white'
                            : 'bg-[#F5B900] text-[#172033]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {isBusy ? 'Atualizando...' : primaryAction.label}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="min-h-[40px] px-3.5 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#778094]" />
                        <span>Ver detalhes</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openPrintModalForOrder(order)}
                        aria-label={`Imprimir pedido ${orderCode}`}
                        className="min-h-[40px] min-w-[40px] rounded-xl border border-[#E8EAF0] bg-white text-[#4B5563] inline-flex items-center justify-center cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        aria-label={`Mais ações do pedido ${orderCode}`}
                        className="min-h-[40px] min-w-[40px] rounded-xl border border-[#E8EAF0] bg-white text-[#4B5563] inline-flex items-center justify-center cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination Bar */}
          {pagination.totalPages > 1 && (
            <nav
              aria-label="Paginação de pedidos"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white border border-[#E8EAF0] rounded-2xl px-4 py-3 text-xs text-[#778094]"
            >
              <span className="tabular-nums">
                Exibindo{' '}
                <strong className="text-[#172033]">
                  {pagination.startIndex + 1}–{pagination.endIndex}
                </strong>{' '}
                de{' '}
                <strong className="text-[#172033]">
                  {pagination.totalItems}
                </strong>{' '}
                pedidos
              </span>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={pagination.safePage <= 1}
                  onClick={() =>
                    setPage((p) => Math.max(1, p - 1))
                  }
                  className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-[#172033] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <span className="font-mono tabular-nums px-2 text-[#172033] font-semibold">
                  {pagination.safePage} / {pagination.totalPages}
                </span>

                <button
                  type="button"
                  disabled={pagination.safePage >= pagination.totalPages}
                  onClick={() =>
                    setPage((p) =>
                      Math.min(pagination.totalPages, p + 1),
                    )
                  }
                  className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-[#172033] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        busyOrderId={busyOrderId}
        actionError={actionError}
        onClose={() => setSelectedOrderId(null)}
        onMarkViewed={handleMarkAsViewed}
        onDirectTransition={runDirectTransition}
        onRequestReasonTransition={(order, action) =>
          openReasonModalForOrder(
            order,
            action.nextStatus as 'rejected' | 'cancelled',
            action.label,
          )
        }
        onPrint={openPrintModalForOrder}
      />

      <DeliveryDispatchAssignModal
        isOpen={Boolean(assigningOrderId)}
        mode="assign"
        order={orders.find((item) => item.id === assigningOrderId) ?? null}
        couriers={couriers}
        dispatches={dispatches}
        operatorEmail={operatorEmail}
        onClose={() => setAssigningOrderId(null)}
        onOpenCouriers={onOpenCouriers}
        onConfirmAssign={async (orderId, courierId, notes) => {
          await onAssignCourier(orderId, courierId, notes);
          setAssigningOrderId(null);
        }}
      />

      {/* Reason Modal for Rejection or Cancellation */}
      {reasonModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reason-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setReasonModal(null);
              }
            }}
            className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <form
              onSubmit={(e) => void handleConfirmReasonSubmit(e)}
              className="max-w-md w-full bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#E8EAF0] pb-3">
                <h3
                  id="reason-modal-title"
                  className="text-sm font-bold text-[#172033]"
                >
                  {reasonModal.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setReasonModal(null)}
                  aria-label="Fechar"
                  className="w-8 h-8 rounded-lg text-[#778094] hover:text-[#172033] hover:bg-[#F7F8FC] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {reasonError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]"
                >
                  {reasonError}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-[#778094]">
                  Sugestões rápidas (o cliente verá este motivo):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REASONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setReasonText(suggestion)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#F7F8FC] border border-[#E8EAF0] hover:border-[#F5B900] text-[11px] font-medium text-[#172033] cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="rejection-reason-input"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Motivo obrigatório *
                </label>
                <textarea
                  id="rejection-reason-input"
                  rows={3}
                  required
                  minLength={3}
                  maxLength={240}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Descreva o motivo..."
                  className="mgw-input !min-h-[88px] resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReasonModal(null)}
                  className="mgw-btn-secondary"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(busyOrderId)}
                  className="min-h-[40px] px-4 rounded-xl bg-[#E35D62] hover:bg-[#DC2626] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyOrderId ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      <OrderPrintModal
        order={printingOrder}
        allowKitchenToggle
        onClose={() => setPrintingOrder(null)}
      />
    </div>
  );
}
