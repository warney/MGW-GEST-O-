import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ExternalLink,
  MapPin,
  Phone,
  Save,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  DeliveryCustomerAddressInput,
  DeliveryCustomerInput,
  DeliveryCustomerRecord,
} from '../types/finance';
import {
  findDuplicateCustomerByPhone,
  formatCepBR,
  formatCpfBR,
  formatCustomerPhoneBR,
  formatPhoneMaskInput,
  hasNonEmptyAddressFields,
  isValidCustomerPhone,
  isValidOptionalCpf,
} from '../utils/deliveryCustomers';

interface DeliveryCustomerFormModalProps {
  isOpen: boolean;
  editingCustomer: DeliveryCustomerRecord | null;
  existingCustomers: DeliveryCustomerRecord[];
  onClose: () => void;
  onSubmit: (
    input: DeliveryCustomerInput,
    initialAddress?: DeliveryCustomerAddressInput | null,
    editingId?: string,
  ) => Promise<void>;
  onOpenExistingCustomer?: (customerId: string) => void;
}

const EMPTY_ADDRESS: DeliveryCustomerAddressInput = {
  label: 'Principal',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  reference: '',
  city: '',
  state: '',
  isPrimary: true,
};

export function DeliveryCustomerFormModal({
  isOpen,
  editingCustomer,
  existingCustomers,
  onClose,
  onSubmit,
  onOpenExistingCustomer,
}: DeliveryCustomerFormModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showInitialAddress, setShowInitialAddress] = useState(false);
  const [address, setAddress] = useState<DeliveryCustomerAddressInput>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    if (editingCustomer) {
      setName(editingCustomer.name);
      setPhone(formatCustomerPhoneBR(editingCustomer.phone));
      setEmail(editingCustomer.email);
      setCpf(editingCustomer.cpf ? formatCpfBR(editingCustomer.cpf) : '');
      setBirthDate(editingCustomer.birthDate ?? '');
      setNotes(editingCustomer.notes);
      setShowInitialAddress(false);
      setAddress(EMPTY_ADDRESS);
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setCpf('');
      setBirthDate('');
      setNotes('');
      setShowInitialAddress(true);
      setAddress(EMPTY_ADDRESS);
    }
  }, [isOpen, editingCustomer]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  const duplicateCustomer = useMemo(
    () =>
      findDuplicateCustomerByPhone(
        existingCustomers,
        phone,
        editingCustomer?.id ?? null,
      ),
    [existingCustomers, phone, editingCustomer?.id],
  );

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError('Informe o nome do cliente (mínimo 2 caracteres).');
      return;
    }
    if (!isValidCustomerPhone(phone)) {
      setError('Informe um telefone/WhatsApp válido com DDD (10 ou 11 dígitos).');
      return;
    }
    if (duplicateCustomer) {
      setError(
        `Este telefone já está vinculado ao cliente "${duplicateCustomer.name}".`,
      );
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail válido ou deixe em branco.');
      return;
    }
    if (!isValidOptionalCpf(cpf)) {
      setError('O CPF informado é inválido. Deixe em branco se preferir.');
      return;
    }

    const wantsInitialAddr =
      !editingCustomer &&
      showInitialAddress &&
      hasNonEmptyAddressFields(address);
    if (wantsInitialAddr && address.street.trim().length < 3) {
      setError('Informe a rua/logradouro do endereço inicial.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit(
        {
          name: cleanName,
          phone: phone.trim(),
          email: email.trim(),
          cpf: cpf.replace(/\D/g, ''),
          birthDate: birthDate.trim() || null,
          notes: notes.trim(),
        },
        wantsInitialAddr ? address : null,
        editingCustomer?.id,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível salvar o cliente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-customer-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full sm:max-w-xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="delivery-customer-form-title"
                className="text-base font-extrabold text-[#172033] tracking-tight truncate"
              >
                {editingCustomer ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                {editingCustomer
                  ? 'Atualize os dados cadastrais sem alterar pedidos anteriores.'
                  : 'Cadastre manualmente na carteira do estabelecimento.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar formulário de cliente"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form
          onSubmit={(e) => void handleFormSubmit(e)}
          className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F7F8FC]/60"
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

          <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3.5">
            <div>
              <label
                htmlFor="cust-name"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                Nome completo <span className="text-[#E35D62]">*</span>
              </label>
              <input
                id="cust-name"
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Maria Oliveira"
                className="w-full min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cust-phone"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                Telefone / WhatsApp <span className="text-[#E35D62]">*</span>
              </label>
              <div className="relative">
                <Phone
                  className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="cust-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneMaskInput(e.target.value))}
                  placeholder="(92) 99999-0000"
                  className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>

              {duplicateCustomer && (
                <div className="mt-2 p-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Telefone já cadastrado para{' '}
                    <strong className="font-semibold text-[#172033]">
                      {duplicateCustomer.name}
                    </strong>
                    .
                  </span>
                  {onOpenExistingCustomer && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExistingCustomer(duplicateCustomer.id);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#FDE68A] font-semibold text-[#92400E] hover:bg-[#FEF3C7] cursor-pointer"
                    >
                      <span>Abrir perfil</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="cust-email"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  E-mail (opcional)
                </label>
                <input
                  id="cust-email"
                  type="email"
                  maxLength={160}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cust-birth"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Data de nascimento (opcional)
                </label>
                <input
                  id="cust-birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="cust-cpf"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                CPF (opcional)
              </label>
              <input
                id="cust-cpf"
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={cpf}
                onChange={(e) => setCpf(formatCpfBR(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
              />
              <p className="text-[11px] text-[#778094] mt-1">
                Preenchimento opcional, utilizado apenas se o cliente solicitar identificação fiscal.
              </p>
            </div>

            <div>
              <label
                htmlFor="cust-notes"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                Observações internas (opcional)
              </label>
              <textarea
                id="cust-notes"
                rows={2}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: Prefere entrega sem buzinar, troco habitual, etc."
                className="w-full p-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none resize-y"
              />
            </div>
          </div>

          {!editingCustomer && (
            <div className="bg-white border border-[#E8EAF0] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowInitialAddress((prev) => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-[#F7F8FC] cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 text-xs font-bold text-[#172033]">
                  <MapPin className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
                  Endereço principal (opcional)
                </span>
                <span className="text-xs font-semibold text-[#778094]">
                  {showInitialAddress ? 'Ocultar' : 'Adicionar'}
                </span>
              </button>

              {showInitialAddress && (
                <div className="p-4 pt-2 border-t border-[#E8EAF0] space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Identificação
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={address.label || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({ ...prev, label: e.target.value }))
                        }
                        placeholder="Casa, Trabalho..."
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        CEP
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={9}
                        value={address.cep || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({
                            ...prev,
                            cep: formatCepBR(e.target.value),
                          }))
                        }
                        placeholder="69000-000"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Número
                      </label>
                      <input
                        type="text"
                        maxLength={30}
                        value={address.number || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({ ...prev, number: e.target.value }))
                        }
                        placeholder="123"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                      Rua / Avenida
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={address.street}
                      onChange={(e) =>
                        setAddress((prev) => ({ ...prev, street: e.target.value }))
                      }
                      placeholder="Ex.: Av. Djalma Batista"
                      className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Bairro
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={address.neighborhood || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({
                            ...prev,
                            neighborhood: e.target.value,
                          }))
                        }
                        placeholder="Centro"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Complemento
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={address.complement || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({
                            ...prev,
                            complement: e.target.value,
                          }))
                        }
                        placeholder="Apto 204, Bloco B"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                      Ponto de referência
                    </label>
                    <input
                      type="text"
                      maxLength={160}
                      value={address.reference || ''}
                      onChange={(e) =>
                        setAddress((prev) => ({
                          ...prev,
                          reference: e.target.value,
                        }))
                      }
                      placeholder="Próximo à padaria"
                      className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={address.city || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({ ...prev, city: e.target.value }))
                        }
                        placeholder="Manaus"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        UF
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={address.state || ''}
                        onChange={(e) =>
                          setAddress((prev) => ({
                            ...prev,
                            state: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="AM"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] text-xs uppercase text-[#172033] focus:border-[#F5B900] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="mgw-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || Boolean(duplicateCustomer)}
              className="mgw-btn-primary disabled:opacity-60"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>
                {saving
                  ? 'Salvando...'
                  : editingCustomer
                    ? 'Salvar alterações'
                    : 'Cadastrar cliente'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
