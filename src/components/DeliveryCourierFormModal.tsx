import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';
import type {
  DeliveryCourierAvailability,
  DeliveryCourierInput,
  DeliveryCourierRecord,
  DeliveryCourierStatus,
  DeliveryCourierType,
} from '../types/finance';
import {
  findDuplicateCourierByPhone,
  formatCpfBR,
  formatCustomerPhoneBR,
  formatMotorcyclePlate,
  formatPhoneMaskInput,
  isValidCustomerPhone,
  isValidOptionalCpf,
} from '../utils/deliveryCouriers';

interface DeliveryCourierFormModalProps {
  isOpen: boolean;
  editingCourier: DeliveryCourierRecord | null;
  existingCouriers: DeliveryCourierRecord[];
  onClose: () => void;
  onSubmit: (
    input: DeliveryCourierInput,
    editingId?: string,
  ) => Promise<void>;
  onOpenExistingCourier?: (courierId: string) => void;
}

export function DeliveryCourierFormModal({
  isOpen,
  editingCourier,
  existingCouriers,
  onClose,
  onSubmit,
  onOpenExistingCourier,
}: DeliveryCourierFormModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [motorcycleBrand, setMotorcycleBrand] = useState('');
  const [motorcycleModel, setMotorcycleModel] = useState('');
  const [motorcycleColor, setMotorcycleColor] = useState('');
  const [motorcyclePlate, setMotorcyclePlate] = useState('');
  const [courierType, setCourierType] = useState<DeliveryCourierType>('own');
  const [status, setStatus] = useState<DeliveryCourierStatus>('active');
  const [availabilityStatus, setAvailabilityStatus] =
    useState<DeliveryCourierAvailability>('available');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    if (editingCourier) {
      setName(editingCourier.name);
      setPhone(formatCustomerPhoneBR(editingCourier.phone));
      setWhatsapp(
        editingCourier.whatsapp
          ? formatCustomerPhoneBR(editingCourier.whatsapp)
          : '',
      );
      setCpf(editingCourier.cpf ? formatCpfBR(editingCourier.cpf) : '');
      setEmail(editingCourier.email);
      setMotorcycleBrand(editingCourier.motorcycleBrand);
      setMotorcycleModel(editingCourier.motorcycleModel);
      setMotorcycleColor(editingCourier.motorcycleColor);
      setMotorcyclePlate(
        editingCourier.motorcyclePlate
          ? formatMotorcyclePlate(editingCourier.motorcyclePlate)
          : '',
      );
      setCourierType(editingCourier.courierType === 'outsourced' ? 'outsourced' : 'own');
      setStatus(editingCourier.status);
      setAvailabilityStatus(
        editingCourier.status === 'inactive'
          ? 'unavailable'
          : editingCourier.availabilityStatus,
      );
      setNotes(editingCourier.notes);
    } else {
      setName('');
      setPhone('');
      setWhatsapp('');
      setCpf('');
      setEmail('');
      setMotorcycleBrand('');
      setMotorcycleModel('');
      setMotorcycleColor('');
      setMotorcyclePlate('');
      setCourierType('own');
      setStatus('active');
      setAvailabilityStatus('available');
      setNotes('');
    }
  }, [isOpen, editingCourier]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  const duplicateCourier = useMemo(
    () =>
      findDuplicateCourierByPhone(
        existingCouriers,
        phone,
        editingCourier?.id ?? null,
      ),
    [existingCouriers, phone, editingCourier?.id],
  );

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  function handleStatusChange(nextStatus: DeliveryCourierStatus) {
    setStatus(nextStatus);
    if (nextStatus === 'inactive') {
      setAvailabilityStatus('unavailable');
    }
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError('Informe o nome completo do entregador (mínimo 2 caracteres).');
      return;
    }
    if (!isValidCustomerPhone(phone)) {
      setError('Informe um telefone válido com DDD (10 ou 11 dígitos).');
      return;
    }
    if (duplicateCourier) {
      setError(
        `Este telefone já está vinculado ao entregador "${duplicateCourier.name}".`,
      );
      return;
    }
    if (whatsapp.trim() && !isValidCustomerPhone(whatsapp)) {
      setError('Informe um WhatsApp válido com DDD ou deixe o campo em branco.');
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

    const effectiveAvailability: DeliveryCourierAvailability =
      status === 'inactive' ? 'unavailable' : availabilityStatus;

    setSaving(true);
    try {
      await onSubmit(
        {
          name: cleanName,
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          cpf: cpf.replace(/\D/g, ''),
          email: email.trim().toLowerCase(),
          motorcycleBrand: motorcycleBrand.trim(),
          motorcycleModel: motorcycleModel.trim(),
          motorcycleColor: motorcycleColor.trim(),
          motorcyclePlate: formatMotorcyclePlate(motorcyclePlate),
          courierType,
          status,
          availabilityStatus: effectiveAvailability,
          notes: notes.trim(),
        },
        editingCourier?.id,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar o entregador.',
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-courier-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              <Bike className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="delivery-courier-form-title"
                className="text-base font-extrabold text-[#172033] tracking-tight truncate"
              >
                {editingCourier ? 'Editar entregador' : 'Novo entregador'}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                Cadastro administrativo da equipe de motoboys · não requer conta de acesso.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar formulário de entregador"
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

          {/* Bloco 1: Dados Pessoais */}
          <fieldset className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3.5">
            <legend className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-[#778094]">
              Dados pessoais
            </legend>

            <div>
              <label
                htmlFor="courier-name"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                Nome completo <span className="text-[#E35D62]">*</span>
              </label>
              <input
                id="courier-name"
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Lucas Ferreira Silva"
                className="w-full min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="courier-phone"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Telefone <span className="text-[#E35D62]">*</span>
                </label>
                <div className="relative">
                  <Phone
                    className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="courier-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneMaskInput(e.target.value))}
                    placeholder="(92) 99999-0000"
                    className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="courier-whatsapp"
                    className="block text-xs font-semibold text-[#172033]"
                  >
                    WhatsApp (opcional)
                  </label>
                  {isValidCustomerPhone(phone) && phone !== whatsapp && (
                    <button
                      type="button"
                      onClick={() => setWhatsapp(phone)}
                      className="text-[11px] font-semibold text-[#8A6200] hover:underline cursor-pointer"
                    >
                      Usar mesmo telefone
                    </button>
                  )}
                </div>
                <div className="relative">
                  <MessageCircle
                    className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="courier-whatsapp"
                    type="tel"
                    value={whatsapp}
                    onChange={(e) =>
                      setWhatsapp(formatPhoneMaskInput(e.target.value))
                    }
                    placeholder="(92) 99999-0000"
                    className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {duplicateCourier && (
              <div className="p-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] flex flex-wrap items-center justify-between gap-2">
                <span>
                  Telefone já cadastrado para{' '}
                  <strong className="font-semibold text-[#172033]">
                    {duplicateCourier.name}
                  </strong>
                  .
                </span>
                {onOpenExistingCourier && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenExistingCourier(duplicateCourier.id);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#FDE68A] font-semibold text-[#92400E] hover:bg-[#FEF3C7] cursor-pointer"
                  >
                    <span>Abrir detalhes</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="courier-cpf"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  CPF (opcional)
                </label>
                <input
                  id="courier-cpf"
                  type="text"
                  inputMode="numeric"
                  maxLength={14}
                  value={cpf}
                  onChange={(e) => setCpf(formatCpfBR(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="courier-email"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  E-mail (opcional)
                </label>
                <div className="relative">
                  <Mail
                    className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="courier-email"
                    type="email"
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="motoboy@email.com"
                    className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Bloco 2: Dados da Motocicleta */}
          <fieldset className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3">
            <legend className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-[#778094]">
              Dados da motocicleta (opcional)
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="courier-moto-brand"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Marca
                </label>
                <input
                  id="courier-moto-brand"
                  type="text"
                  maxLength={60}
                  value={motorcycleBrand}
                  onChange={(e) => setMotorcycleBrand(e.target.value)}
                  placeholder="Ex.: Honda"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="courier-moto-model"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Modelo
                </label>
                <input
                  id="courier-moto-model"
                  type="text"
                  maxLength={80}
                  value={motorcycleModel}
                  onChange={(e) => setMotorcycleModel(e.target.value)}
                  placeholder="Ex.: CG 160 Titan"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="courier-moto-color"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Cor
                </label>
                <input
                  id="courier-moto-color"
                  type="text"
                  maxLength={40}
                  value={motorcycleColor}
                  onChange={(e) => setMotorcycleColor(e.target.value)}
                  placeholder="Ex.: Preta"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="courier-moto-plate"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Placa
                </label>
                <input
                  id="courier-moto-plate"
                  type="text"
                  maxLength={8}
                  value={motorcyclePlate}
                  onChange={(e) =>
                    setMotorcyclePlate(formatMotorcyclePlate(e.target.value))
                  }
                  placeholder="ABC1D23"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-sm font-mono uppercase tabular-nums text-[#172033] focus:border-[#F5B900] focus:outline-none"
                />
              </div>
            </div>
          </fieldset>

          {/* Bloco 3: Informações Operacionais */}
          <fieldset className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3.5">
            <legend className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-[#778094]">
              Informações operacionais
            </legend>

            <div>
              <span className="block text-xs font-semibold text-[#172033] mb-1.5">
                Tipo de entregador
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCourierType('own')}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    courierType === 'own'
                      ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]'
                      : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                  }`}
                >
                  <span>Próprio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCourierType('outsourced')}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    courierType === 'outsourced'
                      ? 'bg-[#F5F3FF] border-[#C4B5FD] text-[#6D28D9]'
                      : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                  }`}
                >
                  <span>Terceirizado</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <span className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Situação cadastral
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusChange('active')}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      status === 'active'
                        ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]'
                        : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Ativo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange('inactive')}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      status === 'inactive'
                        ? 'bg-[#F3F4F6] border-[#D1D5DB] text-[#374151]'
                        : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Inativo</span>
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#172033] mb-1.5">
                  Disponibilidade operacional
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={status === 'inactive'}
                    onClick={() => setAvailabilityStatus('available')}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      status === 'inactive'
                        ? 'bg-[#F7F8FC] border-[#E8EAF0] text-[#9CA3AF] cursor-not-allowed opacity-60'
                        : availabilityStatus === 'available'
                          ? 'bg-[#FFFBEB] border-[#F5B900] text-[#92400E] cursor-pointer'
                          : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033] cursor-pointer'
                    }`}
                  >
                    <span>Disponível</span>
                  </button>

                  <button
                    type="button"
                    disabled={status === 'inactive'}
                    onClick={() => setAvailabilityStatus('unavailable')}
                    className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      status === 'inactive'
                        ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] cursor-not-allowed'
                        : availabilityStatus === 'unavailable'
                          ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] cursor-pointer'
                          : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033] cursor-pointer'
                    }`}
                  >
                    <span>Indisponível</span>
                  </button>
                </div>
                {status === 'inactive' && (
                  <p className="text-[11px] text-[#778094] mt-1">
                    Entregador inativo permanece automaticamente indisponível.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="courier-notes"
                className="block text-xs font-semibold text-[#172033] mb-1.5"
              >
                Observações internas (opcional)
              </label>
              <textarea
                id="courier-notes"
                rows={2}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: Atende turno da noite, possui bag térmica grande, etc."
                className="w-full p-3 rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none resize-y"
              />
            </div>
          </fieldset>

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
              disabled={saving || Boolean(duplicateCourier)}
              className="mgw-btn-primary disabled:opacity-60"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>
                {saving
                  ? 'Salvando...'
                  : editingCourier
                    ? 'Salvar alterações'
                    : 'Cadastrar entregador'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
