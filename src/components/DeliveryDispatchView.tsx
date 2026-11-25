import { useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bike,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  MapPin,
  MessageCircle,
  Motorbike,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  DeliveryCourierRecord,
  DeliveryDispatchHistoryRecord,
  DeliveryDispatchRecord,
  DeliveryDispatchStatus,
  DigitalMenuSettings,
  OnlineOrderRecord,
} from '../types/finance';
import {
  COURIER_TYPE_SPEC,
  formatCustomerPhoneBR,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import {
  buildCourierWhatsappDispatchUrl,
  buildDispatchQueueItems,
  buildDispatchTrackingEntries,
  computeDeliveryDispatchKpis,
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_SPEC,
  type DispatchPeriodFilter,
  type DispatchProgressionAction,
  type DispatchStatusFilter,
  type DispatchTrackingEntry,
  filterDispatchTrackingEntries,
  formatElapsedDurationLabel,
  getNextDispatchActions,
} from '../utils/deliveryDispatch';
import { formatCurrencyBRL } from '../utils/finance';
import { formatOrderNumber, formatTimeBR } from '../utils/onlineOrders';
import { getOrderStatusBadgeSpec } from '../utils/ordersCenter';
import { DeliveryDispatchAssignModal } from './DeliveryDispatchAssignModal';
import { DeliveryDispatchDetailsModal } from './DeliveryDispatchDetailsModal';

interface DeliveryDispatchViewProps {
  establishmentName: string;
  orders: OnlineOrderRecord[];
  couriers: DeliveryCourierRecord[];
  dispatches: DeliveryDispatchRecord[];
  dispatchHistory: DeliveryDispatchHistoryRecord[];
  digitalMenuSettings: DigitalMenuSettings;
  operatorEmail?: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  canOpenOrders?: boolean;
  onRefresh?: () => Promise<void> | void;
  onOpenOrders?: () => void;
  onOpenCouriers?: () => void;
  onAssignCourier: (
    orderId: string,
    courierId: string,
    notes: string,
  ) => Promise<void>;
  onReassignCourier: (
    dispatchId: string,
    newCourierId: string,
    reason: string,
  ) => Promise<void>;
  onCancelDispatch: (dispatchId: string, reason: string) => Promise<void>;
  onRespondDispatch: (
    dispatchId: string,
    decision: 'accept' | 'reject',
    reason: string,
  ) => Promise<void>;
  onAdvanceDispatchStatus: (
    dispatchId: string,
    nextStatus: DeliveryDispatchStatus,
  ) => Promise<void>;
}

const DISPATCH_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: DispatchStatusFilter;
  label: string;
}> = [
  { value: 'active', label: 'Somente ativas' },
  { value: 'all', label: 'Todos os estados' },
  { value: 'awaiting_acceptance', label: DISPATCH_STATUS_LABELS.awaiting_acceptance },
  { value: 'delivery_accepted', label: DISPATCH_STATUS_LABELS.delivery_accepted },
  { value: 'preparing', label: DISPATCH_STATUS_LABELS.preparing },
  { value: 'ready_for_dispatch', label: DISPATCH_STATUS_LABELS.ready_for_dispatch },
  { value: 'out_for_delivery', label: DISPATCH_STATUS_LABELS.out_for_delivery },
  { value: 'delivered', label: DISPATCH_STATUS_LABELS.delivered },
  { value: 'delivery_rejected', label: DISPATCH_STATUS_LABELS.delivery_rejected },
  { value: 'delivery_cancelled', label: DISPATCH_STATUS_LABELS.delivery_cancelled },
];

function DeliveryDispatchSkeleton() {
  return (
    <div
      className="space-y-5 sm:space-y-6"
      aria-busy="true"
      aria-label="Carregando Central de Despacho do MGW Delivery"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-4 w-40 rounded-lg" />
          <div className="mgw-skeleton h-8 w-56 rounded-lg" />
          <div className="mgw-skeleton h-4 w-80 max-w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-28 rounded-xl" />
          <div className="mgw-skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="mgw-skeleton h-[126px] rounded-2xl" />
        ))}
      </div>

      <div className="mgw-skeleton h-[260px] w-full rounded-2xl" />
      <div className="mgw-skeleton h-[320px] w-full rounded-2xl" />
    </div>
  );
}

