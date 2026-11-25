import type {
  CourierOperationalAvailability,
  DeliveryCourierRecord,
  DeliveryDispatchHistoryRecord,
  DeliveryDispatchRecord,
  DeliveryDispatchStatus,
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import { formatCurrencyBRL, getLocalTodayDate } from './finance';
import {
  buildWhatsappUrl,
  formatOrderNumber,
  isTerminalOrderStatus,
} from './onlineOrders';
import { COURIER_TYPE_SPEC, normalizeCourierType } from './deliveryCouriers';

export const TERMINAL_DISPATCH_STATUSES: ReadonlySet<DeliveryDispatchStatus> =
  new Set(['delivered', 'delivery_rejected', 'delivery_cancelled']);

export const IN_PROGRESS_DISPATCH_STATUSES: ReadonlySet<DeliveryDispatchStatus> =
  new Set([
    'courier_assigned',
    'delivery_accepted',
    'preparing',
    'ready_for_dispatch',
    'out_for_delivery',
  ]);

export const DISPATCH_STATUS_LABELS: Record<DeliveryDispatchStatus, string> = {
  awaiting_dispatch: 'Aguardando despacho',
  courier_assigned: 'Entregador atribuído',
  awaiting_acceptance: 'Aguardando aceite',
  delivery_accepted: 'Entrega aceita',
  preparing: 'Em preparação',
  ready_for_dispatch: 'Pronto para retirada',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  delivery_rejected: 'Entrega recusada',
  delivery_cancelled: 'Entrega cancelada',
};

export const DISPATCH_STATUS_SPEC: Record<
  DeliveryDispatchStatus,
  {
    label: string;
    containerClass: string;
  }
> = {
  awaiting_dispatch: {
    label: 'Aguardando despacho',
    containerClass: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
  },
  courier_assigned: {
    label: 'Entregador atribuído',
    containerClass: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]',
  },
  awaiting_acceptance: {
    label: 'Aguardando aceite',
    containerClass: 'bg-[#FFF7ED] border-[#FED7AA] text-[#C2410C]',
  },
  delivery_accepted: {
    label: 'Entrega aceita',
    containerClass: 'bg-[#EEF2FF] border-[#C7D2FE] text-[#4338CA]',
  },
  preparing: {
    label: 'Em preparação',
    containerClass: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]',
  },
  ready_for_dispatch: {
    label: 'Pronto para retirada',
    containerClass: 'bg-[#FFFBEB] border-[#F5B900] text-[#8A6200]',
  },
  out_for_delivery: {
    label: 'Saiu para entrega',
    containerClass: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]',
  },
  delivered: {
    label: 'Entregue',
    containerClass: 'bg-[#ECFDF5] border-[#6EE7B7] text-[#047857]',
  },
  delivery_rejected: {
    label: 'Entrega recusada',
    containerClass: 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
  },
  delivery_cancelled: {
    label: 'Entrega cancelada',
    containerClass: 'bg-[#F3F4F6] border-[#D1D5DB] text-[#4B5563]',
  },
};

export const OPERATIONAL_COURIER_STATUS_SPEC: Record<
  CourierOperationalAvailability,
  {
    label: string;
    containerClass: string;
  }
> = {
  available: {
    label: 'Disponível',
    containerClass: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]',
  },
  occupied: {
    label: 'Ocupado',
    containerClass: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
  },
  unavailable: {
    label: 'Indisponível',
    containerClass: 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
  },
};

export function isTerminalDispatchStatus(
  status: DeliveryDispatchStatus,
): boolean {
  return TERMINAL_DISPATCH_STATUSES.has(status);
}

export function isActiveDispatchStatus(
  status: DeliveryDispatchStatus,
): boolean {
  return !TERMINAL_DISPATCH_STATUSES.has(status);
}

export interface CourierDispatchAvailabilityEntry {
  courier: DeliveryCourierRecord;
  courierTypeLabel: string;
  activeDeliveriesCount: number;
  operationalAvailability: CourierOperationalAvailability;
  isAssignable: boolean;
  blockedReason: string | null;
}

