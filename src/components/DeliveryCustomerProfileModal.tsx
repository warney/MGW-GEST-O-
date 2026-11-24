import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  Edit3,
  FileText,
  History,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  DeliveryCustomerAddressInput,
  DeliveryCustomerAddressRecord,
  DeliveryCustomerInput,
  DeliveryCustomerRecord,
  DeliveryCustomerWithMetrics,
  DigitalMenuSettings,
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import {
  CLASSIFICATION_BADGE_SPEC,
  formatCepBR,
  formatCpfBR,
  formatCustomerAddressSummary,
  formatCustomerPhoneBR,
} from '../utils/deliveryCustomers';
import { formatCurrencyBRL } from '../utils/finance';
import {
  buildWhatsappUrl,
  formatDateTimeBR,
  formatOrderNumber,
} from '../utils/onlineOrders';
import {
  getOrderStatusBadgeSpec,
  summarizeOrderItems,
} from '../utils/ordersCenter';
import { getUserInitials } from '../utils/shellProfile';

interface DeliveryCustomerProfileModalProps {
  customerProfile: DeliveryCustomerWithMetrics | null;
  digitalMenuSettings?: DigitalMenuSettings;
  onClose: () => void;
  onEditCustomer: (customer: DeliveryCustomerRecord) => void;
  onUpdateCustomerNotes: (
    customer: DeliveryCustomerRecord,
    input: DeliveryCustomerInput,
  ) => Promise<void>;
  onSaveAddress: (
    customerId: string,
    input: DeliveryCustomerAddressInput,
    addressId?: string,
    hasExistingAddresses?: boolean,
  ) => Promise<void>;
  onDeleteAddress: (
    customerId: string,
    addressId: string,
    remainingAddresses: DeliveryCustomerAddressRecord[],
  ) => Promise<void>;
  onSetPrimaryAddress: (customerId: string, addressId: string) => Promise<void>;
  onOpenOrderDetails: (order: OnlineOrderRecord) => void;
  onTransitionOrderStatus?: (
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
    reason?: string,
  ) => Promise<void>;
}

const EMPTY_ADDR_FORM: DeliveryCustomerAddressInput = {
  label: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  reference: '',
  city: '',
  state: '',
  isPrimary: false,
};

function formatDateOnlyBR(msOrYmd: number | string | null): string {
  if (msOrYmd === null || msOrYmd === '') return '—';
  if (typeof msOrYmd === 'string') {
    const parts = msOrYmd.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return msOrYmd;
  }
  if (!Number.isFinite(msOrYmd) || msOrYmd <= 0) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(msOrYmd));
}

