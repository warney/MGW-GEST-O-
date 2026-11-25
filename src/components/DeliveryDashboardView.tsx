import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bike,
  CheckCircle2,
  MapPin,
  Motorbike,
  Navigation,
  Package,
  RefreshCw,
  Route,
  Send,
  Settings,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  DeliveryCourierRecord,
  DeliveryCustomerRecord,
  DeliveryDispatchRecord,
  DeliveryRegionRecord,
  DigitalMenuSettings,
  OnlineOrderRecord,
} from '../types/finance';
import { formatCurrencyBRL, getLocalTodayDate } from '../utils/finance';
import { formatOrderNumber, formatTimeBR } from '../utils/onlineOrders';
import { getOrderStatusBadgeSpec } from '../utils/ordersCenter';
import {
  computeDeliveryDashboardSummary,
  DELIVERY_QUICK_ACCESS_MODULES,
  type DeliveryQuickAccessModuleId,
} from '../utils/deliveryDashboard';

interface DeliveryDashboardViewProps {
  establishmentName: string;
  orders: OnlineOrderRecord[];
  customers?: DeliveryCustomerRecord[];
  couriers?: DeliveryCourierRecord[];
  dispatches?: DeliveryDispatchRecord[];
  regions?: DeliveryRegionRecord[];
  digitalMenuSettings: DigitalMenuSettings;
  isLoading?: boolean;
  errorMessage?: string | null;
  canOpenOrders?: boolean;
  canManageDigitalMenu?: boolean;
  onRefreshOrders?: () => Promise<void> | void;
  onOpenOrders?: () => void;
  onOpenCustomers?: () => void;
  onOpenCouriers?: () => void;
  onOpenDispatch?: () => void;
  onOpenRegions?: () => void;
  onOpenDigitalMenuSettings?: () => void;
}

const MODULE_ICON_MAP: Record<
  DeliveryQuickAccessModuleId,
  typeof Users
> = {
  customers: Users,
  couriers: Motorbike,
  dispatch: Send,
  regions_fees: MapPin,
  finance: Wallet,
  tracking: Route,
  reports: BarChart3,
};

function DeliveryDashboardSkeleton() {
  return (
    <div
      className="space-y-5 sm:space-y-6"
      aria-busy="true"
      aria-label="Carregando MGW Delivery"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-4 w-44 rounded-lg" />
          <div className="mgw-skeleton h-8 w-56 rounded-lg" />
          <div className="mgw-skeleton h-4 w-80 max-w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-28 rounded-xl" />
          <div className="mgw-skeleton h-10 w-44 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="mgw-skeleton h-[138px] rounded-2xl" />
        ))}
      </div>

      <div className="mgw-skeleton h-[280px] w-full rounded-2xl" />
      <div className="mgw-skeleton h-[220px] w-full rounded-2xl" />
    </div>
  );
}