export function buildCourierDispatchAvailabilityList(
  couriers: DeliveryCourierRecord[],
  dispatches: DeliveryDispatchRecord[],
): CourierDispatchAvailabilityEntry[] {
  const activeCountByCourier = new Map<string, number>();
  for (const d of dispatches) {
    if (!isActiveDispatchStatus(d.dispatchStatus)) continue;
    activeCountByCourier.set(
      d.courierId,
      (activeCountByCourier.get(d.courierId) ?? 0) + 1,
    );
  }

  const entries: CourierDispatchAvailabilityEntry[] = couriers.map((courier) => {
    const activeDeliveriesCount = activeCountByCourier.get(courier.id) ?? 0;
    const courierType = normalizeCourierType(courier.courierType);
    const courierTypeLabel = COURIER_TYPE_SPEC[courierType].label;

    if (courier.status !== 'active') {
      return {
        courier,
        courierTypeLabel,
        activeDeliveriesCount,
        operationalAvailability: 'unavailable',
        isAssignable: false,
        blockedReason: 'Entregador inativo no cadastro.',
      };
    }

    if (courier.availabilityStatus !== 'available') {
      return {
        courier,
        courierTypeLabel,
        activeDeliveriesCount,
        operationalAvailability: 'unavailable',
        isAssignable: false,
        blockedReason: 'Entregador marcado como indisponível.',
      };
    }

    if (activeDeliveriesCount > 0) {
      return {
        courier,
        courierTypeLabel,
        activeDeliveriesCount,
        operationalAvailability: 'occupied',
        isAssignable: true,
        blockedReason: null,
      };
    }

    return {
      courier,
      courierTypeLabel,
      activeDeliveriesCount: 0,
      operationalAvailability: 'available',
      isAssignable: true,
      blockedReason: null,
    };
  });

  return entries.sort((a, b) => {
    const rank = (entry: CourierDispatchAvailabilityEntry): number => {
      if (entry.operationalAvailability === 'available') return 0;
      if (entry.operationalAvailability === 'occupied') return 1;
      return 2;
    };
    const rDiff = rank(a) - rank(b);
    if (rDiff !== 0) return rDiff;
    if (a.activeDeliveriesCount !== b.activeDeliveriesCount) {
      return a.activeDeliveriesCount - b.activeDeliveriesCount;
    }
    return a.courier.name.localeCompare(b.courier.name, 'pt-BR');
  });
}

export function validateCourierAssignmentEligibility(params: {
  order: OnlineOrderRecord | null | undefined;
  courier: DeliveryCourierRecord | null | undefined;
  existingDispatches: DeliveryDispatchRecord[];
}): { valid: boolean; error?: string } {
  const { order, courier, existingDispatches } = params;

  if (!order) {
    return { valid: false, error: 'Pedido não encontrado.' };
  }
  if (order.fulfillmentType !== 'delivery') {
    return {
      valid: false,
      error: 'Pedidos de retirada no balcão não podem ser atribuídos a entregadores.',
    };
  }
  if (isTerminalOrderStatus(order.status)) {
    return {
      valid: false,
      error: 'Pedido já finalizado ou cancelado não pode receber entregador.',
    };
  }
  if (
    existingDispatches.some(
      (d) => d.orderId === order.id && isActiveDispatchStatus(d.dispatchStatus),
    )
  ) {
    return {
      valid: false,
      error: 'Este pedido já possui um entregador ativo atribuído.',
    };
  }
  if (!courier) {
    return {
      valid: false,
      error: 'Entregador não encontrado neste estabelecimento.',
    };
  }
  if (courier.tenantId !== order.tenantId) {
    return {
      valid: false,
      error: 'Entregador não pertence ao estabelecimento deste pedido.',
    };
  }
  if (courier.status !== 'active') {
    return {
      valid: false,
      error: 'Entregador inativo não pode ser atribuído a uma entrega.',
    };
  }
  if (courier.availabilityStatus !== 'available') {
    return {
      valid: false,
      error: 'Entregador indisponível no momento não pode receber entregas.',
    };
  }
  return { valid: true };
}

export interface DispatchQueueItem {
  order: OnlineOrderRecord;
  waitTimeMs: number;
  lastClosedDispatch: DeliveryDispatchRecord | null;
  wasPreviouslyRefused: boolean;
  priorityScore: number;
}