export function DeliveryCustomerProfileModal({
  customerProfile,
  digitalMenuSettings,
  onClose,
  onEditCustomer,
  onUpdateCustomerNotes,
  onSaveAddress,
  onDeleteAddress,
  onSetPrimaryAddress,
  onOpenOrderDetails,
}: DeliveryCustomerProfileModalProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] =
    useState<DeliveryCustomerAddressInput>(EMPTY_ADDR_FORM);
  const [addressBusy, setAddressBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const historySectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!customerProfile) return;
    setCopiedPhone(false);
    setEditingNotes(false);
    setNoteDraft(customerProfile.customer.notes);
    setAddressFormOpen(false);
    setEditingAddressId(null);
    setAddressForm(EMPTY_ADDR_FORM);
    setActionError(null);
  }, [customerProfile?.customer.id]);

  useEffect(() => {
    if (!customerProfile) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [customerProfile, onClose]);

  if (!customerProfile || typeof document === 'undefined') {
    return null;
  }

  const {
    customer,
    addresses,
    orders,
    validOrdersCount,
    cancelledOrdersCount,
    totalSpent,
    averageTicket,
    firstOrderAtMs,
    lastOrderAtMs,
    classification,
  } = customerProfile;

  const badge = CLASSIFICATION_BADGE_SPEC[classification];
  const formattedPhone = formatCustomerPhoneBR(customer.phone);
  const storeName = digitalMenuSettings?.storeName?.trim() || 'MGW Gestão';
  const whatsappUrl = buildWhatsappUrl(
    customer.phone,
    `Olá ${customer.name}! Aqui é da equipe ${storeName}.`,
  );

  async function handleCopyPhone() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formattedPhone);
      }
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      setActionError('Não foi possível copiar o telefone automaticamente.');
    }
  }

  async function handleSaveNote(e: FormEvent) {
    e.preventDefault();
    setSavingNote(true);
    setActionError(null);
    try {
      await onUpdateCustomerNotes(customer, {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        cpf: customer.cpf,
        birthDate: customer.birthDate,
        notes: noteDraft.trim(),
      });
      setEditingNotes(false);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar a observação.',
      );
    } finally {
      setSavingNote(false);
    }
  }

  function openNewAddressForm() {
    setEditingAddressId(null);
    setAddressForm({
      ...EMPTY_ADDR_FORM,
      isPrimary: addresses.length === 0,
    });
    setAddressFormOpen(true);
    setActionError(null);
  }

  function openEditAddressForm(addr: DeliveryCustomerAddressRecord) {
    setEditingAddressId(addr.id);
    setAddressForm({
      label: addr.label,
      cep: addr.cep,
      street: addr.street,
      number: addr.number,
      neighborhood: addr.neighborhood,
      complement: addr.complement,
      reference: addr.reference,
      city: addr.city,
      state: addr.state,
      isPrimary: addr.isPrimary,
    });
    setAddressFormOpen(true);
    setActionError(null);
  }

  async function handleAddressSubmit(e: FormEvent) {
    e.preventDefault();
    if (addressForm.street.trim().length < 3) {
      setActionError('Informe a rua/logradouro do endereço.');
      return;
    }
    setAddressBusy(true);
    setActionError(null);
    try {
      await onSaveAddress(
        customer.id,
        addressForm,
        editingAddressId ?? undefined,
        addresses.length > 0,
      );
      setAddressFormOpen(false);
      setEditingAddressId(null);
      setAddressForm(EMPTY_ADDR_FORM);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao salvar endereço.',
      );
    } finally {
      setAddressBusy(false);
    }
  }

  async function handleRemoveAddress(addr: DeliveryCustomerAddressRecord) {
    setAddressBusy(true);
    setActionError(null);
    try {
      await onDeleteAddress(customer.id, addr.id, addresses);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao excluir endereço.',
      );
    } finally {
      setAddressBusy(false);
    }
  }

  async function handleSetPrimary(addrId: string) {
    setAddressBusy(true);
    setActionError(null);
    try {
      await onSetPrimaryAddress(customer.id, addrId);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Erro ao definir endereço principal.',
      );
    } finally {
      setAddressBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-profile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div
        data-testid={`customer-profile-modal-${customer.id}`}
        className="w-full sm:max-w-3xl max-h-[94vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_20px_48px_rgba(23,32,51,0.18)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3 bg-white shrink-0">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#172033] text-white text-sm font-extrabold flex items-center justify-center shrink-0">
              {getUserInitials(customer.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="customer-profile-title"
                  className="text-base sm:text-lg font-extrabold text-[#172033] tracking-tight truncate"
                >
                  {customer.name}
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${badge.containerClass}`}
                >
                  {badge.label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#778094] mt-1">
                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#172033] font-medium">
                  <Phone className="w-3.5 h-3.5 text-[#778094]" aria-hidden="true" />
                  {formattedPhone}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#778094]" aria-hidden="true" />
                  Cliente desde {formatDateOnlyBR(customer.createdAtMs)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar perfil do cliente"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F7F8FC]/60">
          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEditCustomer(customer)}
              className="mgw-btn-secondary text-xs"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Editar cliente</span>
            </button>

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] text-[#15803D] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Abrir conversa no WhatsApp</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => void handleCopyPhone()}
              className="mgw-btn-secondary text-xs"
            >
              {copiedPhone ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#16A36A]" aria-hidden="true" />
                  <span className="text-[#16A36A]">Telefone copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copiar telefone</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setNoteDraft(customer.notes);
                setEditingNotes(true);
              }}
              className="mgw-btn-secondary text-xs"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {customer.notes ? 'Editar observação' : 'Adicionar observação'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                historySectionRef.current?.scrollIntoView({ behavior: 'smooth' })
              }
              className="mgw-btn-secondary text-xs"
            >
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Consultar histórico</span>
            </button>
          </div>

          {/* 5 Real Purchase Indicators */}
          <section aria-label="Indicadores de compras do cliente">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-white border border-[#E8EAF0] rounded-xl p-3">
                <p className="text-[11px] font-medium text-[#778094]">
                  Total de pedidos
                </p>
                <p className="text-lg font-extrabold text-[#172033] font-mono tabular-nums mt-0.5">
                  {validOrdersCount}
                </p>
              </div>
              <div className="bg-white border border-[#E8EAF0] rounded-xl p-3">
                <p className="text-[11px] font-medium text-[#778094]">
                  Total comprado
                </p>
                <p className="text-lg font-extrabold text-[#172033] font-mono tabular-nums mt-0.5">
                  {formatCurrencyBRL(totalSpent)}
                </p>
              </div>
              <div className="bg-white border border-[#E8EAF0] rounded-xl p-3">
                <p className="text-[11px] font-medium text-[#778094]">
                  Ticket médio
                </p>
                <p className="text-lg font-extrabold text-[#172033] font-mono tabular-nums mt-0.5">
                  {formatCurrencyBRL(averageTicket)}
                </p>
              </div>
              <div className="bg-white border border-[#E8EAF0] rounded-xl p-3">
                <p className="text-[11px] font-medium text-[#778094]">
                  Primeiro pedido
                </p>
                <p className="text-sm font-bold text-[#172033] font-mono tabular-nums mt-1">
                  {formatDateOnlyBR(firstOrderAtMs)}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-white border border-[#E8EAF0] rounded-xl p-3">
                <p className="text-[11px] font-medium text-[#778094]">
                  Última compra
                </p>
                <p className="text-sm font-bold text-[#172033] font-mono tabular-nums mt-1">
                  {formatDateOnlyBR(lastOrderAtMs)}
                </p>
              </div>
            </div>
            {cancelledOrdersCount > 0 && (
              <p className="text-[11px] text-[#778094] mt-1.5">
                {cancelledOrdersCount} pedido(s) cancelado(s) ou recusado(s) no histórico não entram no total comprado nem no ticket médio.
              </p>
            )}
          </section>

          {/* Identification & Notes */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                Identificação
              </h3>
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#778094]">Telefone / WhatsApp</dt>
                  <dd className="font-mono tabular-nums font-semibold text-[#172033]">
                    {formattedPhone}
                  </dd>
                </div>
                {customer.email && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#778094] inline-flex items-center gap-1">
                      <Mail className="w-3 h-3" aria-hidden="true" />
                      E-mail
                    </dt>
                    <dd className="font-medium text-[#172033] truncate max-w-[200px]">
                      {customer.email}
                    </dd>
                  </div>
                )}
                {customer.cpf && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#778094]">CPF</dt>
                    <dd className="font-mono tabular-nums font-medium text-[#172033]">
                      {formatCpfBR(customer.cpf)}
                    </dd>
                  </div>
                )}
                {customer.birthDate && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#778094]">Nascimento</dt>
                    <dd className="font-mono tabular-nums font-medium text-[#172033]">
                      {formatDateOnlyBR(customer.birthDate)}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#778094]">Cadastro</dt>
                  <dd className="font-mono tabular-nums text-[#172033]">
                    {formatDateTimeBR(customer.createdAtMs)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                  Observações
                </h3>
                {!editingNotes && (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDraft(customer.notes);
                      setEditingNotes(true);
                    }}
                    className="text-[11px] font-semibold text-[#8A6200] hover:underline cursor-pointer"
                  >
                    {customer.notes ? 'Alterar' : 'Adicionar'}
                  </button>
                )}
              </div>

              {editingNotes ? (
                <form onSubmit={(e) => void handleSaveNote(e)} className="space-y-2">
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Preferências de entrega, restrições, recados internos..."
                    className="w-full p-2.5 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingNotes(false)}
                      disabled={savingNote}
                      className="px-2.5 py-1.5 rounded-lg border border-[#E8EAF0] text-xs font-semibold text-[#778094] hover:text-[#172033] cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingNote}
                      className="px-3 py-1.5 rounded-lg bg-[#F5B900] hover:bg-[#FFC928] text-xs font-bold text-[#172033] cursor-pointer"
                    >
                      {savingNote ? 'Salvando...' : 'Salvar nota'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-[#4B5563] whitespace-pre-wrap leading-relaxed">
                  {customer.notes || 'Nenhuma observação registrada para este cliente.'}
                </p>
              )}
            </div>
          </section>

          {/* Saved Addresses */}
          <section className="bg-white border border-[#E8EAF0] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8EAF0] flex items-center justify-between gap-2 bg-[#F7F8FC]">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-[#B38300] shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-bold text-[#172033]">
                  Endereços salvos ({addresses.length})
                </h3>
              </div>
              {!addressFormOpen && (
                <button
                  type="button"
                  onClick={openNewAddressForm}
                  className="min-h-[32px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Adicionar endereço</span>
                </button>
              )}
            </div>

            {addressFormOpen && (
              <form
                onSubmit={(e) => void handleAddressSubmit(e)}
                className="p-4 border-b border-[#E8EAF0] bg-[#FFFBEB]/40 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[#172033]">
                    {editingAddressId ? 'Editar endereço' : 'Novo endereço'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddressFormOpen(false)}
                    className="text-xs text-[#778094] hover:text-[#172033] cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    maxLength={40}
                    value={addressForm.label || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({ ...p, label: e.target.value }))
                    }
                    placeholder="Etiqueta (Casa, Trabalho)"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={9}
                    value={addressForm.cep || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({
                        ...p,
                        cep: formatCepBR(e.target.value),
                      }))
                    }
                    placeholder="CEP (00000-000)"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs font-mono tabular-nums text-[#172033]"
                  />
                  <input
                    type="text"
                    maxLength={30}
                    value={addressForm.number || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({ ...p, number: e.target.value }))
                    }
                    placeholder="Número"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                  />
                </div>

                <input
                  type="text"
                  required
                  maxLength={200}
                  value={addressForm.street}
                  onChange={(e) =>
                    setAddressForm((p) => ({ ...p, street: e.target.value }))
                  }
                  placeholder="Rua / Avenida *"
                  className="w-full min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    maxLength={100}
                    value={addressForm.neighborhood || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({
                        ...p,
                        neighborhood: e.target.value,
                      }))
                    }
                    placeholder="Bairro"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                  />
                  <input
                    type="text"
                    maxLength={120}
                    value={addressForm.complement || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({
                        ...p,
                        complement: e.target.value,
                      }))
                    }
                    placeholder="Complemento"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    maxLength={160}
                    value={addressForm.reference || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({
                        ...p,
                        reference: e.target.value,
                      }))
                    }
                    placeholder="Ponto de referência"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                  />
                  <input
                    type="text"
                    maxLength={100}
                    value={addressForm.city || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({ ...p, city: e.target.value }))
                    }
                    placeholder="Cidade"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs text-[#172033]"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    value={addressForm.state || ''}
                    onChange={(e) =>
                      setAddressForm((p) => ({
                        ...p,
                        state: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="UF"
                    className="min-h-[36px] px-3 rounded-lg border border-[#E8EAF0] bg-white text-xs uppercase text-[#172033]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#172033] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(addressForm.isPrimary)}
                      onChange={(e) =>
                        setAddressForm((p) => ({
                          ...p,
                          isPrimary: e.target.checked,
                        }))
                      }
                      className="rounded border-[#D5D9E4]"
                    />
                    Definir como endereço principal
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddressFormOpen(false)}
                      disabled={addressBusy}
                      className="px-3 py-1.5 rounded-lg border border-[#E8EAF0] bg-white text-xs font-semibold text-[#778094]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={addressBusy}
                      className="px-3 py-1.5 rounded-lg bg-[#F5B900] hover:bg-[#FFC928] text-xs font-bold text-[#172033] cursor-pointer"
                    >
                      {addressBusy ? 'Salvando...' : 'Salvar endereço'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {addresses.length === 0 ? (
              <div className="p-4 text-xs text-[#778094]">
                Nenhum endereço salvo ainda. Cadastre um endereço acima ou aguarde o próximo pedido de delivery do cliente.
              </div>
            ) : (
              <div className="divide-y divide-[#E8EAF0]">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#172033]">
                          {addr.label || 'Endereço'}
                        </span>
                        {addr.isPrimary && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[10px] font-bold text-[#92400E]">
                            <Star className="w-2.5 h-2.5 fill-[#F5B900] text-[#B38300]" />
                            Principal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#4B5563]">
                        {formatCustomerAddressSummary(addr)}
                      </p>
                      {addr.reference && (
                        <p className="text-[11px] text-[#778094]">
                          Ref.: {addr.reference}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!addr.isPrimary && (
                        <button
                          type="button"
                          disabled={addressBusy}
                          onClick={() => void handleSetPrimary(addr.id)}
                          className="min-h-[30px] px-2.5 rounded-lg border border-[#E8EAF0] hover:border-[#F5B900] text-[11px] font-semibold text-[#172033] cursor-pointer"
                        >
                          Tornar principal
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={addressBusy}
                        onClick={() => openEditAddressForm(addr)}
                        aria-label="Editar endereço"
                        className="w-8 h-8 rounded-lg border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={addressBusy}
                        onClick={() => void handleRemoveAddress(addr)}
                        aria-label="Excluir endereço"
                        className="w-8 h-8 rounded-lg border border-[#E8EAF0] text-[#778094] hover:text-[#E35D62] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Purchase History */}
          <section
            ref={historySectionRef}
            aria-label="Histórico de pedidos do cliente"
            className="bg-white border border-[#E8EAF0] rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#E8EAF0] flex items-center justify-between gap-2 bg-[#F7F8FC]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
                <h3 className="text-xs font-bold text-[#172033]">
                  Histórico de pedidos ({orders.length})
                </h3>
              </div>
              <span className="text-[11px] text-[#778094]">
                Toque em um pedido para ver detalhes
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="p-5 text-center text-xs text-[#778094]">
                Este cliente ainda não possui pedidos online vinculados.
              </div>
            ) : (
              <div className="divide-y divide-[#E8EAF0]">
                {orders.map((order) => {
                  const statusSpec = getOrderStatusBadgeSpec(order.status);
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => onOpenOrderDetails(order)}
                      className="w-full px-4 py-3 text-left hover:bg-[#F7F8FC] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold font-mono tabular-nums text-[#172033]">
                            {formatOrderNumber(order.orderNumber)}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusSpec.containerClass}`}
                          >
                            {statusSpec.label}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#778094]">
                            {order.fulfillmentType === 'delivery' ? (
                              <>
                                <Truck className="w-3 h-3" aria-hidden="true" />
                                Entrega
                              </>
                            ) : (
                              <>
                                <Package className="w-3 h-3" aria-hidden="true" />
                                Retirada
                              </>
                            )}
                          </span>
                          <span className="text-[11px] text-[#778094]">
                            · {order.paymentMethod}
                          </span>
                        </div>
                        <p className="text-xs text-[#4B5563] truncate">
                          {(() => {
                            const itemSummary = summarizeOrderItems(order);
                            return `${itemSummary.countLabel} · ${itemSummary.previewText}`;
                          })()}
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                        <span className="text-sm font-extrabold font-mono tabular-nums text-[#172033]">
                          {formatCurrencyBRL(order.totalAmount)}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#778094]">
                          {formatDateTimeBR(order.createdAtMs)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
