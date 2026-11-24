import type {
  DeliveryCustomerRecord,
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
    description: 'Indicadores de volume, tempo e regiões de entrega.',
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
  registeredCustomersCount: number;
  couriersModuleReady: boolean;
  customersModuleReady: boolean;
  recentDeliveryOrders: OnlineOrderRecord[];
  totalDeliveryOrdersCount: number;
  pickupOrdersExcludedCount: number;
  configuredDeliveryFee: number;
  acceptsDelivery: boolean;
}

/**
 * Calcula indicadores reais exclusivos de Delivery a partir dos pedidos online do tenant ativo.
 * Pedidos com retirada no balcao ('pickup') nunca sao contabilizados aqui.
 * Indicadores sem tabela implementada (entregadores) retornam 0 real sem simulacao.
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
): DeliveryDashboardSummary {
  let deliveryOrdersTodayCount = 0;
  let pendingAcceptanceCount = 0;
  let inProgressDeliveriesCount = 0;
  let outForDeliveryCount = 0;
  let completedDeliveriesCount = 0;
  let completedDeliveriesTodayCount = 0;
  let pickupOrdersExcludedCount = 0;

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
  }

  const recentDeliveryOrders = [...deliveryOrders]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, Math.max(1, Math.trunc(recentLimit)));

  const rawFee = Number(digitalMenuSettings?.deliveryFee ?? 0);
  const configuredDeliveryFee =
    Number.isFinite(rawFee) && rawFee > 0 ? rawFee : 0;

  return {
    deliveryOrdersTodayCount,
    pendingAcceptanceCount,
    inProgressDeliveriesCount,
    outForDeliveryCount,
    completedDeliveriesCount,
    completedDeliveriesTodayCount,
    availableCouriersCount: 0,
    registeredCustomersCount: customers.length,
    couriersModuleReady: false,
    customersModuleReady: true,
    recentDeliveryOrders,
    totalDeliveryOrdersCount: deliveryOrders.length,
    pickupOrdersExcludedCount,
    configuredDeliveryFee,
    acceptsDelivery: digitalMenuSettings?.acceptsDelivery ?? true,
  };
}