export function buildDispatchQueueItems(
  orders: OnlineOrderRecord[],
  dispatches: DeliveryDispatchRecord[],
  nowMs = Date.now(),
): DispatchQueueItem[] {
  const activeByOrder = new Set<string>();
  const latestClosedByOrder = new Map<string, DeliveryDispatchRecord>();

  for (const d of dispatches) {
    if (isActiveDispatchStatus(d.dispatchStatus)) {
      activeByOrder.add(d.orderId);
    } else {
      const prev = latestClosedByOrder.get(d.orderId);
      if (!prev || d.updatedAtMs > prev.updatedAtMs) {
        latestClosedByOrder.set(d.orderId, d);
      }
    }
  }

  const queue: DispatchQueueItem[] = [];

  for (const order of orders) {
    if (order.fulfillmentType !== 'delivery') continue;
    if (isTerminalOrderStatus(order.status)) continue;
    if (activeByOrder.has(order.id)) continue;

    const lastClosedDispatch = latestClosedByOrder.get(order.id) ?? null;
    const wasPreviouslyRefused =
      lastClosedDispatch?.dispatchStatus === 'delivery_rejected';

    const refStartMs =
      lastClosedDispatch?.rejectedAtMs ??
      lastClosedDispatch?.cancelledAtMs ??
      order.createdAtMs;
    const waitTimeMs = Math.max(0, nowMs - refStartMs);

    // Prioridade: pedido pronto ou devolvido após recusa > em preparo > aceito > recém-recebido
    let basePriority = 1;
    if (wasPreviouslyRefused || order.status === 'ready') {
      basePriority = 4;
    } else if (order.status === 'preparing') {
      basePriority = 3;
    } else if (order.status === 'accepted') {
      basePriority = 2;
    }

    queue.push({
      order,
      waitTimeMs,
      lastClosedDispatch,
      wasPreviouslyRefused,
      priorityScore: basePriority,
    });
  }

  return queue.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    if (b.waitTimeMs !== a.waitTimeMs) {
      return b.waitTimeMs - a.waitTimeMs;
    }
    return a.order.createdAtMs - b.order.createdAtMs;
  });
}

export interface DeliveryDispatchKpis {
  awaitingCourierCount: number;
  awaitingAcceptanceCount: number;
  inProgressCount: number;
  completedTodayCount: number;
  availableCouriersCount: number;
  occupiedCouriersCount: number;
}

export function computeDeliveryDispatchKpis(
  orders: OnlineOrderRecord[],
  dispatches: DeliveryDispatchRecord[],
  couriers: DeliveryCourierRecord[],
  referenceDate: string = getLocalTodayDate(),
  nowMs = Date.now(),
): DeliveryDispatchKpis {
  const queue = buildDispatchQueueItems(orders, dispatches, nowMs);
  const deliveryOrderIds = new Set(
    orders.filter((o) => o.fulfillmentType === 'delivery').map((o) => o.id),
  );

  let awaitingAcceptanceCount = 0;
  let inProgressCount = 0;
  let completedTodayCount = 0;

  for (const d of dispatches) {
    if (orders.length > 0 && !deliveryOrderIds.has(d.orderId)) {
      continue;
    }
    if (d.dispatchStatus === 'awaiting_acceptance') {
      awaitingAcceptanceCount += 1;
    } else if (IN_PROGRESS_DISPATCH_STATUSES.has(d.dispatchStatus)) {
      inProgressCount += 1;
    } else if (d.dispatchStatus === 'delivered') {
      const doneMs = d.deliveredAtMs || d.updatedAtMs || d.createdAtMs;
      if (
        Number.isFinite(doneMs) &&
        doneMs > 0 &&
        getLocalTodayDate(new Date(doneMs)) === referenceDate
      ) {
        completedTodayCount += 1;
      }
    }
  }

  const availabilityList = buildCourierDispatchAvailabilityList(
    couriers,
    dispatches,
  );
  let availableCouriersCount = 0;
  let occupiedCouriersCount = 0;

  for (const entry of availabilityList) {
    if (entry.operationalAvailability === 'available') {
      availableCouriersCount += 1;
    } else if (entry.operationalAvailability === 'occupied') {
      occupiedCouriersCount += 1;
    }
  }

  return {
    awaitingCourierCount: queue.length,
    awaitingAcceptanceCount,
    inProgressCount,
    completedTodayCount,
    availableCouriersCount,
    occupiedCouriersCount,
  };
}

export interface DispatchTrackingEntry {
  dispatch: DeliveryDispatchRecord;
  order: OnlineOrderRecord | null;
  courier: DeliveryCourierRecord | null;
  history: DeliveryDispatchHistoryRecord[];
  elapsedTimeMs: number;
}

export type DispatchStatusFilter =
  | 'active'
  | 'all'
  | DeliveryDispatchStatus;

export type DispatchPeriodFilter = 'today' | 'last7' | 'all';

