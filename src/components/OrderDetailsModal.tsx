import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  MessageCircle,
  Package,
  Printer,
  Truck,
  X,
} from 'lucide-react';
import type {
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import { formatDeliveryFeeRuleLabel } from '../utils/deliveryRegions';
import {
  buildWhatsappUrl,
  formatDateTimeBR,
  formatOrderNumber,
  formatTimeBR,
  getNextStatusActions,
  isUnreadNewOrder,
  ORDER_STATUS_LABELS,
  type OrderProgressionAction,
} from '../utils/onlineOrders';
import { getOrderStatusBadgeSpec } from '../utils/ordersCenter';

interface OrderDetailsModalProps {
  order: OnlineOrderRecord | null;
  busyOrderId: string | null;
  actionError?: string | null;
  onClose: () => void;
  onMarkViewed: (order: OnlineOrderRecord) => Promise<void>;
  onDirectTransition: (
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
  ) => Promise<void>;
  onRequestReasonTransition: (
    order: OnlineOrderRecord,
    action: OrderProgressionAction,
  ) => void;
  onPrint: (order: OnlineOrderRecord) => void;
}

export function OrderStatusIcon({
  status,
  className = 'w-3.5 h-3.5 shrink-0',
}: {
  status: OnlineOrderStatus;
  className?: string;
}) {
  switch (status) {
    case 'received':
      return <Bell className={className} aria-hidden="true" />;
    case 'accepted':
      return <Check className={className} aria-hidden="true" />;
    case 'preparing':
      return <Clock className={className} aria-hidden="true" />;
    case 'ready':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'out_for_delivery':
      return <Truck className={className} aria-hidden="true" />;
    case 'ready_for_pickup':
      return <Package className={className} aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'rejected':
    case 'cancelled':
      return <X className={className} aria-hidden="true" />;
  }
}

export function OrderDetailsModal({
  order,
  busyOrderId,
  actionError = null,
  onClose,
  onMarkViewed,
  onDirectTransition,
  onRequestReasonTransition,
  onPrint,
}: OrderDetailsModalProps) {
  useEffect(() => {
    if (!order) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [order, onClose]);

  if (!order || typeof document === 'undefined') {
    return null;
  }

  const unread = isUnreadNewOrder(order);
  const actions = getNextStatusActions(order.status, order.fulfillmentType);
  const isBusy = busyOrderId === order.id;
  const badgeSpec = getOrderStatusBadgeSpec(order.status);
  const orderNumberFormatted = formatOrderNumber(order.orderNumber);
  const whatsappUrl = buildWhatsappUrl(
    order.customerPhone,
    `Olá ${order.customerName}! Sobre o seu pedido ${orderNumberFormatted}:`,
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div
        data-testid={`order-details-modal-${order.orderNumber}`}
        className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3 shrink-0 bg-white">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="order-details-modal-title"
                className="text-base sm:text-lg font-extrabold text-[#172033] font-mono tabular-nums"
              >
                Pedido {orderNumberFormatted}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${badgeSpec.containerClass}`}
              >
                <OrderStatusIcon status={order.status} />
                <span>{badgeSpec.label}</span>
              </span>
              {unread && (
                <span className="text-xs font-bold text-[#B45309]">
                  · Aguardando visualização
                </span>
              )}
            </div>
            <p className="text-xs text-[#778094] flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#172033]">
                {order.customerName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {formatDateTimeBR(order.createdAtMs)}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do pedido"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F7F8FC]/60">
          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]"
            >
              {actionError}
            </div>
          )}

          {/* Customer & Delivery Details */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2">
              <p className="text-[11px] font-semibold text-[#778094]">
                Cliente e contato
              </p>
              <p className="text-sm font-bold text-[#172033]">
                {order.customerName}
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs font-mono tabular-nums text-[#172033]">
                  {order.customerPhone || 'Telefone não informado'}
                </span>
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[34px] px-2.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] hover:bg-[#D1FAE5] inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2">
              <p className="text-[11px] font-semibold text-[#778094]">
                Modalidade de recebimento
              </p>
              <div className="flex items-start gap-2">
                <MapPin
                  className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-bold text-[#172033]">
                    {order.fulfillmentType === 'delivery'
                      ? 'Entrega no endereço'
                      : 'Retirada no balcão'}
                  </p>
                  {order.fulfillmentType === 'delivery' && (
                    <>
                      <p className="text-xs text-[#4B5563] break-words">
                        {order.deliveryAddress}
                        {order.deliveryReference
                          ? ` · Ref: ${order.deliveryReference}`
                          : ''}
                      </p>
                      {(order.deliveryNeighborhood ||
                        order.deliveryRegionName ||
                        order.deliveryCity) && (
                        <p className="text-[11px] text-[#8A6200] font-medium">
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
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8EAF0] flex items-center justify-between gap-2 bg-[#F7F8FC]">
              <h3 className="text-xs font-bold text-[#172033]">
                Itens do pedido
              </h3>
              <span className="text-xs text-[#778094] font-mono tabular-nums">
                {order.items.length} linha(s)
              </span>
            </div>

            <div className="divide-y divide-[#E8EAF0]">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-[#172033] text-[13px]">
                      {item.quantity}x {item.itemName}
                    </p>
                    {item.selectedAddons?.map((group) => (
                      <p key={group.groupId} className="text-[#4B5563]">
                        <span className="font-semibold text-[#B45309]">
                          {group.groupName}:
                        </span>{' '}
                        {group.options
                          .map(
                            (option) =>
                              `${option.name}${
                                option.price > 0
                                  ? ` (+${formatCurrencyBRL(option.price)})`
                                  : ''
                              }`,
                          )
                          .join(', ')}
                      </p>
                    ))}
                    {item.itemNote && (
                      <p className="text-[#B45309] font-medium">
                        Observação: {item.itemNote}
                      </p>
                    )}
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-[#172033] shrink-0">
                    {formatCurrencyBRL(item.lineTotal)}
                  </span>
                </div>
              ))}
            </div>

            {(order.customerNote ||
              ((order.status === 'rejected' || order.status === 'cancelled') &&
                order.rejectionReason)) && (
              <div className="px-4 py-3 border-t border-[#E8EAF0] space-y-2 bg-[#F7F8FC]/60">
                {order.customerNote && (
                  <p className="text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
                    <span className="font-semibold">Observação geral:</span>{' '}
                    {order.customerNote}
                  </p>
                )}

                {(order.status === 'rejected' || order.status === 'cancelled') &&
                  order.rejectionReason && (
                    <p className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">
                      <span className="font-semibold">Motivo informado:</span>{' '}
                      {order.rejectionReason}
                    </p>
                  )}
              </div>
            )}
          </section>

          {/* Payment & Totals */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#778094]">
              <span>Forma de pagamento</span>
              <span className="font-semibold text-[#172033]">
                {order.paymentMethod}
                {order.paymentMethod === 'Dinheiro' && order.changeFor
                  ? ` (Troco p/ ${formatCurrencyBRL(order.changeFor)})`
                  : ''}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#778094]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums text-[#172033]">
                {formatCurrencyBRL(order.subtotalAmount)}
              </span>
            </div>
            {order.fulfillmentType === 'delivery' && (
              <div className="flex items-start justify-between gap-2 text-[#778094]">
                <div>
                  <span>Taxa de entrega</span>
                  {(order.deliveryFeeRule || order.deliveryFreeApplied) && (
                    <span className="block text-[11px] text-[#778094]">
                      {formatDeliveryFeeRuleLabel(
                        order.deliveryFeeRule,
                        order.deliveryFreeApplied,
                      )}
                    </span>
                  )}
                </div>
                <span className="font-mono tabular-nums text-[#172033]">
                  {order.deliveryFee <= 0
                    ? 'Grátis'
                    : formatCurrencyBRL(order.deliveryFee)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-[#E8EAF0] text-sm font-extrabold text-[#172033]">
              <span>Total do pedido</span>
              <span className="font-mono tabular-nums">
                {formatCurrencyBRL(order.totalAmount)}
              </span>
            </div>
          </section>

          {/* Status History */}
          {order.statusHistory.length > 0 && (
            <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold text-[#172033]">
                Histórico de status ({order.statusHistory.length})
              </h3>
              <div className="space-y-2">
                {order.statusHistory.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between gap-3 text-xs border-b border-[#E8EAF0]/70 last:border-b-0 pb-2 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[#172033]">
                        {ORDER_STATUS_LABELS[ev.toStatus]}
                      </span>
                      {ev.reason && (
                        <span className="text-[#778094]"> — {ev.reason}</span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-[#778094] shrink-0">
                      {formatTimeBR(ev.createdAtMs)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="px-4 sm:px-6 py-3.5 border-t border-[#E8EAF0] bg-white flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {unread && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onMarkViewed(order)}
                className="min-h-[40px] px-3.5 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5 text-[#D97706]" />
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
                    onRequestReasonTransition(order, action);
                  } else {
                    void onDirectTransition(order, action.nextStatus);
                  }
                }}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap ${
                  action.tone === 'success'
                    ? 'bg-[#16A36A] hover:bg-[#15803D] text-white'
                    : action.tone === 'primary'
                      ? 'bg-[#F5B900] hover:bg-[#FFC928] text-[#172033]'
                      : 'border border-[#FECACA] hover:border-[#E35D62] bg-[#FEF2F2] text-[#B91C1C]'
                }`}
              >
                {action.tone === 'success' && (
                  <Check className="w-3.5 h-3.5" />
                )}
                {action.tone === 'danger' && <X className="w-3.5 h-3.5" />}
                <span>{isBusy ? 'Atualizando...' : action.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => onPrint(order)}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-[#778094]" />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#E8EAF0] hover:bg-[#F7F8FC] text-xs font-semibold text-[#4B5563] hover:text-[#172033] cursor-pointer whitespace-nowrap"
            >
              Fechar
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
