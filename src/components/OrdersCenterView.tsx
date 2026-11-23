import { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  MapPin,
  MessageCircle,
  Printer,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  DigitalMenuSettings,
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import {
  buildWhatsappUrl,
  formatDateTimeBR,
  formatOrderNumber,
  formatTimeBR,
  getNextStatusActions,
  isUnreadNewOrder,
  ORDER_STATUS_LABELS,
} from '../utils/onlineOrders';
import {
  fromOnlineOrderRecord,
  type PrintableOrderSource,
} from '../utils/orderPrint';
import type { BrowserNotificationPermissionState } from '../utils/orderNotifications';
import { OrderPrintModal } from './OrderPrintModal';
import { PWAInstallButton } from './PWAInstallButton';

interface OrdersCenterViewProps {
  orders: OnlineOrderRecord[];
  digitalMenuSettings: DigitalMenuSettings;
  soundEnabled: boolean;
  pushEnabled: boolean;
  notificationPermission: BrowserNotificationPermissionState;
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

type OrderFilterTab =
  | 'all'
  | 'received'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'dispatch'
  | 'completed'
  | 'closed';

const QUICK_REASONS = [
  'Produto indisponível no momento',
  'Fora da área de entrega',
  'Cozinha sobrecarregada / encerrando expediente',
  'Cancelado a pedido do cliente',
];

export function OrdersCenterView({
  orders,
  digitalMenuSettings,
  soundEnabled,
  pushEnabled,
  notificationPermission,
  onToggleSound,
  onTogglePush,
  onEnableMobileNotifications,
  onTestAlert,
  onMarkViewed,
  onTransitionStatus,
  onOpenDigitalMenuSettings,
}: OrdersCenterViewProps) {
  const [filterTab, setFilterTab] = useState<OrderFilterTab>('all');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [expandedTimelineIds, setExpandedTimelineIds] = useState<
    Record<string, boolean>
  >({});

  const [reasonModal, setReasonModal] = useState<{
    order: OnlineOrderRecord;
    nextStatus: 'rejected' | 'cancelled';
    title: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printingOrder, setPrintingOrder] =
    useState<PrintableOrderSource | null>(null);

  const counts = useMemo(() => {
    const res = {
      all: orders.length,
      received: 0,
      unviewed: 0,
      accepted: 0,
      preparing: 0,
      ready: 0,
      dispatch: 0,
      completed: 0,
      closed: 0,
    };
    for (const o of orders) {
      if (o.status === 'received') {
        res.received += 1;
        if (isUnreadNewOrder(o)) res.unviewed += 1;
      } else if (o.status === 'accepted') {
        res.accepted += 1;
      } else if (o.status === 'preparing') {
        res.preparing += 1;
      } else if (o.status === 'ready') {
        res.ready += 1;
      } else if (
        o.status === 'out_for_delivery' ||
        o.status === 'ready_for_pickup'
      ) {
        res.dispatch += 1;
      } else if (o.status === 'completed') {
        res.completed += 1;
      } else if (o.status === 'rejected' || o.status === 'cancelled') {
        res.closed += 1;
      }
    }
    return res;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      switch (filterTab) {
        case 'all':
          return true;
        case 'received':
          return o.status === 'received';
        case 'accepted':
          return o.status === 'accepted';
        case 'preparing':
          return o.status === 'preparing';
        case 'ready':
          return o.status === 'ready';
        case 'dispatch':
          return (
            o.status === 'out_for_delivery' || o.status === 'ready_for_pickup'
          );
        case 'completed':
          return o.status === 'completed';
        case 'closed':
          return o.status === 'rejected' || o.status === 'cancelled';
      }
    });
  }, [orders, filterTab]);

  async function runDirectTransition(
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
  ) {
    if (busyOrderId) return;
    setActionError(null);
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
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar pedido.',
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleMarkAsViewed(order: OnlineOrderRecord) {
    if (busyOrderId) return;
    setBusyOrderId(order.id);
    try {
      await onMarkViewed(order);
    } finally {
      setBusyOrderId(null);
    }
  }

  const tabs: Array<{ id: OrderFilterTab; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: counts.all },
    { id: 'received', label: 'Novos', count: counts.received },
    { id: 'accepted', label: 'Aceitos', count: counts.accepted },
    { id: 'preparing', label: 'Em preparo', count: counts.preparing },
    { id: 'ready', label: 'Prontos', count: counts.ready },
    { id: 'dispatch', label: 'Entrega / Retirada', count: counts.dispatch },
    { id: 'completed', label: 'Concluídos', count: counts.completed },
    { id: 'closed', label: 'Recusados / Cancelados', count: counts.closed },
  ];

  return (
    <div className="space-y-5">
      {/* Unviewed New Order Alert Banner */}
      {counts.unviewed > 0 && (
        <div
          role="status"
          className="bg-[#EAB308]/12 border border-[#EAB308]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#EAB308] shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#111827]">
                {counts.unviewed === 1
                  ? 'Novo pedido recebido aguardando visualização!'
                  : `${counts.unviewed} novos pedidos recebidos aguardando confirmação!`}
              </p>
              <p className="text-xs text-[#4B5563]">
                Revise os itens e clique em ACEITAR PEDIDO ou RECUSAR PEDIDO.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFilterTab('received')}
            className="min-h-[40px] px-4 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold shrink-0 cursor-pointer"
          >
            Ver novos pedidos
          </button>
        </div>
      )}

      {/* Header Toolbar */}
      <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#111827]">
              Central de Pedidos Online
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Cardápio Digital:{' '}
              <span
                className={
                  !digitalMenuSettings.isActive
                    ? 'text-[#6B7280]'
                    : digitalMenuSettings.isOpen
                      ? 'text-[#22C55E] font-semibold'
                      : 'text-[#EAB308] font-semibold'
                }
              >
                {!digitalMenuSettings.isActive
                  ? 'Desativado'
                  : digitalMenuSettings.isOpen
                    ? 'Aberto'
                    : 'Fechado'}
              </span>{' '}
              ·{' '}
              <span className="font-mono">
                /cardapio/{digitalMenuSettings.slug}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {notificationPermission === 'granted' ? (
              <>
                <button
                  type="button"
                  onClick={onTogglePush}
                  aria-pressed={pushEnabled}
                  className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                    pushEnabled
                      ? 'bg-[#F9FAFB] border-[#22C55E]/40 text-[#86EFAC]'
                      : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280]'
                  }`}
                >
                  {pushEnabled ? (
                    <>
                      <BellRing className="w-4 h-4" />
                      Notificações no celular ativas
                    </>
                  ) : (
                    <>
                      <BellOff className="w-4 h-4" />
                      Notificações pausadas
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onTestAlert}
                  className="min-h-[40px] px-3 rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/50 bg-[#F9FAFB] text-xs font-semibold text-[#4B5563] hover:text-[#EAB308] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5 text-[#EAB308]" />
                  Testar alerta
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onEnableMobileNotifications}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <BellRing className="w-4 h-4" />
                Ativar notificações no celular
              </button>
            )}

            <PWAInstallButton />

            <button
              type="button"
              onClick={onToggleSound}
              aria-pressed={soundEnabled}
              className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                soundEnabled
                  ? 'bg-[#F9FAFB] border-[#22C55E]/40 text-[#86EFAC]'
                  : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280]'
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  Alerta sonoro ligado
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  Som silenciado
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenDigitalMenuSettings}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/50 bg-[#F9FAFB] text-xs font-semibold text-[#4B5563] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-[#EAB308]" />
              Configurar cardápio
            </button>
          </div>
        </div>

        {notificationPermission === 'denied' && (
          <p className="text-xs text-[#FCA5A5] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-3.5 py-2.5">
            As notificações estão bloqueadas nas permissões do navegador. Toque no ícone de cadeado ao lado do endereço do site para permitir notificações e receber os alertas no celular.
          </p>
        )}

        {/* Status Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filtrar pedidos por status"
          className="flex flex-wrap gap-1.5"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filterTab === tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-[#EAB308] text-[#F9FAFB]'
                  : 'bg-[#F9FAFB] border border-[#E5E7EB] text-[#4B5563] hover:border-[#374151]'
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono tabular-nums opacity-80">
                ({tab.count})
              </span>
            </button>
          ))}
        </div>
      </section>

      {actionError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]"
        >
          {actionError}
        </div>
      )}

      {/* Orders Feed */}
      {filteredOrders.length === 0 ? (
        <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-[#111827]">
            {orders.length === 0
              ? 'Nenhum pedido online recebido ainda.'
              : 'Nenhum pedido nesta etapa no momento.'}
          </p>
          <p className="text-xs text-[#6B7280]">
            {orders.length === 0
              ? 'Quando um cliente enviar um pedido pelo cardápio digital, ele aparecerá aqui em tempo real.'
              : 'Selecione outra aba acima para visualizar os demais pedidos.'}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const unread = isUnreadNewOrder(order);
            const actions = getNextStatusActions(
              order.status,
              order.fulfillmentType,
            );
            const isBusy = busyOrderId === order.id;
            const timelineOpen = Boolean(expandedTimelineIds[order.id]);
            const whatsappUrl = buildWhatsappUrl(
              order.customerPhone,
              `Olá ${order.customerName}! Sobre o seu pedido ${formatOrderNumber(order.orderNumber)}:`,
            );

            return (
              <article
                key={order.id}
                data-testid={`admin-order-card-${order.orderNumber}`}
                className={`bg-[#FFFFFF] border rounded-2xl p-4 sm:p-5 space-y-4 ${
                  unread ? 'border-[#EAB308]' : 'border-[#E5E7EB]'
                }`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-[#EAB308] font-mono tabular-nums">
                      {formatOrderNumber(order.orderNumber)}
                    </span>
                    <span className="text-xs text-[#6B7280]">·</span>
                    <span className="text-sm font-bold text-[#111827]">
                      {order.customerName}
                    </span>
                    <span className="text-xs text-[#6B7280]">·</span>
                    <span className="text-xs text-[#6B7280] font-mono tabular-nums inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDateTimeBR(order.createdAtMs)}
                    </span>
                    {unread && (
                      <span className="text-xs font-bold text-[#EAB308]">
                        · NOVO NÃO VISUALIZADO
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                        order.status === 'rejected' || order.status === 'cancelled'
                          ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#FCA5A5]'
                          : order.status === 'completed'
                            ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#86EFAC]'
                            : order.status === 'received'
                              ? 'bg-[#EAB308]/12 border-[#EAB308]/40 text-[#EAB308]'
                              : 'bg-[#F1F3F5] border-[#E5E7EB] text-[#111827]'
                      }`}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                </div>

                {/* Body Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Items */}
                  <div className="lg:col-span-7 space-y-2">
                    <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                      Itens do pedido
                    </p>
                    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl divide-y divide-[#E5E7EB]">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#111827]">
                              {item.quantity}x {item.itemName}
                            </p>
                            {item.selectedAddons?.map((group) => (
                              <p key={group.groupId} className="text-[#4B5563] mt-1">
                                <span className="text-[#EAB308]">{group.groupName}:</span>{' '}
                                {group.options.map((option) => `${option.name}${option.price > 0 ? ` (+${formatCurrencyBRL(option.price)})` : ''}`).join(', ')}
                              </p>
                            ))}
                            {item.itemNote && (
                              <p className="text-[#EAB308] mt-0.5">
                                Obs: {item.itemNote}
                              </p>
                            )}
                          </div>
                          <span className="font-mono tabular-nums text-[#4B5563] shrink-0">
                            {formatCurrencyBRL(item.lineTotal)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {order.customerNote && (
                      <p className="text-xs text-[#F5C842] bg-[#EAB308]/10 border border-[#EAB308]/20 rounded-lg px-3 py-2">
                        Observação geral: {order.customerNote}
                      </p>
                    )}

                    {(order.status === 'rejected' ||
                      order.status === 'cancelled') &&
                      order.rejectionReason && (
                        <p className="text-xs text-[#FCA5A5] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
                          Motivo: {order.rejectionReason}
                        </p>
                      )}
                  </div>

                  {/* Customer, Fulfillment & Totals */}
                  <div className="lg:col-span-5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[#6B7280]">Contato</p>
                        <p className="font-mono text-[#111827]">
                          {order.customerPhone}
                        </p>
                      </div>
                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[34px] px-2.5 rounded-lg border border-[#22C55E]/40 text-[#86EFAC] inline-flex items-center gap-1 font-semibold hover:border-[#22C55E]"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      )}
                    </div>

                    <div className="flex items-start gap-2 pt-2 border-t border-[#E5E7EB]">
                      <MapPin className="w-3.5 h-3.5 text-[#EAB308] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[#6B7280]">
                          {order.fulfillmentType === 'delivery'
                            ? 'Entrega'
                            : 'Retirada no balcão'}
                        </p>
                        {order.fulfillmentType === 'delivery' && (
                          <p className="text-[#111827]">
                            {order.deliveryAddress}
                            {order.deliveryReference
                              ? ` · Ref: ${order.deliveryReference}`
                              : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E5E7EB] space-y-1">
                      <div className="flex justify-between text-[#6B7280]">
                        <span>Pagamento</span>
                        <span className="text-[#111827] font-semibold">
                          {order.paymentMethod}
                          {order.paymentMethod === 'Dinheiro' && order.changeFor
                            ? ` (Troco p/ ${formatCurrencyBRL(order.changeFor)})`
                            : ''}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#6B7280]">
                        <span>Subtotal</span>
                        <span className="font-mono tabular-nums text-[#111827]">
                          {formatCurrencyBRL(order.subtotalAmount)}
                        </span>
                      </div>
                      {order.fulfillmentType === 'delivery' && (
                        <div className="flex justify-between text-[#6B7280]">
                          <span>Taxa de entrega</span>
                          <span className="font-mono tabular-nums text-[#111827]">
                            {order.deliveryFee <= 0
                              ? 'Grátis'
                              : formatCurrencyBRL(order.deliveryFee)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-[#EAB308] pt-1 border-t border-[#E5E7EB]">
                        <span>Total</span>
                        <span className="font-mono tabular-nums">
                          {formatCurrencyBRL(order.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
                  <div className="flex flex-wrap items-center gap-2">
                    {unread && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleMarkAsViewed(order)}
                        className="min-h-[42px] px-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/60 bg-[#F9FAFB] text-xs font-semibold text-[#4B5563] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#EAB308]" />
                        Confirmar visualização
                      </button>
                    )}

                    {actions.map((action) => (
                      <button
                        key={action.nextStatus}
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (action.requiresReason) {
                            setReasonText('');
                            setReasonError(null);
                            setReasonModal({
                              order,
                              nextStatus: action.nextStatus as
                                | 'rejected'
                                | 'cancelled',
                              title: `${action.label} · ${formatOrderNumber(order.orderNumber)}`,
                            });
                          } else {
                            void runDirectTransition(order, action.nextStatus);
                          }
                        }}
                        className={`min-h-[42px] px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 ${
                          action.tone === 'success'
                            ? 'bg-[#22C55E] hover:bg-[#16A34A] text-[#F9FAFB]'
                            : action.tone === 'primary'
                              ? 'bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB]'
                              : 'border border-[#EF4444]/40 hover:border-[#EF4444] bg-[#EF4444]/10 text-[#FCA5A5]'
                        }`}
                      >
                        {action.tone === 'success' && (
                          <Check className="w-4 h-4" />
                        )}
                        {action.tone === 'danger' && <X className="w-4 h-4" />}
                        {isBusy ? 'Atualizando...' : action.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPrintingOrder(
                          fromOnlineOrderRecord(order, {
                            storeName: digitalMenuSettings.storeName,
                            storePhone: digitalMenuSettings.phoneWhatsapp,
                            storeAddress: digitalMenuSettings.address,
                          }),
                        )
                      }
                      aria-label={`Imprimir pedido ${formatOrderNumber(order.orderNumber)}`}
                      className="min-h-[38px] px-3 rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/60 bg-[#F9FAFB] text-xs font-semibold text-[#4B5563] hover:text-[#EAB308] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir</span>
                    </button>

                    {order.statusHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTimelineIds((prev) => ({
                            ...prev,
                            [order.id]: !prev[order.id],
                          }))
                        }
                        className="min-h-[38px] px-3 rounded-lg text-xs text-[#6B7280] hover:text-[#111827] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Histórico ({order.statusHistory.length})</span>
                        {timelineOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Timeline */}
                {timelineOpen && order.statusHistory.length > 0 && (
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 space-y-1.5 text-xs">
                    {order.statusHistory.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between gap-2 text-[#4B5563]"
                      >
                        <span>
                          {ORDER_STATUS_LABELS[ev.toStatus]}
                          {ev.reason ? ` — ${ev.reason}` : ''}
                        </span>
                        <span className="font-mono tabular-nums text-[#6B7280]">
                          {formatTimeBR(ev.createdAtMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Reason Modal for Rejection or Cancellation */}
      {reasonModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reason-modal-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleConfirmReasonSubmit(e)}
            className="max-w-md w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
              <h3
                id="reason-modal-title"
                className="text-sm font-bold text-[#111827]"
              >
                {reasonModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="w-8 h-8 rounded-lg text-[#6B7280] hover:text-[#111827] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reasonError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]"
              >
                {reasonError}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs text-[#6B7280]">
                Sugestões rápidas (o cliente verá este motivo):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setReasonText(suggestion)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#EAB308]/50 text-[11px] text-[#4B5563] cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="rejection-reason-input"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
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
                className="w-full px-3 py-2 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#E5E7EB] text-xs font-semibold text-[#4B5563] cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={Boolean(busyOrderId)}
                className="min-h-[42px] px-4 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {busyOrderId ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <OrderPrintModal
        order={printingOrder}
        allowKitchenToggle
        onClose={() => setPrintingOrder(null)}
      />
    </div>
  );
}
