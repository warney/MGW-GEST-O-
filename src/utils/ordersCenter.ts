import type {
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import { addDays, getLocalTodayDate } from './finance';
import {
  formatOrderNumber,
  isUnreadNewOrder,
  ORDER_STATUS_LABELS,
} from './onlineOrders';

export type OrdersCenterFilterTab =
  | 'all'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'received'
  | 'accepted'
  | 'dispatch'
  | 'closed';

export interface OrdersCenterFilterOption {
  id: OrdersCenterFilterTab;
  label: string;
}

export const PRIMARY_ORDER_FILTER_TABS: readonly OrdersCenterFilterOption[] = [
  { id: 'all', label: 'Todos' },
  { id: 'preparing', label: 'Em Preparo' },
  { id: 'ready', label: 'Prontos' },
  { id: 'completed', label: 'Entregues' },
];

export const SECONDARY_ORDER_FILTER_TABS: readonly OrdersCenterFilterOption[] = [
  { id: 'received', label: 'Novos' },
  { id: 'accepted', label: 'Aceitos' },
  { id: 'dispatch', label: 'Entrega / Retirada' },
  { id: 'closed', label: 'Recusados / Cancelados' },
];

export interface OrdersCenterSummary {
  totalCount: number;
  receivedTodayCount: number;
  receivedYesterdayCount: number;
  todayDeltaPct: number | null;
  receivedCount: number;
  acceptedCount: number;
  preparingCount: number;
  pendingBeforePrepCount: number;
  readyCount: number;
  dispatchCount: number;
  completedCount: number;
  completedTodayCount: number;
  closedCount: number;
  unviewedCount: number;
  countsByTab: Record<OrdersCenterFilterTab, number>;
}

/**
 * Calcula os indicadores reais da Central de Pedidos garantindo que cada pedido
 * seja contabilizado em apenas um status operacional (sem dupla contagem).
 */
export function computeOrdersCenterSummary(
  orders: OnlineOrderRecord[],
  referenceDate: string = getLocalTodayDate(),
): OrdersCenterSummary {
  const yesterday = addDays(referenceDate, -1);

  let receivedTodayCount = 0;
  let receivedYesterdayCount = 0;
  let receivedCount = 0;
  let acceptedCount = 0;
  let preparingCount = 0;
  let readyCount = 0;
  let dispatchCount = 0;
  let completedCount = 0;
  let completedTodayCount = 0;
  let closedCount = 0;
  let unviewedCount = 0;

  for (const order of orders) {
    if (Number.isFinite(order.createdAtMs) && order.createdAtMs > 0) {
      const orderDay = getLocalTodayDate(new Date(order.createdAtMs));
      if (orderDay === referenceDate) {
        receivedTodayCount += 1;
      } else if (orderDay === yesterday) {
        receivedYesterdayCount += 1;
      }
    }

    switch (order.status) {
      case 'received':
        receivedCount += 1;
        if (isUnreadNewOrder(order)) {
          unviewedCount += 1;
        }
        break;
      case 'accepted':
        acceptedCount += 1;
        break;
      case 'preparing':
        preparingCount += 1;
        break;
      case 'ready':
        readyCount += 1;
        break;
      case 'out_for_delivery':
      case 'ready_for_pickup':
        dispatchCount += 1;
        break;
      case 'completed': {
        completedCount += 1;
        const doneMs = order.completedAtMs || order.updatedAtMs || order.createdAtMs;
        if (Number.isFinite(doneMs) && doneMs > 0) {
          if (getLocalTodayDate(new Date(doneMs)) === referenceDate) {
            completedTodayCount += 1;
          }
        }
        break;
      }
      case 'rejected':
      case 'cancelled':
        closedCount += 1;
        break;
    }
  }

  const todayDeltaPct =
    receivedYesterdayCount > 0
      ? Number(
          (
            ((receivedTodayCount - receivedYesterdayCount) /
              receivedYesterdayCount) *
            100
          ).toFixed(1),
        )
      : null;

  const countsByTab: Record<OrdersCenterFilterTab, number> = {
    all: orders.length,
    preparing: preparingCount,
    ready: readyCount,
    completed: completedCount,
    received: receivedCount,
    accepted: acceptedCount,
    dispatch: dispatchCount,
    closed: closedCount,
  };

  return {
    totalCount: orders.length,
    receivedTodayCount,
    receivedYesterdayCount,
    todayDeltaPct,
    receivedCount,
    acceptedCount,
    preparingCount,
    pendingBeforePrepCount: receivedCount + acceptedCount,
    readyCount,
    dispatchCount,
    completedCount,
    completedTodayCount,
    closedCount,
    unviewedCount,
    countsByTab,
  };
}

export function matchesOrderFilterTab(
  order: Pick<OnlineOrderRecord, 'status'>,
  tab: OrdersCenterFilterTab,
): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'received':
      return order.status === 'received';
    case 'accepted':
      return order.status === 'accepted';
    case 'preparing':
      return order.status === 'preparing';
    case 'ready':
      return order.status === 'ready';
    case 'dispatch':
      return (
        order.status === 'out_for_delivery' ||
        order.status === 'ready_for_pickup'
      );
    case 'completed':
      return order.status === 'completed';
    case 'closed':
      return order.status === 'rejected' || order.status === 'cancelled';
  }
}

