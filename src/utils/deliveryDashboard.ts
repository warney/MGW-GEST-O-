import type {
  DeliveryCourierRecord,
  DeliveryCustomerRecord,
  DeliveryDispatchRecord,
  DeliveryRegionRecord,
  DigitalMenuSettings,
  OnlineOrderRecord,
} from '../types/finance';
import { getLocalTodayDate } from './finance';
import { isActiveOrderStatus } from './onlineOrders';

export type DeliveryQuickAccessModuleId =
  | 'customers'
  | 'couriers'
  | 'dispatch'
  | 'regions_fees'
  | 'finance'
  | 'tracking'
  | 'reports';

export interface DeliveryQuickAccessModule {
  id: DeliveryQuickAccessModuleId;
  title: string;
  description: string;
}

export const DELIVERY_QUICK_ACCESS_MODULES: readonly DeliveryQuickAccessModule[] = [
  {
    id: 'customers',
    title: 'Clientes',
    description: 'Cadastro de clientes, telefones e endereços salvos.',
  },
  {
    id: 'couriers',
    title: 'Entregadores',
    description: 'Equipe de entrega, disponibilidade e escala.',
  },
  {
    id: 'dispatch',
    title: 'Central de despacho',
    description: 'Atribuição de pedidos e organização de saídas.',
  },
  {
    id: 'regions_fees',
    title: 'Regiões e taxas',
    description: 'Bairros atendidos e regras de taxa de entrega.',
  },
  {
    id: 'finance',
    title: 'Financeiro',
    description: 'Controle de taxas, repasses e acerto diário.',
  },
  {
    id: 'tracking',
    title: 'Rastreamento',
    description: 'Acompanhamento de rotas e entregas em campo.',
  },
  {
    id: 'reports',
    title: 'Relatórios',
    description: 'Desempenho, regiões, entregadores e inteligência de clientes.',
  },
];

export interface DeliveryDashboardSummary {
  deliveryOrdersTodayCount: number;
  pendingAcceptanceCount: number;
  inProgressDeliveriesCount: number;
  outForDeliveryCount: number;
  completedDeliveriesCount: number;
  completedDeliveriesTodayCount: number;
  availableCouriersCount: number;
  awaitingDispatchCount: number;
  registeredCustomersCount: number;
  configuredRegionsCount: number;
  activeRegionsCount: number;
  suspendedRegionsCount: number;
  couriersModuleReady: boolean;
  customersModuleReady: boolean;
  dispatchModuleReady: boolean;
  regionsModuleReady: boolean;
  recentDeliveryOrders: OnlineOrderRecord[];
  totalDeliveryOrdersCount: number;
  pickupOrdersExcludedCount: number;
  configuredDeliveryFee: number;
  acceptsDelivery: boolean;
}

/**
 * Calcula indicadores reais exclusivos de Delivery a partir dos pedidos online,
 * clientes, entregadores, despachos e regioes do tenant ativo.
 * Pedidos com retirada no balcao ('pickup') nunca sao contabilizados aqui.
 */
export function computeDeliveryDashboardSummary(
  orders: OnlineOrderRecord[],
  digitalMenuSettings?: Pick<
    DigitalMenuSettings,
    'deliveryFee' | 'acceptsDelivery'
  > | null,
  referenceDate: string = getLocalTodayDate(),
  recentLimit = 8,
  customers: Pick<DeliveryCustomerRecord, 'id'>[] = [],
  couriers: Pick<DeliveryCourierRecord, 'id' | 'status' | 'availabilityStatus'>[] = [],
  dispatches: Pick<DeliveryDispatchRecord, 'orderId' | 'dispatchStatus'>[] = [],
  regions: Pick<DeliveryRegionRecord, 'id' | 'status' | 'isTemporarilySuspended'>[] = [],
): DeliveryDashboardSummary {
  let deliveryOrdersTodayCount = 0;
  let pendingAcceptanceCount = 0;
  let inProgressDeliveriesCount = 0;
  let outForDeliveryCount = 0;
  let completedDeliveriesCount = 0;
  let completedDeliveriesTodayCount = 0;
  let pickupOrdersExcludedCount = 0;
  let awaitingDispatchCount = 0;

  const activeDispatchOrderIds = new Set(
    dispatches
      .filter(
        (d) =>
          d.dispatchStatus !== 'delivered' &&
          d.dispatchStatus !== 'delivery_rejected' &&
          d.dispatchStatus !== 'delivery_cancelled',
      )
      .map((d) => d.orderId),
  );

  const deliveryOrders: OnlineOrderRecord[] = [];

  for (const order of orders) {
    if (order.fulfillmentType !== 'delivery') {
      pickupOrdersExcludedCount += 1;
      continue;
    }

    deliveryOrders.push(order);

    if (Number.isFinite(order.createdAtMs) && order.createdAtMs > 0) {
      if (getLocalTodayDate(new Date(order.createdAtMs)) === referenceDate) {
        deliveryOrdersTodayCount += 1;
      }
    }

    if (order.status === 'received') {
      pendingAcceptanceCount += 1;
    } else if (isActiveOrderStatus(order.status)) {
      inProgressDeliveriesCount += 1;
      if (order.status === 'out_for_delivery') {
        outForDeliveryCount += 1;
      }
    } else if (order.status === 'completed') {
      completedDeliveriesCount += 1;
      const doneMs =
        order.completedAtMs || order.updatedAtMs || order.createdAtMs;
      if (Number.isFinite(doneMs) && doneMs > 0) {
        if (getLocalTodayDate(new Date(doneMs)) === referenceDate) {
          completedDeliveriesTodayCount += 1;
        }
      }
    }

    if (
      order.status !== 'completed' &&
      order.status !== 'rejected' &&
      order.status !== 'cancelled' &&
      !activeDispatchOrderIds.has(order.id)
    ) {
      awaitingDispatchCount += 1;
    }
  }

  const recentDeliveryOrders = [...deliveryOrders]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, Math.max(1, Math.trunc(recentLimit)));

  const rawFee = Number(digitalMenuSettings?.deliveryFee ?? 0);
  const configuredDeliveryFee =
    Number.isFinite(rawFee) && rawFee > 0 ? rawFee : 0;

  const availableCouriersCount = couriers.filter(
    (c) => c.status === 'active' && c.availabilityStatus === 'available',
  ).length;

  const activeRegionsCount = regions.filter(
    (r) => r.status === 'active' && !r.isTemporarilySuspended,
  ).length;
  const suspendedRegionsCount = regions.filter(
    (r) => r.status === 'inactive' || r.isTemporarilySuspended,
  ).length;

  return {
    deliveryOrdersTodayCount,
    pendingAcceptanceCount,
    inProgressDeliveriesCount,
    outForDeliveryCount,
    completedDeliveriesCount,
    completedDeliveriesTodayCount,
    availableCouriersCount,
    awaitingDispatchCount,
    registeredCustomersCount: customers.length,
    configuredRegionsCount: regions.length,
    activeRegionsCount,
    suspendedRegionsCount,
    couriersModuleReady: true,
    customersModuleReady: true,
    dispatchModuleReady: true,
    regionsModuleReady: true,
    recentDeliveryOrders,
    totalDeliveryOrdersCount: deliveryOrders.length,
    pickupOrdersExcludedCount,
    configuredDeliveryFee,
    acceptsDelivery: digitalMenuSettings?.acceptsDelivery ?? true,
  };
}