export function buildDispatchTrackingEntries(params: {
  orders: OnlineOrderRecord[];
  dispatches: DeliveryDispatchRecord[];
  couriers: DeliveryCourierRecord[];
  history: DeliveryDispatchHistoryRecord[];
  nowMs?: number;
}): DispatchTrackingEntry[] {
  const nowMs = params.nowMs ?? Date.now();
  const orderById = new Map(params.orders.map((o) => [o.id, o]));
  const courierById = new Map(params.couriers.map((c) => [c.id, c]));
  const historyByDispatch = new Map<string, DeliveryDispatchHistoryRecord[]>();

  for (const h of params.history) {
    const list = historyByDispatch.get(h.dispatchId) ?? [];
    list.push(h);
    historyByDispatch.set(h.dispatchId, list);
  }
  for (const list of historyByDispatch.values()) {
    list.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  return params.dispatches
    .map((dispatch) => {
      const order = orderById.get(dispatch.orderId) ?? null;
      const courier = courierById.get(dispatch.courierId) ?? null;
      const endMs =
        dispatch.deliveredAtMs ??
        dispatch.rejectedAtMs ??
        dispatch.cancelledAtMs ??
        nowMs;
      const elapsedTimeMs = Math.max(0, endMs - dispatch.assignedAtMs);

      return {
        dispatch,
        order,
        courier,
        history: historyByDispatch.get(dispatch.id) ?? [],
        elapsedTimeMs,
      };
    })
    .filter((entry) => !entry.order || entry.order.fulfillmentType === 'delivery')
    .sort((a, b) => {
      const aActive = isActiveDispatchStatus(a.dispatch.dispatchStatus) ? 1 : 0;
      const bActive = isActiveDispatchStatus(b.dispatch.dispatchStatus) ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      return b.dispatch.assignedAtMs - a.dispatch.assignedAtMs;
    });
}

export function filterDispatchTrackingEntries(
  entries: DispatchTrackingEntry[],
  filters: {
    statusFilter: DispatchStatusFilter;
    courierIdFilter: string;
    periodFilter: DispatchPeriodFilter;
    orderNumberQuery: string;
    referenceDate?: string;
    nowMs?: number;
  },
): DispatchTrackingEntry[] {
  const referenceDate = filters.referenceDate ?? getLocalTodayDate();
  const nowMs = filters.nowMs ?? Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const query = filters.orderNumberQuery.trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, '');

  return entries.filter((entry) => {
    const { dispatch, order } = entry;

    if (filters.statusFilter === 'active') {
      if (!isActiveDispatchStatus(dispatch.dispatchStatus)) return false;
    } else if (
      filters.statusFilter !== 'all' &&
      dispatch.dispatchStatus !== filters.statusFilter
    ) {
      return false;
    }

    if (
      filters.courierIdFilter &&
      filters.courierIdFilter !== 'all' &&
      dispatch.courierId !== filters.courierIdFilter
    ) {
      return false;
    }

    if (filters.periodFilter === 'today') {
      const dateStr = getLocalTodayDate(new Date(dispatch.assignedAtMs));
      if (dateStr !== referenceDate) return false;
    } else if (filters.periodFilter === 'last7') {
      if (dispatch.assignedAtMs < sevenDaysAgoMs) return false;
    }

    if (query) {
      const orderNum = order ? String(order.orderNumber) : '';
      const orderCode = order ? formatOrderNumber(order.orderNumber).toLowerCase() : '';
      const customerName = order ? order.customerName.toLowerCase() : '';
      const courierName = (
        entry.courier?.name || dispatch.courierNameSnapshot
      ).toLowerCase();

      const matchesOrderNum =
        Boolean(queryDigits) &&
        (orderNum === queryDigits ||
          orderNum.padStart(4, '0').includes(queryDigits));
      const matchesText =
        orderCode.includes(query) ||
        customerName.includes(query) ||
        courierName.includes(query);

      if (!matchesOrderNum && !matchesText) return false;
    }

    return true;
  });
}

export interface DispatchProgressionAction {
  kind: 'accept' | 'reject' | 'advance' | 'reassign' | 'cancel';
  nextStatus?: DeliveryDispatchStatus;
  label: string;
  tone: 'primary' | 'success' | 'danger' | 'neutral';
  requiresReason: boolean;
}