export function DeliveryDashboardView({
  establishmentName,
  orders,
  customers = [],
  couriers = [],
  dispatches = [],
  regions = [],
  digitalMenuSettings,
  isLoading = false,
  errorMessage = null,
  canOpenOrders = true,
  canManageDigitalMenu = false,
  onRefreshOrders,
  onOpenOrders,
  onOpenCustomers,
  onOpenCouriers,
  onOpenDispatch,
  onOpenRegions,
  onOpenDigitalMenuSettings,
}: DeliveryDashboardViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const today = getLocalTodayDate();

  const summary = useMemo(
    () =>
      computeDeliveryDashboardSummary(
        orders,
        digitalMenuSettings,
        today,
        8,
        customers,
        couriers,
        dispatches,
        regions,
      ),
    [orders, digitalMenuSettings, today, customers, couriers, dispatches, regions],
  );

  const displayEstablishment =
    establishmentName.trim() ||
    digitalMenuSettings.storeName.trim() ||
    'Seu estabelecimento';

  async function handleRefreshClick() {
    if (!onRefreshOrders || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await onRefreshOrders();
    } catch (err) {
      setRefreshError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar os dados de entrega.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isLoading) {
    return <DeliveryDashboardSkeleton />;
  }

  const combinedError = refreshError || errorMessage;

  return (
    <div className="space-y-5 sm:space-y-6">
      {combinedError && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#B91C1C] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Não foi possível sincronizar os pedidos de delivery: {combinedError}
            </span>
          </div>
          {onRefreshOrders && (
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={isRefreshing}
              className="min-h-[34px] px-3 rounded-lg bg-white border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer shrink-0 whitespace-nowrap"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* 1. Cabeçalho do Módulo MGW Delivery */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(23,32,51,0.04)]">
            <Motorbike className="w-6 h-6" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#778094]">
              <span className="font-semibold text-[#8A6200]">
                Módulo de Logística e Entregas
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate font-medium text-[#172033]">
                {displayEstablishment}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-0.5">
              MGW Delivery
            </h2>
            <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
              Central de gerenciamento de entregas do seu estabelecimento.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
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
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
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

      {!summary.acceptsDelivery && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-[#92400E] min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-[#B45309]" />
            <span>
              A opção de entrega está desativada nas configurações do Cardápio Digital de{' '}
              <strong className="font-semibold text-[#172033]">
                {displayEstablishment}
              </strong>
              .
            </span>
          </div>

          {canManageDigitalMenu && onOpenDigitalMenuSettings && (
            <button
              type="button"
              onClick={onOpenDigitalMenuSettings}
              className="min-h-[36px] px-3 rounded-xl bg-white border border-[#FDE68A] hover:bg-[#FEF3C7] text-[#92400E] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Configurar entrega</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Indicadores Principais */}
      <section
        aria-label="Indicadores do MGW Delivery"
        className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4"
      >
        {/* Card 1 — Pedidos de delivery hoje */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#B38300] flex items-center justify-center shrink-0">
              <Motorbike className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              Hoje
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Pedidos de delivery hoje
            </p>
            <p
              data-testid="delivery-kpi-today"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.deliveryOrdersTodayCount}
            </p>
            <p className="text-[11px] sm:text-xs text-[#778094] mt-1.5 truncate">
              {summary.pendingAcceptanceCount > 0
                ? `${summary.pendingAcceptanceCount} aguardando confirmação`
                : 'Somente entregas · exclui retirada'}
            </p>
          </div>
        </article>

        {/* Card 2 — Entregas em andamento */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#3478E5] flex items-center justify-center shrink-0">
              <Navigation className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              Operação ativa
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregas em andamento
            </p>
            <p
              data-testid="delivery-kpi-in-progress"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.inProgressDeliveriesCount}
            </p>
            <p className="text-[11px] sm:text-xs text-[#778094] mt-1.5 truncate">
              {summary.outForDeliveryCount > 0
                ? `${summary.outForDeliveryCount} em rota de entrega`
                : 'Aceitos, em preparo ou prontos'}
            </p>
          </div>
        </article>

        {/* Card 3 — Entregas concluídas */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]/70 text-[#16A36A] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              Finalizadas
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregas concluídas
            </p>
            <p
              data-testid="delivery-kpi-completed"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.completedDeliveriesCount}
            </p>
            <p className="text-[11px] sm:text-xs text-[#778094] mt-1.5 truncate">
              {summary.completedDeliveriesTodayCount > 0
                ? `${summary.completedDeliveriesTodayCount} concluídas hoje`
                : 'Total de entregas finalizadas'}
            </p>
          </div>
        </article>

        {/* Card 4 — Entregadores disponíveis */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#B38300] flex items-center justify-center shrink-0">
              <Bike className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              Equipe ativa
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregadores disponíveis
            </p>
            <p
              data-testid="delivery-kpi-couriers"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.availableCouriersCount}
            </p>
            {onOpenCouriers ? (
              <button
                type="button"
                onClick={onOpenCouriers}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#8A6200] hover:text-[#172033] cursor-pointer transition-colors"
              >
                <span>Ver entregadores</span>
                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              </button>
            ) : (
              <p className="text-[11px] sm:text-xs text-[#778094] mt-1.5 truncate">
                {couriers.length > 0
                  ? `${couriers.length} entregador(es) cadastrado(s)`
                  : 'Equipe de entrega integrada'}
              </p>
            )}
          </div>
        </article>

        {/* Card 5 — Total de clientes cadastrados */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px] min-[480px]:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#B38300] flex items-center justify-center shrink-0">
              <UserCheck className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              Carteira ativa
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Total de clientes cadastrados
            </p>
            <p
              data-testid="delivery-kpi-customers"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {summary.registeredCustomersCount}
            </p>
            {onOpenCustomers ? (
              <button
                type="button"
                onClick={onOpenCustomers}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#8A6200] hover:text-[#172033] cursor-pointer transition-colors"
              >
                <span>Ver carteira de clientes</span>
                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              </button>
            ) : (
              <p className="text-[11px] sm:text-xs text-[#778094] mt-1.5 truncate">
                Base de clientes integrada ao cardápio
              </p>
            )}
          </div>
        </article>
      </section>

      {/* 3. Área Operacional — Pedidos Recentes de Delivery */}
      <section
        aria-label="Pedidos recentes de delivery"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#172033] tracking-tight">
              Pedidos recentes de delivery
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Exibe apenas pedidos com entrega no endereço · pedidos de retirada no balcão não são contabilizados.
            </p>
          </div>

          {canOpenOrders && onOpenOrders && (
            <button
              type="button"
              onClick={onOpenOrders}
              className="mgw-btn-secondary whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <span>Gerenciar entregas</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {summary.recentDeliveryOrders.length === 0 ? (
          <div
            data-testid="delivery-empty-state"
            className="px-6 py-12 text-center flex flex-col items-center justify-center max-w-md mx-auto"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mb-3">
              <Package className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-[#172033]">
              Nenhum pedido de delivery registrado ainda
            </p>
            <p className="text-xs text-[#778094] mt-1 leading-relaxed">
              Quando clientes realizarem pedidos com entrega em{' '}
              <strong className="font-semibold text-[#172033]">
                {displayEstablishment}
              </strong>
              , eles aparecerão aqui em tempo real.
            </p>
            {canOpenOrders && onOpenOrders && (
              <button
                type="button"
                onClick={onOpenOrders}
                className="mt-4 mgw-btn-secondary whitespace-nowrap"
              >
                Ver Central de Pedidos
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8EAF0] bg-[#F7F8FC] text-[11px] font-semibold text-[#778094]">
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Pedido</th>
                  <th className="py-3 px-4 whitespace-nowrap">Cliente</th>
                  <th className="py-3 px-4">Endereço de entrega</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Taxa</th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF0] text-xs sm:text-[13px]">
                {summary.recentDeliveryOrders.map((order) => {
                  const statusSpec = getOrderStatusBadgeSpec(order.status);
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-[#F7F8FC]/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap align-top">
                        <span className="font-bold font-mono tabular-nums text-[#172033]">
                          {formatOrderNumber(order.orderNumber)}
                        </span>
                        <span className="block text-[11px] font-mono tabular-nums text-[#778094] mt-0.5">
                          {formatTimeBR(order.createdAtMs)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-[180px]">
                        <span className="block font-semibold text-[#172033] truncate">
                          {order.customerName}
                        </span>
                        {order.customerPhone && (
                          <span className="block text-[11px] font-mono tabular-nums text-[#778094] truncate mt-0.5">
                            {order.customerPhone}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top min-w-[200px] max-w-[320px]">
                        <span className="block text-[#172033] truncate">
                          {order.deliveryAddress || 'Endereço não informado'}
                        </span>
                        {order.deliveryReference && (
                          <span className="block text-[11px] text-[#778094] truncate mt-0.5">
                            Ref.: {order.deliveryReference}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${statusSpec.containerClass}`}
                        >
                          {statusSpec.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap align-top font-mono tabular-nums text-[#778094]">
                        {formatCurrencyBRL(order.deliveryFee)}
                      </td>

                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap align-top font-bold font-mono tabular-nums text-[#172033]">
                        {formatCurrencyBRL(order.totalAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Acesso Rápido — Estrutura Preparada para as Próximas Etapas */}
      <section aria-label="Acesso rápido aos futuros recursos do MGW Delivery" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
          <div>
            <h3 className="text-base font-bold text-[#172033] tracking-tight">
              Acesso rápido e estrutura do módulo
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Recursos planejados para implantação nas próximas etapas do MGW Delivery.
            </p>
          </div>
          {summary.configuredDeliveryFee > 0 && (
            <p className="text-xs text-[#778094] font-mono tabular-nums">
              Taxa padrão configurada: {formatCurrencyBRL(summary.configuredDeliveryFee)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {DELIVERY_QUICK_ACCESS_MODULES.map((item) => {
            const Icon = MODULE_ICON_MAP[item.id];
            const isCustomersModule = item.id === 'customers';
            const isCouriersModule = item.id === 'couriers';
            const isDispatchModule = item.id === 'dispatch';
            const isRegionsModule = item.id === 'regions_fees';
            const isActiveModule =
              isCustomersModule ||
              isCouriersModule ||
              isDispatchModule ||
              isRegionsModule;
            const actionHandler = isCustomersModule
              ? onOpenCustomers
              : isCouriersModule
                ? onOpenCouriers
                : isDispatchModule
                  ? onOpenDispatch
                  : isRegionsModule
                    ? onOpenRegions
                    : undefined;

            const extraDetail = isCustomersModule
              ? summary.registeredCustomersCount > 0
                ? `${summary.registeredCustomersCount} cliente(s) cadastrado(s)`
                : 'Módulo ativo · Carteira de clientes'
              : isCouriersModule
                ? couriers.length > 0
                  ? `${summary.availableCouriersCount} disponível(is) · ${couriers.length} cadastrado(s)`
                  : 'Módulo ativo · Equipe de entrega'
                : isDispatchModule
                  ? summary.awaitingDispatchCount > 0
                    ? `${summary.awaitingDispatchCount} pedido(s) aguardando despacho`
                    : 'Módulo ativo · Distribuição de entregas'
                  : isRegionsModule
                    ? summary.configuredRegionsCount > 0
                      ? `${summary.activeRegionsCount} ativa(s) · ${summary.configuredRegionsCount} região(ões)`
                      : summary.configuredDeliveryFee > 0
                        ? `Taxa padrão: ${formatCurrencyBRL(summary.configuredDeliveryFee)} · Configure regiões`
                        : 'Módulo ativo · Áreas, bairros e taxas'
                    : 'Em desenvolvimento · Próximas etapas';

            return (
              <article
                key={item.id}
                className={`bg-white border rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.03)] flex flex-col justify-between gap-3 ${
                  isActiveModule
                    ? 'border-[#FDE68A] hover:border-[#F5B900] transition-colors'
                    : 'border-[#E8EAF0]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                      isActiveModule
                        ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#B38300]'
                        : 'bg-[#F5F6FA] border-[#E8EAF0] text-[#778094]'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#172033] leading-snug">
                      {item.title}
                    </h4>
                    <p className="text-xs text-[#778094] mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {actionHandler ? (
                  <button
                    type="button"
                    onClick={actionHandler}
                    className="w-full pt-2 border-t border-[#E8EAF0] flex items-center justify-between gap-2 text-[11px] font-semibold text-[#8A6200] hover:text-[#172033] cursor-pointer transition-colors"
                  >
                    <span className="truncate">{extraDetail}</span>
                    <span className="inline-flex items-center gap-1 shrink-0">
                      Abrir
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </button>
                ) : (
                  <p className="text-[11px] font-medium text-[#778094] pt-2 border-t border-[#E8EAF0]">
                    {extraDetail}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
