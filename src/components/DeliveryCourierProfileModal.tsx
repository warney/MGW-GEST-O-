import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bike,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Power,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { DeliveryCourierRecord } from '../types/finance';
import {
  buildWhatsappUrlBR,
  COURIER_AVAILABILITY_SPEC,
  COURIER_STATUS_SPEC,
  COURIER_TYPE_SPEC,
  formatCourierMotorcycleSummary,
  formatCpfBR,
  formatCustomerPhoneBR,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import { getUserInitials } from '../utils/shellProfile';

interface DeliveryCourierProfileModalProps {
  courier: DeliveryCourierRecord | null;
  busyCourierId?: string | null;
  activeDeliveriesCount?: number;
  onClose: () => void;
  onEdit: (courier: DeliveryCourierRecord) => void;
  onToggleStatus: (courier: DeliveryCourierRecord) => Promise<void>;
  onToggleAvailability: (courier: DeliveryCourierRecord) => Promise<void>;
  onRequestDelete: (courier: DeliveryCourierRecord) => void;
}

function formatDateOnlyBR(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ms));
}

export function DeliveryCourierProfileModal({
  courier,
  busyCourierId = null,
  activeDeliveriesCount = 0,
  onClose,
  onEdit,
  onToggleStatus,
  onToggleAvailability,
  onRequestDelete,
}: DeliveryCourierProfileModalProps) {
  const [copiedField, setCopiedField] = useState<'phone' | 'whatsapp' | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!courier) return;
    setCopiedField(null);
    setActionError(null);
  }, [courier?.id]);

  useEffect(() => {
    if (!courier) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [courier, onClose]);

  if (!courier || typeof document === 'undefined') {
    return null;
  }

  const isBusy = busyCourierId === courier.id;
  const statusSpec = COURIER_STATUS_SPEC[courier.status];
  const availabilitySpec = COURIER_AVAILABILITY_SPEC[courier.availabilityStatus];
  const typeSpec = COURIER_TYPE_SPEC[normalizeCourierType(courier.courierType)];
  const formattedPhone = formatCustomerPhoneBR(courier.phone);
  const whatsappRaw = courier.whatsapp || courier.phone;
  const formattedWhatsapp = formatCustomerPhoneBR(whatsappRaw);
  const whatsappUrl = buildWhatsappUrlBR(whatsappRaw);
  const initials = getUserInitials(courier.name, courier.email);

  async function handleCopy(field: 'phone' | 'whatsapp', value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setActionError('Não foi possível copiar o contato automaticamente.');
    }
  }

  async function runAction(fn: () => Promise<void>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a ação solicitada.',
      );
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="courier-profile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full sm:max-w-xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#172033] font-extrabold text-sm flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h2
                id="courier-profile-title"
                className="text-base sm:text-lg font-extrabold text-[#172033] tracking-tight truncate"
              >
                {courier.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${statusSpec.containerClass}`}
                >
                  {courier.status === 'active' ? (
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>{statusSpec.label}</span>
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${availabilitySpec.containerClass}`}
                >
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  <span>{availabilitySpec.label}</span>
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${typeSpec.containerClass}`}
                >
                  <span>{typeSpec.label}</span>
                </span>

                {activeDeliveriesCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border bg-[#FFFBEB] border-[#FDE68A] text-[#92400E] text-[11px] font-semibold">
                    <span>
                      Ocupado · {activeDeliveriesCount} entrega
                      {activeDeliveriesCount > 1 ? 's' : ''}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Fechar detalhes do entregador"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F7F8FC]/60">
          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Contato e Documentos */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
              Contato e identificação
            </h3>

            <div className="space-y-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#172033]">
                  <Phone className="w-4 h-4 text-[#778094]" aria-hidden="true" />
                  <span className="text-xs text-[#778094]">Telefone:</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formattedPhone}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('phone', formattedPhone)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E8EAF0] bg-[#F7F8FC] hover:border-[#D5D9E4] text-[11px] font-semibold text-[#172033] cursor-pointer"
                >
                  {copiedField === 'phone' ? (
                    <>
                      <Check className="w-3 h-3 text-[#15803D]" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#172033]">
                  <MessageCircle
                    className="w-4 h-4 text-[#15803D]"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-[#778094]">WhatsApp:</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formattedWhatsapp}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopy('whatsapp', formattedWhatsapp)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E8EAF0] bg-[#F7F8FC] hover:border-[#D5D9E4] text-[11px] font-semibold text-[#172033] cursor-pointer"
                  >
                    {copiedField === 'whatsapp' ? (
                      <>
                        <Check className="w-3 h-3 text-[#15803D]" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>

                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[11px] font-semibold text-[#15803D] hover:bg-[#D1FAE5]"
                    >
                      <MessageCircle className="w-3 h-3" aria-hidden="true" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#E8EAF0] text-xs">
                <div className="flex items-center gap-2 text-[#172033] min-w-0">
                  <Mail
                    className="w-3.5 h-3.5 text-[#778094] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[#778094] shrink-0">E-mail:</span>
                  <span className="truncate font-medium">
                    {courier.email || 'Não informado'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[#172033]">
                  <FileText
                    className="w-3.5 h-3.5 text-[#778094] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[#778094]">CPF:</span>
                  <span className="font-mono tabular-nums font-medium">
                    {courier.cpf ? formatCpfBR(courier.cpf) : 'Não informado'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[#172033] sm:col-span-2">
                  <Calendar
                    className="w-3.5 h-3.5 text-[#778094] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[#778094]">Data de cadastro:</span>
                  <span className="font-mono tabular-nums font-medium">
                    {formatDateOnlyBR(courier.createdAtMs)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Dados da Motocicleta */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Bike className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
                Motocicleta
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div>
                <span className="block text-[11px] text-[#778094]">Marca</span>
                <span className="font-semibold text-[#172033]">
                  {courier.motorcycleBrand || '—'}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#778094]">Modelo</span>
                <span className="font-semibold text-[#172033]">
                  {courier.motorcycleModel || '—'}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#778094]">Cor</span>
                <span className="font-semibold text-[#172033]">
                  {courier.motorcycleColor || '—'}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#778094]">Placa</span>
                <span className="font-bold font-mono uppercase tabular-nums text-[#172033]">
                  {courier.motorcyclePlate || '—'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-[#778094] pt-1 border-t border-[#E8EAF0]">
              {formatCourierMotorcycleSummary(courier)}
            </p>
          </section>

          {/* Observações internas */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
              Observações internas
            </h3>
            <p className="text-xs sm:text-sm text-[#172033] leading-relaxed whitespace-pre-wrap">
              {courier.notes || 'Nenhuma observação cadastrada.'}
            </p>
          </section>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                onClose();
                onEdit(courier);
              }}
              className="mgw-btn-secondary"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Editar</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction(() => onToggleStatus(courier))}
              className="min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {courier.status === 'active' ? 'Desativar' : 'Ativar'}
              </span>
            </button>

            {courier.status === 'active' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(() => onToggleAvailability(courier))
                }
                className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  courier.availabilityStatus === 'available'
                    ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] hover:bg-[#FEE2E2]'
                    : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {courier.availabilityStatus === 'available'
                    ? 'Marcar indisponível'
                    : 'Marcar disponível'}
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRequestDelete(courier)}
            className="min-h-[38px] px-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Excluir</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