export function DeliveryDispatchView({
  establishmentName,
  orders,
  couriers,
  dispatches,
  dispatchHistory,
  digitalMenuSettings,
  operatorEmail = '',
  isLoading = false,
  errorMessage = null,
  canOpenOrders = true,
  onRefresh,
  onOpenOrders,
  onOpenCouriers,
  onAssignCourier,
  onReassignCourier,
  onCancelDispatch,
  onRespondDispatch,
  onAdvanceDispatchStatus,
}: DeliveryDispatchViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyDispatchId, setBusyDispatchId] = useState<string | null>(null);

  // Filtros do acompanhamento
  const [statusFilter, setStatusFilter] =
    useState<DispatchStatusFilter>('active');
  const [courierIdFilter, setCourierIdFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] =
    useState<DispatchPeriodFilter>('today');
  const [orderNumberQuery, setOrderNumberQuery] = useState('');

  // Modais de atribuição/reatribuição
  const [assignModalState, setAssignModalState] = useState<{
    open: boolean;
    mode: 'assign' | 'reassign';
    order: OnlineOrderRecord | null;
    currentDispatch: DeliveryDispatchRecord | null;
  }>({
    open: false,
    mode: 'assign',
    order: null,
    currentDispatch: null,
  });

  // Modal de detalhes (por despacho ativo/histórico ou pedido na fila)
  const [selectedDispatchId, setSelectedDispatchId] = useState<string | null>(
    null,
  );
  const [previewQueueOrderId, setPreviewQueueOrderId] = useState<string | null>(
    null,
  );

  // Modal de motivo obrigatório (Recusa do entregador ou Cancelamento do despacho)
  const [reasonPromptState, setReasonPromptState] = useState<{
    entry: DispatchTrackingEntry;
    action: DispatchProgressionAction;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const kpis = useMemo(
    () => computeDeliveryDispatchKpis(orders, dispatches, couriers),
    [orders, dispatches, couriers],
  );

  const dispatchQueue = useMemo(
    () => buildDispatchQueueItems(orders, dispatches),
    [orders, dispatches],
  );

  const allTrackingEntries = useMemo(
    () =>
      buildDispatchTrackingEntries({
        orders,
        dispatches,
        couriers,
        history: dispatchHistory,
      }),
    [orders, dispatches, couriers, dispatchHistory],
  );

  const filteredTrackingEntries = useMemo(
    () =>
      filterDispatchTrackingEntries(allTrackingEntries, {
        statusFilter,
        courierIdFilter,
        periodFilter,
        orderNumberQuery,
      }),
    [
      allTrackingEntries,
      statusFilter,
      courierIdFilter,
      periodFilter,
      orderNumberQuery,
    ],
  );

  const selectedEntry = useMemo(
    () =>
      selectedDispatchId
        ? allTrackingEntries.find(
            (e) => e.dispatch.id === selectedDispatchId,
          ) ?? null
        : null,
    [allTrackingEntries, selectedDispatchId],
  );

  const previewQueueOrder = useMemo(
    () =>
      previewQueueOrderId
        ? orders.find((o) => o.id === previewQueueOrderId) ?? null
        : null,
    [orders, previewQueueOrderId],
  );

  const previewQueueHistory = useMemo(() => {
    if (!previewQueueOrder) return [];
    return dispatchHistory
      .filter((h) => h.orderId === previewQueueOrder.id)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }, [dispatchHistory, previewQueueOrder]);

  if (isLoading) {
    return <DeliveryDispatchSkeleton />;
  }

  const displayEstablishment =
    establishmentName.trim() ||
    digitalMenuSettings.storeName.trim() ||
    'Seu estabelecimento';

  async function handleRefreshClick() {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    setActionError(null);
    try {
      await onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a Central de Despacho.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleDirectAction(
    entry: DispatchTrackingEntry,
    action: DispatchProgressionAction,
  ) {
    setBusyDispatchId(entry.dispatch.id);
    setActionError(null);
    try {
      if (action.kind === 'accept') {
        await onRespondDispatch(entry.dispatch.id, 'accept', '');
      } else if (action.kind === 'advance' && action.nextStatus) {
        await onAdvanceDispatchStatus(entry.dispatch.id, action.nextStatus);
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar o despacho.',
      );
    } finally {
      setBusyDispatchId(null);
    }
  }

  function handleRequestReasonAction(
    entry: DispatchTrackingEntry,
    action: DispatchProgressionAction,
  ) {
    setReasonInput('');
    setReasonError(null);
    setReasonPromptState({ entry, action });
  }

  async function handleConfirmReasonSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reasonPromptState) return;
    const clean = reasonInput.trim();
    if (clean.length < 3) {
      setReasonError('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }

    const { entry, action } = reasonPromptState;
    setBusyDispatchId(entry.dispatch.id);
    setReasonError(null);
    setActionError(null);
    try {
      if (action.kind === 'reject') {
        await onRespondDispatch(entry.dispatch.id, 'reject', clean);
      } else {
        await onCancelDispatch(entry.dispatch.id, clean);
      }
      setReasonPromptState(null);
      setReasonInput('');
    } catch (err) {
      setReasonError(
        err instanceof Error
          ? err.message
          : 'Não foi possível confirmar a operação.',
      );
    } finally {
      setBusyDispatchId(null);
    }
  }

  function openAssignForOrder(order: OnlineOrderRecord) {
    setActionError(null);
    setAssignModalState({
      open: true,
      mode: 'assign',
      order,
      currentDispatch: null,
    });
  }

  function openReassignForEntry(entry: DispatchTrackingEntry) {
    if (!entry.order) return;
    setActionError(null);
    setAssignModalState({
      open: true,
      mode: 'reassign',
      order: entry.order,
      currentDispatch: entry.dispatch,
    });
  }

  const combinedError = actionError || errorMessage;

  return (
    <div className="space-y-5 sm:space-y-6">
      {combinedError && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#B91C1C] flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{combinedError}</span>
          </div>
          {onRefresh && (
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

      {/* Cabeçalho */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(23,32,51,0.04)]">
            <Send className="w-6 h-6" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#778094]">
              <span className="font-semibold text-[#8A6200]">MGW Delivery</span>
              <span aria-hidden="true">·</span>
              <span className="truncate font-medium text-[#172033]">
                {displayEstablishment}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-0.5">
              Central de Despacho
            </h2>
            <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
              Distribua pedidos de entrega, registre o aceite dos motoboys e acompanhe
              até a conclusão.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {onRefresh && (
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={isRefreshing}
              className="mgw-btn-secondary whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Atualizar</span>
            </button>
          )}

          {onOpenCouriers && (
            <button
              type="button"
              onClick={onOpenCouriers}
              className="mgw-btn-secondary whitespace-nowrap shrink-0"
            >
              <Bike className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Entregadores</span>
            </button>
          )}

          {canOpenOrders && onOpenOrders && (
            <button
              type="button"
              onClick={onOpenOrders}
              className="mgw-btn-primary whitespace-nowrap shrink-0"
            >
              <span>Central de Pedidos</span>
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      {!digitalMenuSettings.acceptsDelivery && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3 text-xs text-[#92400E] flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[#B45309]" />
          <span>
            O recebimento de novos pedidos para entrega está desativado no Cardápio
            Digital. Pedidos de delivery já registrados continuam operacionais abaixo.
          </span>
        </div>
      )}

      {/* 6 KPIs Operacionais Reais */}
      <section
        aria-label="Indicadores da Central de Despacho"
        className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5"
      >
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Fila</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Pedidos aguardando entregador
            </p>
            <p
              data-testid="dispatch-kpi-awaiting-courier"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.awaitingCourierCount}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFF7ED] border border-[#FED7AA] text-[#C2410C] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Aceite</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Entregas aguardando aceite
            </p>
            <p
              data-testid="dispatch-kpi-awaiting-acceptance"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.awaitingAcceptanceCount}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <Motorbike className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Em curso</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Entregas em andamento
            </p>
            <p
              data-testid="dispatch-kpi-in-progress"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.inProgressCount}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Hoje</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Entregas concluídas hoje
            </p>
            <p
              data-testid="dispatch-kpi-completed-today"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.completedTodayCount}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Livres</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Entregadores disponíveis
            </p>
            <p
              data-testid="dispatch-kpi-available-couriers"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.availableCouriersCount}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] flex items-center justify-center shrink-0">
              <Bike className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Em rota</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Entregadores ocupados
            </p>
            <p
              data-testid="dispatch-kpi-occupied-couriers"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.occupiedCouriersCount}
            </p>
          </div>
        </article>
      </section>

      {/* 1. Fila de Despacho — Somente pedidos de Delivery */}
      <section
        aria-label="Fila de despacho de pedidos de entrega"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#172033] tracking-tight">
                Fila de despacho (Pedidos para entrega)
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[11px] font-bold font-mono tabular-nums text-[#92400E]">
                {dispatchQueue.length}
              </span>
            </div>
            <p className="text-xs text-[#778094] mt-0.5">
              Exibe apenas pedidos de entrega sem entregador ativo atribuído · retirada
              no balcão não entra na fila.
            </p>
          </div>
        </div>

        {dispatchQueue.length === 0 ? (
          <div
            data-testid="dispatch-queue-empty"
            className="px-6 py-10 text-center flex flex-col items-center justify-center max-w-md mx-auto"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mb-3">
              <Package className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-[#172033]">
              Nenhum pedido aguardando atribuição
            </p>
            <p className="text-xs text-[#778094] mt-1 leading-relaxed">
              Todos os pedidos de entrega em aberto já estão atribuídos ou ainda não
              há novos pedidos de delivery pendentes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E8EAF0]">
            {dispatchQueue.map((item) => {
              const { order, waitTimeMs, wasPreviouslyRefused, lastClosedDispatch } =
                item;
              const orderSpec = getOrderStatusBadgeSpec(order.status);
              const orderCode = formatOrderNumber(order.orderNumber);

              return (
                <article
                  key={order.id}
                  data-testid={`dispatch-queue-item-${order.id}`}
                  className="p-4 sm:px-6 hover:bg-[#F7F8FC]/60 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-extrabold font-mono tabular-nums text-[#172033]">
                        {orderCode}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${orderSpec.containerClass}`}
                      >
                        {orderSpec.label}
                      </span>
                      {wasPreviouslyRefused && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] text-[11px] font-semibold">
                          <AlertTriangle
                            className="w-3 h-3"
                            aria-hidden="true"
                          />
                          <span>Devolvido após recusa</span>
                        </span>
                      )}
                      <span className="text-[11px] font-mono tabular-nums text-[#778094] inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        <span>
                          {formatTimeBR(order.createdAtMs)} · espera{' '}
                          {formatElapsedDurationLabel(waitTimeMs)}
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1 min-w-0">
                        <p className="font-bold text-[#172033] truncate">
                          {order.customerName}{' '}
                          {order.customerPhone && (
                            <span className="font-mono font-normal text-[#778094]">
                              · {formatCustomerPhoneBR(order.customerPhone)}
                            </span>
                          )}
                        </p>
                        <p className="text-[#172033] flex items-start gap-1.5">
                          <MapPin
                            className="w-3.5 h-3.5 text-[#B38300] shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>
                            {order.deliveryAddress || 'Endereço não informado'}
                            {order.deliveryReference
                              ? ` · Ref.: ${order.deliveryReference}`
                              : ''}
                          </span>
                        </p>
                        {(order.deliveryNeighborhood ||
                          order.deliveryRegionName ||
                          order.deliveryCity) && (
                          <p className="text-[11px] font-medium text-[#8A6200] pl-5 truncate">
                            {[
                              order.deliveryNeighborhood
                                ? `Bairro: ${order.deliveryNeighborhood}`
                                : null,
                              order.deliveryRegionName
                                ? `Região: ${order.deliveryRegionName}`
                                : null,
                              order.deliveryCity || null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1 text-[#778094]">
                        <p className="font-mono tabular-nums">
                          Produtos:{' '}
                          <strong className="text-[#172033]">
                            {formatCurrencyBRL(order.subtotalAmount)}
                          </strong>{' '}
                          · Taxa:{' '}
                          <strong className="text-[#172033]">
                            {formatCurrencyBRL(order.deliveryFee)}
                          </strong>{' '}
                          · Total:{' '}
                          <strong className="text-[#172033]">
                            {formatCurrencyBRL(order.totalAmount)}
                          </strong>
                        </p>
                        <p>
                          Pagamento:{' '}
                          <strong className="text-[#172033]">
                            {order.paymentMethod}
                            {order.paymentMethod === 'Dinheiro' &&
                            order.changeFor
                              ? ` (Troco p/ ${formatCurrencyBRL(order.changeFor)})`
                              : ''}
                          </strong>
                        </p>
                      </div>
                    </div>

                    {order.customerNote && (
                      <p className="text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-2.5 py-1.5 inline-block">
                        <strong>Obs. cliente:</strong> {order.customerNote}
                      </p>
                    )}

                    {wasPreviouslyRefused &&
                      lastClosedDispatch?.rejectionReason && (
                        <p className="text-[11px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-2.5 py-1.5">
                          <strong>
                            Recusado por {lastClosedDispatch.courierNameSnapshot}:
                          </strong>{' '}
                          {lastClosedDispatch.rejectionReason}
                        </p>
                      )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewQueueOrderId(order.id)}
                      className="mgw-btn-secondary whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ver pedido</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openAssignForOrder(order)}
                      className="mgw-btn-primary whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Atribuir entregador</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Entregas Atribuídas e Acompanhamento em Tempo Real */}
      <section
        aria-label="Acompanhamento e histórico de entregas atribuídas"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#172033] tracking-tight">
                Entregas atribuídas e acompanhamento
              </h3>
              <p className="text-xs text-[#778094] mt-0.5">
                Controle aceite, recusa, saída para entrega e confirmação de conclusão
                sincronizados com o pedido.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#778094]">
              {filteredTrackingEntries.length} registro(s)
            </span>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <label
                htmlFor="dispatch-filter-status"
                className="block text-[11px] font-semibold text-[#778094] mb-1"
              >
                Estado da entrega
              </label>
              <div className="relative">
                <Filter
                  className="w-3.5 h-3.5 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <select
                  id="dispatch-filter-status"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as DispatchStatusFilter)
                  }
                  className="w-full min-h-[38px] pl-8 pr-3 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] focus:border-[#F5B900] focus:outline-none"
                >
                  {DISPATCH_STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="dispatch-filter-courier"
                className="block text-[11px] font-semibold text-[#778094] mb-1"
              >
                Entregador
              </label>
              <select
                id="dispatch-filter-courier"
                value={courierIdFilter}
                onChange={(e) => setCourierIdFilter(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] focus:border-[#F5B900] focus:outline-none"
              >
                <option value="all">Todos os entregadores</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({COURIER_TYPE_SPEC[normalizeCourierType(c.courierType)].label})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dispatch-filter-period"
                className="block text-[11px] font-semibold text-[#778094] mb-1"
              >
                Período
              </label>
              <select
                id="dispatch-filter-period"
                value={periodFilter}
                onChange={(e) =>
                  setPeriodFilter(e.target.value as DispatchPeriodFilter)
                }
                className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] focus:border-[#F5B900] focus:outline-none"
              >
                <option value="today">Hoje</option>
                <option value="last7">Últimos 7 dias</option>
                <option value="all">Todo o período</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="dispatch-filter-order"
                className="block text-[11px] font-semibold text-[#778094] mb-1"
              >
                Número do pedido / cliente
              </label>
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="dispatch-filter-order"
                  type="search"
                  value={orderNumberQuery}
                  onChange={(e) => setOrderNumberQuery(e.target.value)}
                  placeholder="Ex.: #0014 ou nome..."
                  className="w-full min-h-[38px] pl-8 pr-3 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] focus:bg-white text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {filteredTrackingEntries.length === 0 ? (
          <div
            data-testid="dispatch-tracking-empty"
            className="px-6 py-10 text-center flex flex-col items-center justify-center max-w-md mx-auto"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mb-3">
              <Motorbike className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-[#172033]">
              Nenhuma entrega encontrada para estes filtros
            </p>
            <p className="text-xs text-[#778094] mt-1 leading-relaxed">
              Ajuste os filtros de estado, entregador ou período, ou atribua um pedido
              da fila acima.
            </p>
            {(statusFilter !== 'all' ||
              courierIdFilter !== 'all' ||
              periodFilter !== 'all' ||
              orderNumberQuery) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setCourierIdFilter('all');
                  setPeriodFilter('all');
                  setOrderNumberQuery('');
                }}
                className="mt-3 mgw-btn-secondary"
              >
                Ver todo o histórico
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#E8EAF0]">
            {filteredTrackingEntries.map((entry) => {
              const { dispatch, order, courier, elapsedTimeMs } = entry;
              const statusSpec = DISPATCH_STATUS_SPEC[dispatch.dispatchStatus];
              const typeSpec =
                COURIER_TYPE_SPEC[
                  normalizeCourierType(
                    courier?.courierType ?? dispatch.courierTypeSnapshot,
                  )
                ];
              const isBusy = busyDispatchId === dispatch.id;
              const actions = getNextDispatchActions(
                dispatch.dispatchStatus,
                order?.status,
              );
              const courierName = courier?.name || dispatch.courierNameSnapshot;
              const courierPhone =
                courier?.whatsapp ||
                courier?.phone ||
                dispatch.courierPhoneSnapshot;
              const whatsappUrl =
                order && courierPhone
                  ? buildCourierWhatsappDispatchUrl({
                      courierPhone,
                      courierName,
                      order,
                      storeName: displayEstablishment,
                    })
                  : null;

              return (
                <article
                  key={dispatch.id}
                  data-testid={`dispatch-entry-${dispatch.id}`}
                  className="p-4 sm:px-6 space-y-3 hover:bg-[#F7F8FC]/50 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm sm:text-base font-extrabold font-mono tabular-nums text-[#172033]">
                          {order
                            ? formatOrderNumber(order.orderNumber)
                            : 'Pedido'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${statusSpec.containerClass}`}
                        >
                          {statusSpec.label}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#778094] inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          <span>
                            Atribuído {formatTimeBR(dispatch.assignedAtMs)}
                            {dispatch.acceptedAtMs
                              ? ` · Aceito ${formatTimeBR(dispatch.acceptedAtMs)}`
                              : ''}
                            {' · '}
                            {formatElapsedDurationLabel(elapsedTimeMs)}
                          </span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-semibold text-[#172033] truncate">
                            {order
                              ? `${order.customerName} · ${formatCurrencyBRL(order.totalAmount)} (${order.paymentMethod})`
                              : 'Pedido vinculado'}
                          </p>
                          {order && (
                            <>
                              <p className="text-[#778094] truncate">
                                {order.deliveryAddress || 'Endereço não informado'}
                              </p>
                              {(order.deliveryNeighborhood ||
                                order.deliveryRegionName ||
                                order.deliveryCity) && (
                                <p className="text-[11px] font-medium text-[#8A6200] truncate">
                                  {[
                                    order.deliveryNeighborhood
                                      ? `Bairro: ${order.deliveryNeighborhood}`
                                      : null,
                                    order.deliveryRegionName
                                      ? `Região: ${order.deliveryRegionName}`
                                      : null,
                                    order.deliveryCity || null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Bike
                              className="w-3.5 h-3.5 text-[#B38300] shrink-0"
                              aria-hidden="true"
                            />
                            <span className="font-bold text-[#172033]">
                              {courierName}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${typeSpec.containerClass}`}
                            >
                              {typeSpec.label}
                            </span>
                            {courierPhone && (
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#778094]">
                                <Phone
                                  className="w-3 h-3"
                                  aria-hidden="true"
                                />
                                {formatCustomerPhoneBR(courierPhone)}
                              </span>
                            )}
                          </div>
                          {dispatch.assignedByEmail && (
                            <p className="text-[11px] text-[#778094]">
                              Despachado por: {dispatch.assignedByEmail}
                            </p>
                          )}
                        </div>
                      </div>

                      {dispatch.dispatchStatus === 'awaiting_acceptance' && (
                        <p className="text-[11px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-2.5 py-1.5">
                          Envie os detalhes pelo WhatsApp ao entregador e registre o
                          aceite ou a recusa abaixo.
                        </p>
                      )}

                      {(dispatch.rejectionReason ||
                        dispatch.cancellationReason) && (
                        <p className="text-[11px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-2.5 py-1.5">
                          <strong>
                            {dispatch.rejectionReason
                              ? 'Motivo da recusa:'
                              : 'Motivo do cancelamento:'}
                          </strong>{' '}
                          {dispatch.rejectionReason ||
                            dispatch.cancellationReason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[34px] px-2.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-semibold text-[#15803D] hover:bg-[#D1FAE5] inline-flex items-center gap-1"
                        >
                          <MessageCircle
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          <span>WhatsApp</span>
                        </a>
                      )}

                      {actions.map((action) => {
                        const btnClass =
                          action.tone === 'success'
                            ? 'min-h-[34px] px-3 rounded-xl bg-[#16A36A] hover:bg-[#15803D] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50'
                            : action.tone === 'primary'
                              ? 'min-h-[34px] px-3 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50'
                              : action.tone === 'danger'
                                ? 'min-h-[34px] px-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50'
                                : 'min-h-[34px] px-2.5 rounded-xl border border-[#E8EAF0] bg-white hover:border-[#D5D9E4] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50';

                        return (
                          <button
                            key={`${dispatch.id}-${action.kind}-${action.nextStatus || 'x'}`}
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              if (action.kind === 'reassign') {
                                openReassignForEntry(entry);
                              } else if (action.requiresReason) {
                                handleRequestReasonAction(entry, action);
                              } else {
                                void handleDirectAction(entry, action);
                              }
                            }}
                            className={btnClass}
                          >
                            <span>{action.label}</span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setSelectedDispatchId(dispatch.id)}
                        className="min-h-[34px] px-2.5 rounded-xl border border-[#E8EAF0] bg-white hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Histórico</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de Atribuição / Reatribuição */}
      <DeliveryDispatchAssignModal
        isOpen={assignModalState.open}
        mode={assignModalState.mode}
        order={assignModalState.order}
        currentDispatch={assignModalState.currentDispatch}
        couriers={couriers}
        dispatches={dispatches}
        operatorEmail={operatorEmail}
        onClose={() =>
          setAssignModalState({
            open: false,
            mode: 'assign',
            order: null,
            currentDispatch: null,
          })
        }
        onConfirmAssign={onAssignCourier}
        onConfirmReassign={onReassignCourier}
        onOpenCouriers={onOpenCouriers}
      />

      {/* Modal de Detalhes e Histórico */}
      <DeliveryDispatchDetailsModal
        entry={selectedEntry}
        previewOrder={selectedEntry ? null : previewQueueOrder}
        previewHistory={selectedEntry ? [] : previewQueueHistory}
        storeName={displayEstablishment}
        busyDispatchId={busyDispatchId}
        actionError={actionError}
        onClose={() => {
          setSelectedDispatchId(null);
          setPreviewQueueOrderId(null);
        }}
        onAssignOrder={(order) => openAssignForOrder(order)}
        onDirectAction={handleDirectAction}
        onRequestReasonAction={handleRequestReasonAction}
        onRequestReassign={(entry) => {
          setSelectedDispatchId(null);
          openReassignForEntry(entry);
        }}
      />

      {/* Modal de Motivo Obrigatório para Recusa ou Cancelamento */}
      {reasonPromptState &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispatch-reason-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !busyDispatchId) {
                setReasonPromptState(null);
              }
            }}
            className="fixed inset-0 z-[60] bg-[#172033]/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <form
              onSubmit={(e) => void handleConfirmReasonSubmit(e)}
              className="w-full max-w-md bg-white border border-[#E8EAF0] rounded-2xl p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3
                      id="dispatch-reason-modal-title"
                      className="text-base font-extrabold text-[#172033]"
                    >
                      {reasonPromptState.action.kind === 'reject'
                        ? 'Registrar recusa do entregador'
                        : 'Cancelar atribuição da entrega'}
                    </h3>
                    <p className="text-xs text-[#778094]">
                      {reasonPromptState.entry.order
                        ? formatOrderNumber(
                            reasonPromptState.entry.order.orderNumber,
                          )
                        : 'Entrega'}{' '}
                      ·{' '}
                      {reasonPromptState.entry.courier?.name ||
                        reasonPromptState.entry.dispatch.courierNameSnapshot}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={Boolean(busyDispatchId)}
                  onClick={() => setReasonPromptState(null)}
                  aria-label="Fechar janela de motivo"
                  className="w-8 h-8 rounded-lg border border-[#E8EAF0] flex items-center justify-center text-[#778094] cursor-pointer"
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

              <div>
                <label
                  htmlFor="dispatch-reason-input"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Motivo obrigatório <span className="text-[#E35D62]">*</span>
                </label>
                <textarea
                  id="dispatch-reason-input"
                  rows={3}
                  maxLength={300}
                  required
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder={
                    reasonPromptState.action.kind === 'reject'
                      ? 'Ex.: Entregador informou que já está em outra rota ou pneu furou'
                      : 'Ex.: Cliente alterou endereço ou troca operacional de motoboy'
                  }
                  className="w-full p-3 rounded-xl border border-[#E8EAF0] bg-white text-xs sm:text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
                <p className="text-[11px] text-[#778094] mt-1">
                  Após confirmar, o pedido retornará automaticamente para a fila de
                  despacho aguardando novo entregador.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyDispatchId)}
                  onClick={() => setReasonPromptState(null)}
                  className="mgw-btn-secondary"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(busyDispatchId)}
                  className="min-h-[40px] px-4 rounded-xl bg-[#E35D62] hover:bg-[#DC2626] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyDispatchId
                    ? 'Registrando...'
                    : reasonPromptState.action.kind === 'reject'
                      ? 'Confirmar recusa'
                      : 'Confirmar cancelamento'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
