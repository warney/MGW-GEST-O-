import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bike,
  Clock,
  History,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  DeliveryDispatchActorType,
  DeliveryDispatchHistoryRecord,
  DeliveryDispatchStatus,
  OnlineOrderRecord,
} from '../types/finance';
import {
  COURIER_TYPE_SPEC,
  formatCustomerPhoneBR,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import {
  buildCourierWhatsappDispatchUrl,
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_SPEC,
  formatElapsedDurationLabel,
  getNextDispatchActions,
  type DispatchProgressionAction,
  type DispatchTrackingEntry,
} from '../utils/deliveryDispatch';
import { formatCurrencyBRL } from '../utils/finance';
import { formatDeliveryFeeRuleLabel } from '../utils/deliveryRegions';
import {
  formatDateTimeBR,
  formatOrderNumber,
  formatTimeBR,
} from '../utils/onlineOrders';
import { getOrderStatusBadgeSpec } from '../utils/ordersCenter';

interface DeliveryDispatchDetailsModalProps {
  entry: DispatchTrackingEntry | null;
  previewOrder?: OnlineOrderRecord | null;
  previewHistory?: DeliveryDispatchHistoryRecord[];
  storeName: string;
  busyDispatchId?: string | null;
  actionError?: string | null;
  onClose: () => void;
  onAssignOrder?: (order: OnlineOrderRecord) => void;
  onDirectAction?: (
    entry: DispatchTrackingEntry,
    action: DispatchProgressionAction,
  ) => Promise<void>;
  onRequestReasonAction?: (
    entry: DispatchTrackingEntry,
    action: DispatchProgressionAction,
  ) => void;
  onRequestReassign?: (entry: DispatchTrackingEntry) => void;
}

const ACTOR_LABEL_MAP: Record<DeliveryDispatchActorType, string> = {
  admin: 'Operador',
  courier: 'Entregador',
  system: 'Sistema',
};

export function DeliveryDispatchDetailsModal({
  entry,
  previewOrder = null,
  previewHistory = [],
  storeName,
  busyDispatchId = null,
  actionError = null,
  onClose,
  onAssignOrder,
  onDirectAction,
  onRequestReasonAction,
  onRequestReassign,
}: DeliveryDispatchDetailsModalProps) {
  const order = entry?.order ?? previewOrder;
  const dispatch = entry?.dispatch ?? null;
  const courier = entry?.courier ?? null;
  const timeline = entry ? entry.history : previewHistory;

  const isBusy = Boolean(dispatch && busyDispatchId === dispatch.id);

  useEffect(() => {
    if (!order && !dispatch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [order, dispatch, isBusy, onClose]);

  if ((!order && !dispatch) || typeof document === 'undefined') {
    return null;
  }

  const dispatchSpec = dispatch
    ? DISPATCH_STATUS_SPEC[dispatch.dispatchStatus]
    : DISPATCH_STATUS_SPEC.awaiting_dispatch;
  const orderSpec = order ? getOrderStatusBadgeSpec(order.status) : null;
  const courierTypeSpec = dispatch
    ? COURIER_TYPE_SPEC[
        normalizeCourierType(courier?.courierType ?? dispatch.courierTypeSnapshot)
      ]
    : null;
  const courierPhone =
    courier?.whatsapp || courier?.phone || dispatch?.courierPhoneSnapshot || '';
  const whatsappUrl =
    order && dispatch && courierPhone
      ? buildCourierWhatsappDispatchUrl({
          courierPhone,
          courierName: courier?.name || dispatch.courierNameSnapshot,
          order,
          storeName,
        })
      : null;

  const actions = dispatch
    ? getNextDispatchActions(dispatch.dispatchStatus, order?.status)
    : [];

  function handleActionClick(action: DispatchProgressionAction) {
    if (!entry) return;
    if (action.kind === 'reassign') {
      onRequestReassign?.(entry);
      return;
    }
    if (action.requiresReason) {
      onRequestReasonAction?.(entry, action);
      return;
    }
    void onDirectAction?.(entry, action);
  }

  const orderCode = order ? formatOrderNumber(order.orderNumber) : 'Pedido';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispatch-details-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3 bg-white shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="dispatch-details-modal-title"
                className="text-base sm:text-lg font-extrabold text-[#172033] tracking-tight"
              >
                Entrega · Pedido {orderCode}
              </h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${dispatchSpec.containerClass}`}
              >
                {dispatchSpec.label}
              </span>
              {orderSpec && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${orderSpec.containerClass}`}
                >
                  Pedido: {orderSpec.label}
                </span>
              )}
            </div>
            {order && (
              <p className="text-xs text-[#778094] mt-1">
                Recebido em {formatDateTimeBR(order.createdAtMs)}
                {entry
                  ? ` · Tempo na entrega: ${formatElapsedDurationLabel(entry.elapsedTimeMs)}`
                  : ''}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Fechar detalhes da entrega"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F7F8FC]/70">
          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Bloco Entregador & Dados do Despacho */}
          {dispatch && (
            <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bike
                    className="w-4 h-4 text-[#B38300] shrink-0"
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                    Entregador responsável
                  </h3>
                </div>

                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-semibold text-[#15803D] hover:bg-[#D1FAE5]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Enviar resumo no WhatsApp</span>
                  </a>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[#172033]">
                  {courier?.name || dispatch.courierNameSnapshot}
                </span>
                {courierTypeSpec && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${courierTypeSpec.containerClass}`}
                  >
                    {courierTypeSpec.label}
                  </span>
                )}
                {(courier?.phone || dispatch.courierPhoneSnapshot) && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-[#778094]">
                    <Phone className="w-3 h-3" aria-hidden="true" />
                    {formatCustomerPhoneBR(
                      courier?.phone || dispatch.courierPhoneSnapshot,
                    )}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-[#E8EAF0] text-xs">
                <div>
                  <span className="block text-[11px] text-[#778094]">
                    Atribuído às
                  </span>
                  <span className="font-mono font-semibold text-[#172033]">
                    {formatTimeBR(dispatch.assignedAtMs)}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#778094]">
                    Aceite
                  </span>
                  <span className="font-mono font-semibold text-[#172033]">
                    {dispatch.acceptedAtMs
                      ? formatTimeBR(dispatch.acceptedAtMs)
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#778094]">
                    Saída
                  </span>
                  <span className="font-mono font-semibold text-[#172033]">
                    {dispatch.dispatchedAtMs
                      ? formatTimeBR(dispatch.dispatchedAtMs)
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#778094]">
                    Conclusão
                  </span>
                  <span className="font-mono font-semibold text-[#172033]">
                    {dispatch.deliveredAtMs
                      ? formatTimeBR(dispatch.deliveredAtMs)
                      : dispatch.rejectedAtMs
                        ? formatTimeBR(dispatch.rejectedAtMs)
                        : dispatch.cancelledAtMs
                          ? formatTimeBR(dispatch.cancelledAtMs)
                          : '—'}
                  </span>
                </div>
              </div>

              {dispatch.assignedByEmail && (
                <p className="text-[11px] text-[#778094]">
                  Atribuído por:{' '}
                  <strong className="font-semibold text-[#172033]">
                    {dispatch.assignedByEmail}
                  </strong>
                </p>
              )}

              {dispatch.notes && (
                <p className="text-xs text-[#172033] bg-[#F7F8FC] border border-[#E8EAF0] rounded-lg px-3 py-2">
                  <strong className="font-semibold">Obs. do despacho:</strong>{' '}
                  {dispatch.notes}
                </p>
              )}

              {(dispatch.rejectionReason || dispatch.cancellationReason) && (
                <p className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">
                  <strong className="font-semibold">
                    {dispatch.rejectionReason
                      ? 'Motivo da recusa:'
                      : 'Motivo do cancelamento:'}
                  </strong>{' '}
                  {dispatch.rejectionReason || dispatch.cancellationReason}
                </p>
              )}
            </section>
          )}

          {/* Cliente e Endereço */}
          {order && (
            <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                Cliente e endereço de entrega
              </h3>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-sm text-[#172033]">
                  {order.customerName}
                </span>
                {order.customerPhone && (
                  <span className="font-mono tabular-nums text-[#778094]">
                    {formatCustomerPhoneBR(order.customerPhone)}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-2 text-xs text-[#172033]">
                <MapPin
                  className="w-4 h-4 text-[#B38300] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {order.deliveryAddress || 'Endereço não informado'}
                  </p>
                  {(order.deliveryNeighborhood ||
                    order.deliveryRegionName ||
                    order.deliveryCity) && (
                    <p className="text-[11px] font-medium text-[#8A6200] mt-0.5">
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
                  {order.deliveryReference && (
                    <p className="text-[#778094] mt-0.5">
                      Referência: {order.deliveryReference}
                    </p>
                  )}
                </div>
              </div>

              {order.customerNote && (
                <p className="text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
                  <strong>Observação do cliente:</strong> {order.customerNote}
                </p>
              )}
            </section>
          )}

          {/* Itens e Pagamento */}
          {order && (
            <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Package
                  className="w-4 h-4 text-[#B38300] shrink-0"
                  aria-hidden="true"
                />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                  Itens e valores
                </h3>
              </div>

              <ul className="divide-y divide-[#E8EAF0] text-xs">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="py-2 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#172033]">
                        {item.quantity}x {item.itemName}
                      </p>
                      {item.itemNote && (
                        <p className="text-[11px] text-[#778094]">
                          Obs.: {item.itemNote}
                        </p>
                      )}
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-[#172033] shrink-0">
                      {formatCurrencyBRL(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="pt-2 border-t border-[#E8EAF0] space-y-1 text-xs">
                <div className="flex justify-between text-[#778094]">
                  <span>Produtos</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrencyBRL(order.subtotalAmount)}
                  </span>
                </div>
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
                  <span className="font-mono tabular-nums">
                    {order.deliveryFee <= 0
                      ? 'Grátis'
                      : formatCurrencyBRL(order.deliveryFee)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-[#172033] pt-1">
                  <span>Total ({order.paymentMethod})</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrencyBRL(order.totalAmount)}
                  </span>
                </div>
                {order.paymentMethod === 'Dinheiro' && order.changeFor && (
                  <p className="text-[11px] font-semibold text-[#92400E]">
                    Levar troco para {formatCurrencyBRL(order.changeFor)}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Histórico Operacional */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <History
                className="w-4 h-4 text-[#B38300] shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                Histórico de eventos da entrega
              </h3>
            </div>

            {timeline.length === 0 ? (
              <p className="text-xs text-[#778094]">
                Nenhum evento de despacho registrado ainda para este pedido.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {timeline.map((ev) => {
                  const toLabel =
                    DISPATCH_STATUS_LABELS[
                      ev.toStatus as DeliveryDispatchStatus
                    ] ?? ev.toStatus;
                  const fromLabel = ev.fromStatus
                    ? DISPATCH_STATUS_LABELS[
                        ev.fromStatus as DeliveryDispatchStatus
                      ] ?? ev.fromStatus
                    : null;

                  return (
                    <li
                      key={ev.id}
                      className="rounded-xl border border-[#E8EAF0] bg-[#F7F8FC]/80 px-3 py-2.5 text-xs space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[#172033]">
                          {fromLabel ? `${fromLabel} → ${toLabel}` : toLabel}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#778094] inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {formatDateTimeBR(ev.createdAtMs)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#778094]">
                        <span className="px-1.5 py-0.5 rounded bg-white border border-[#E8EAF0] font-semibold text-[#172033]">
                          {ACTOR_LABEL_MAP[ev.actorType]}
                        </span>
                        {ev.courierName && (
                          <span>Entregador: {ev.courierName}</span>
                        )}
                        {ev.actorEmail && <span>· {ev.actorEmail}</span>}
                      </div>

                      {ev.reason && (
                        <p className="text-[11px] text-[#172033]">{ev.reason}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {!dispatch && order && onAssignOrder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAssignOrder(order);
                }}
                className="mgw-btn-primary"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>Atribuir entregador</span>
              </button>
            )}

            {actions.map((action) => {
              const btnClass =
                action.tone === 'success'
                  ? 'min-h-[38px] px-3.5 rounded-xl bg-[#16A36A] hover:bg-[#15803D] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50'
                  : action.tone === 'primary'
                    ? 'min-h-[38px] px-3.5 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50'
                    : action.tone === 'danger'
                      ? 'min-h-[38px] px-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50'
                      : 'mgw-btn-secondary';

              return (
                <button
                  key={`${action.kind}-${action.nextStatus || 'x'}`}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleActionClick(action)}
                  className={btnClass}
                >
                  {action.kind === 'accept' && (
                    <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="mgw-btn-secondary"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