export function getNextDispatchActions(
  dispatchStatus: DeliveryDispatchStatus,
  orderStatus?: OnlineOrderStatus,
): DispatchProgressionAction[] {
  if (isTerminalDispatchStatus(dispatchStatus)) {
    return [];
  }

  switch (dispatchStatus) {
    case 'awaiting_acceptance':
      return [
        {
          kind: 'accept',
          nextStatus: 'delivery_accepted',
          label: 'Registrar aceite',
          tone: 'success',
          requiresReason: false,
        },
        {
          kind: 'reject',
          nextStatus: 'delivery_rejected',
          label: 'Registrar recusa',
          tone: 'danger',
          requiresReason: true,
        },
        {
          kind: 'reassign',
          label: 'Reatribuir',
          tone: 'neutral',
          requiresReason: false,
        },
        {
          kind: 'cancel',
          nextStatus: 'delivery_cancelled',
          label: 'Cancelar envio',
          tone: 'danger',
          requiresReason: true,
        },
      ];
    case 'delivery_accepted': {
      const primaryAdvance: DispatchProgressionAction =
        orderStatus === 'ready'
          ? {
              kind: 'advance',
              nextStatus: 'out_for_delivery',
              label: 'Saiu para entrega',
              tone: 'primary',
              requiresReason: false,
            }
          : orderStatus === 'preparing'
            ? {
                kind: 'advance',
                nextStatus: 'ready_for_dispatch',
                label: 'Pronto para retirada',
                tone: 'primary',
                requiresReason: false,
              }
            : {
                kind: 'advance',
                nextStatus: 'preparing',
                label: 'Em preparação',
                tone: 'primary',
                requiresReason: false,
              };

      return [
        primaryAdvance,
        {
          kind: 'reassign',
          label: 'Reatribuir',
          tone: 'neutral',
          requiresReason: false,
        },
        {
          kind: 'cancel',
          nextStatus: 'delivery_cancelled',
          label: 'Cancelar envio',
          tone: 'danger',
          requiresReason: true,
        },
      ];
    }
    case 'preparing':
      return [
        {
          kind: 'advance',
          nextStatus: 'ready_for_dispatch',
          label: 'Pronto para retirada',
          tone: 'primary',
          requiresReason: false,
        },
        {
          kind: 'reassign',
          label: 'Reatribuir',
          tone: 'neutral',
          requiresReason: false,
        },
        {
          kind: 'cancel',
          nextStatus: 'delivery_cancelled',
          label: 'Cancelar envio',
          tone: 'danger',
          requiresReason: true,
        },
      ];
    case 'ready_for_dispatch':
      return [
        {
          kind: 'advance',
          nextStatus: 'out_for_delivery',
          label: 'Saiu para entrega',
          tone: 'primary',
          requiresReason: false,
        },
        {
          kind: 'reassign',
          label: 'Reatribuir',
          tone: 'neutral',
          requiresReason: false,
        },
        {
          kind: 'cancel',
          nextStatus: 'delivery_cancelled',
          label: 'Cancelar envio',
          tone: 'danger',
          requiresReason: true,
        },
      ];
    case 'out_for_delivery':
      return [
        {
          kind: 'advance',
          nextStatus: 'delivered',
          label: 'Confirmar entrega',
          tone: 'success',
          requiresReason: false,
        },
        {
          kind: 'cancel',
          nextStatus: 'delivery_cancelled',
          label: 'Cancelar envio',
          tone: 'danger',
          requiresReason: true,
        },
      ];
    default:
      return [];
  }
}

export function formatElapsedDurationLabel(durationMs: number): string {
  const safeMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${hours}h`;
}

export function buildCourierWhatsappDispatchUrl(params: {
  courierPhone: string;
  courierName: string;
  order: OnlineOrderRecord;
  storeName: string;
}): string | null {
  const orderCode = formatOrderNumber(params.order.orderNumber);
  const paymentLine =
    params.order.paymentMethod === 'Dinheiro' && params.order.changeFor
      ? `${params.order.paymentMethod} (Troco p/ ${formatCurrencyBRL(params.order.changeFor)})`
      : params.order.paymentMethod;

  const lines = [
    `Olá ${params.courierName}! Nova entrega *${params.storeName}*`,
    `Pedido: *${orderCode}*`,
    `Cliente: ${params.order.customerName} (${params.order.customerPhone})`,
    `Endereço: ${params.order.deliveryAddress || 'Não informado'}`,
    params.order.deliveryReference
      ? `Referência: ${params.order.deliveryReference}`
      : '',
    `Total: *${formatCurrencyBRL(params.order.totalAmount)}* · Pagamento: ${paymentLine}`,
    params.order.customerNote ? `Obs.: ${params.order.customerNote}` : '',
    `Por favor, confirme o aceite da entrega.`,
  ].filter(Boolean);

  return buildWhatsappUrl(params.courierPhone, lines.join('\n'));
}