export function filterAndSearchOrders(
  orders: OnlineOrderRecord[],
  tab: OrdersCenterFilterTab,
  searchQuery = '',
): OnlineOrderRecord[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const digitsQuery = normalizedQuery.replace(/\D/g, '');

  return orders.filter((order) => {
    if (!matchesOrderFilterTab(order, tab)) return false;
    if (!normalizedQuery) return true;

    const orderNumFormatted = formatOrderNumber(order.orderNumber).toLowerCase();
    const orderNumRaw = String(order.orderNumber);
    const customer = order.customerName.toLowerCase();
    const phone = order.customerPhone.toLowerCase();
    const itemsText = order.items.map((i) => i.itemName.toLowerCase()).join(' ');

    return (
      orderNumFormatted.includes(normalizedQuery) ||
      (digitsQuery.length > 0 && orderNumRaw.includes(digitsQuery)) ||
      customer.includes(normalizedQuery) ||
      phone.includes(normalizedQuery) ||
      itemsText.includes(normalizedQuery)
    );
  });
}

export function summarizeOrderItems(
  order: Pick<OnlineOrderRecord, 'items'>,
): { totalUnits: number; countLabel: string; previewText: string } {
  let totalUnits = 0;
  const parts: string[] = [];

  for (const item of order.items) {
    const qty = Math.max(1, Math.trunc(Number(item.quantity) || 1));
    totalUnits += qty;
    parts.push(`${qty}x ${item.itemName}`);
  }

  const countLabel =
    totalUnits === 1 ? '1 item' : `${totalUnits} itens`;
  const previewText = parts.join(', ');

  return { totalUnits, countLabel, previewText };
}

export type OrderBadgeVariant =
  | 'amber'
  | 'orange'
  | 'green'
  | 'blue'
  | 'danger';

export interface OrderStatusBadgeSpec {
  label: string;
  variant: OrderBadgeVariant;
  containerClass: string;
}

export function getOrderStatusBadgeSpec(
  status: OnlineOrderStatus,
): OrderStatusBadgeSpec {
  const label = ORDER_STATUS_LABELS[status];
  switch (status) {
    case 'received':
      return {
        label,
        variant: 'amber',
        containerClass:
          'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]',
      };
    case 'preparing':
      return {
        label,
        variant: 'orange',
        containerClass:
          'bg-[#FFF7ED] border-[#FED7AA] text-[#C2410C]',
      };
    case 'ready':
      return {
        label,
        variant: 'green',
        containerClass:
          'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]',
      };
    case 'accepted':
    case 'out_for_delivery':
    case 'ready_for_pickup':
    case 'completed':
      return {
        label,
        variant: 'blue',
        containerClass:
          'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]',
      };
    case 'rejected':
    case 'cancelled':
      return {
        label,
        variant: 'danger',
        containerClass:
          'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
      };
  }
}

export function formatOrdersDeltaBR(deltaPct: number): string {
  const absFormatted = Math.abs(deltaPct).toFixed(1).replace('.', ',');
  return `${deltaPct >= 0 ? '+' : '-'}${absFormatted}%`;
}

export function paginateOrders(
  orders: OnlineOrderRecord[],
  page: number,
  pageSize = 15,
): {
  items: OnlineOrderRecord[];
  safePage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
} {
  const safeSize = Math.max(1, Math.trunc(pageSize));
  const totalItems = orders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), totalPages);
  const startIndex = (safePage - 1) * safeSize;
  const items = orders.slice(startIndex, startIndex + safeSize);
  const endIndex = startIndex + items.length;

  return {
    items,
    safePage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  };
}
