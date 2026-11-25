import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowRightLeft,
  Bike,
  CheckCircle2,
  MapPin,
  Phone,
  Search,
  Send,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  DeliveryCourierRecord,
  DeliveryDispatchRecord,
  OnlineOrderRecord,
} from '../types/finance';
import {
  COURIER_TYPE_SPEC,
  formatCourierMotorcycleSummary,
  formatCustomerPhoneBR,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import {
  buildCourierDispatchAvailabilityList,
  OPERATIONAL_COURIER_STATUS_SPEC,
} from '../utils/deliveryDispatch';
import { formatCurrencyBRL } from '../utils/finance';
import { formatOrderNumber } from '../utils/onlineOrders';

interface DeliveryDispatchAssignModalProps {
  isOpen: boolean;
  mode: 'assign' | 'reassign';
  order: OnlineOrderRecord | null;
  currentDispatch?: DeliveryDispatchRecord | null;
  couriers: DeliveryCourierRecord[];
  dispatches: DeliveryDispatchRecord[];
  operatorEmail?: string;
  onClose: () => void;
  onConfirmAssign: (
    orderId: string,
    courierId: string,
    notes: string,
  ) => Promise<void>;
  onConfirmReassign?: (
    dispatchId: string,
    newCourierId: string,
    reason: string,
  ) => Promise<void>;
  onOpenCouriers?: () => void;
}

export function DeliveryDispatchAssignModal({
  isOpen,
  mode,
  order,
  currentDispatch = null,
  couriers,
  dispatches,
  operatorEmail = '',
  onClose,
  onConfirmAssign,
  onConfirmReassign,
  onOpenCouriers,
}: DeliveryDispatchAssignModalProps) {
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notesOrReason, setNotesOrReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availabilityList = useMemo(
    () => buildCourierDispatchAvailabilityList(couriers, dispatches),
    [couriers, dispatches],
  );

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availabilityList;
    const digits = q.replace(/\D/g, '');
    return availabilityList.filter((entry) => {
      const matchesName = entry.courier.name.toLowerCase().includes(q);
      const matchesType = entry.courierTypeLabel.toLowerCase().includes(q);
      const matchesPhone =
        Boolean(digits) &&
        (entry.courier.normalizedPhone.includes(digits) ||
          entry.courier.phone.toLowerCase().includes(q));
      const matchesPlate = entry.courier.motorcyclePlate
        .toLowerCase()
        .includes(q);
      return matchesName || matchesType || matchesPhone || matchesPlate;
    });
  }, [availabilityList, searchQuery]);

  const assignableCount = useMemo(
    () =>
      availabilityList.filter(
        (entry) =>
          entry.isAssignable &&
          !(
            mode === 'reassign' &&
            currentDispatch &&
            entry.courier.id === currentDispatch.courierId
          ),
      ).length,
    [availabilityList, mode, currentDispatch],
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitting(false);
    setSearchQuery('');
    setNotesOrReason('');

    const firstEligible = availabilityList.find(
      (entry) =>
        entry.isAssignable &&
        !(
          mode === 'reassign' &&
          currentDispatch &&
          entry.courier.id === currentDispatch.courierId
        ),
    );
    setSelectedCourierId(firstEligible?.courier.id ?? '');
  }, [isOpen, order?.id, mode, currentDispatch?.id, availabilityList]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !order || typeof document === 'undefined') {
    return null;
  }

  const selectedEntry =
    availabilityList.find((e) => e.courier.id === selectedCourierId) ?? null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!order) return;
    setError(null);

    if (!selectedCourierId || !selectedEntry) {
      setError('Selecione um entregador disponível para realizar a atribuição.');
      return;
    }

    if (!selectedEntry.isAssignable) {
      setError(
        selectedEntry.blockedReason ||
          'Este entregador não está elegível para entrega.',
      );
      return;
    }

    if (
      mode === 'reassign' &&
      currentDispatch &&
      selectedCourierId === currentDispatch.courierId
    ) {
      setError('Selecione um entregador diferente do atual para reatribuir.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'reassign' && currentDispatch && onConfirmReassign) {
        await onConfirmReassign(
          currentDispatch.id,
          selectedCourierId,
          notesOrReason.trim(),
        );
      } else {
        await onConfirmAssign(
          order.id,
          selectedCourierId,
          notesOrReason.trim(),
        );
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a atribuição do entregador.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const orderCode = formatOrderNumber(order.orderNumber);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispatch-assign-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              {mode === 'reassign' ? (
                <ArrowRightLeft className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Send className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="dispatch-assign-modal-title"
                className="text-base sm:text-lg font-extrabold text-[#172033] tracking-tight truncate"
              >
                {mode === 'reassign'
                  ? `Reatribuir entregador · Pedido ${orderCode}`
                  : `Atribuir entregador · Pedido ${orderCode}`}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                {mode === 'reassign' && currentDispatch
                  ? `Atual: ${currentDispatch.courierNameSnapshot} · selecione o novo motoboy responsável`
                  : 'Selecione um entregador ativo e disponível para enviar a entrega.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar modal de atribuição"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F7F8FC]/70"
        >
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Resumo do Pedido */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold font-mono text-[#172033]">
                  {orderCode}
                </span>
                <span className="text-xs font-semibold text-[#172033] truncate">
                  {order.customerName}
                </span>
                {order.customerPhone && (
                  <span className="text-xs font-mono tabular-nums text-[#778094]">
                    · {formatCustomerPhoneBR(order.customerPhone)}
                  </span>
                )}
              </div>
              <span className="text-sm font-extrabold font-mono tabular-nums text-[#172033]">
                {formatCurrencyBRL(order.totalAmount)}
              </span>
            </div>

            <div className="flex items-start gap-2 text-xs text-[#172033]">
              <MapPin
                className="w-3.5 h-3.5 text-[#B38300] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-medium leading-snug">
                  {order.deliveryAddress || 'Endereço não informado'}
                </p>
                {order.deliveryReference && (
                  <p className="text-[11px] text-[#778094] mt-0.5">
                    Ref.: {order.deliveryReference}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-1.5 border-t border-[#E8EAF0] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#778094]">
              <span>
                Pagamento:{' '}
                <strong className="text-[#172033]">
                  {order.paymentMethod}
                  {order.paymentMethod === 'Dinheiro' && order.changeFor
                    ? ` (Troco p/ ${formatCurrencyBRL(order.changeFor)})`
                    : ''}
                </strong>
              </span>
              {operatorEmail && (
                <span>
                  Operador:{' '}
                  <strong className="text-[#172033]">{operatorEmail}</strong>
                </span>
              )}
            </div>
          </section>

          {/* Seleção do Entregador */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                  Entregadores cadastrados
                </h3>
                <p className="text-[11px] text-[#778094] mt-0.5">
                  {assignableCount > 0
                    ? `${assignableCount} entregador(es) elegível(is) para receber entrega.`
                    : 'Nenhum entregador ativo e disponível no momento.'}
                </p>
              </div>

              {onOpenCouriers && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCouriers();
                  }}
                  className="text-xs font-semibold text-[#8A6200] hover:underline cursor-pointer"
                >
                  Gerenciar entregadores
                </button>
              )}
            </div>

            {availabilityList.length > 0 && (
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar entregador por nome, telefone ou tipo..."
                  className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] focus:bg-white text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>
            )}

            {availabilityList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D5D9E4] bg-[#F7F8FC] p-5 text-center space-y-2">
                <Bike
                  className="w-6 h-6 text-[#778094] mx-auto"
                  aria-hidden="true"
                />
                <p className="text-xs font-bold text-[#172033]">
                  Nenhum entregador cadastrado ainda
                </p>
                <p className="text-[11px] text-[#778094]">
                  Cadastre pelo menos um motoboy ativo na tela de Entregadores para
                  atribuir pedidos.
                </p>
                {onOpenCouriers && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCouriers();
                    }}
                    className="mgw-btn-secondary mt-1"
                  >
                    Ir para Entregadores
                  </button>
                )}
              </div>
            ) : filteredList.length === 0 ? (
              <p className="text-xs text-[#778094] py-4 text-center">
                Nenhum entregador encontrado com "{searchQuery}".
              </p>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {filteredList.map((entry) => {
                  const isCurrentOnReassign =
                    mode === 'reassign' &&
                    currentDispatch?.courierId === entry.courier.id;
                  const disabled = !entry.isAssignable || isCurrentOnReassign;
                  const selected = selectedCourierId === entry.courier.id;
                  const opSpec =
                    OPERATIONAL_COURIER_STATUS_SPEC[entry.operationalAvailability];
                  const typeSpec =
                    COURIER_TYPE_SPEC[
                      normalizeCourierType(entry.courier.courierType)
                    ];

                  return (
                    <label
                      key={entry.courier.id}
                      data-testid={`assign-courier-option-${entry.courier.id}`}
                      className={`block rounded-xl border p-3 transition-colors ${
                        disabled
                          ? 'bg-[#F7F8FC] border-[#E8EAF0] opacity-60 cursor-not-allowed'
                          : selected
                            ? 'bg-[#FFFBEB] border-[#F5B900] cursor-pointer shadow-[0_1px_3px_rgba(245,185,0,0.16)]'
                            : 'bg-white border-[#E8EAF0] hover:border-[#D5D9E4] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="radio"
                            name="dispatch-courier-select"
                            value={entry.courier.id}
                            disabled={disabled}
                            checked={selected}
                            onChange={() => setSelectedCourierId(entry.courier.id)}
                            className="mt-1 accent-[#F5B900]"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-[#172033]">
                                {entry.courier.name}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${typeSpec.containerClass}`}
                              >
                                {typeSpec.label}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#778094] mt-1">
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                <Phone className="w-3 h-3" aria-hidden="true" />
                                {formatCustomerPhoneBR(entry.courier.phone)}
                              </span>
                              <span className="truncate">
                                {formatCourierMotorcycleSummary(entry.courier)}
                              </span>
                            </div>

                            {disabled && (
                              <p className="text-[11px] font-medium text-[#B91C1C] mt-1 inline-flex items-center gap-1">
                                <ShieldAlert
                                  className="w-3 h-3 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>
                                  {isCurrentOnReassign
                                    ? 'Entregador atual desta entrega'
                                    : entry.blockedReason}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${opSpec.containerClass}`}
                          >
                            {entry.operationalAvailability === 'available' && (
                              <CheckCircle2
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                            )}
                            <span>{opSpec.label}</span>
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[#778094]">
                            {entry.activeDeliveriesCount} ativa
                            {entry.activeDeliveriesCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Observações ou Motivo de Reatribuição */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2">
            <label
              htmlFor="dispatch-assign-notes"
              className="block text-xs font-semibold text-[#172033]"
            >
              {mode === 'reassign'
                ? 'Motivo da reatribuição (opcional)'
                : 'Observações do despacho para o entregador (opcional)'}
            </label>
            <input
              id="dispatch-assign-notes"
              type="text"
              maxLength={mode === 'reassign' ? 300 : 500}
              value={notesOrReason}
              onChange={(e) => setNotesOrReason(e.target.value)}
              placeholder={
                mode === 'reassign'
                  ? 'Ex.: Entregador anterior precisou encerrar turno'
                  : 'Ex.: Levar máquina de cartão e troco para R$ 50,00'
              }
              className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-xs sm:text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
            />
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="mgw-btn-secondary"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting || assignableCount === 0 || !selectedCourierId}
              className="mgw-btn-primary disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Salvando...'
                  : mode === 'reassign'
                    ? 'Confirmar reatribuição'
                    : 'Atribuir e enviar para aceite'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
