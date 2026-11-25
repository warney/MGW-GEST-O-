import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Clock,
  MapPin,
  Plus,
  Save,
  X,
} from 'lucide-react';
import type {
  DeliveryRegionInput,
  DeliveryRegionRecord,
  DeliveryRegionStatus,
} from '../types/finance';
import {
  deduplicateNeighborhoods,
  normalizeDeliveryGeoText,
  parseNeighborhoodListInput,
  SCHEDULE_DAY_OPTIONS,
  validateDeliveryRegionInput,
} from '../utils/deliveryRegions';

interface DeliveryRegionFormModalProps {
  isOpen: boolean;
  editingRegion: DeliveryRegionRecord | null;
  existingRegions: DeliveryRegionRecord[];
  defaultCity?: string;
  onClose: () => void;
  onSubmit: (input: DeliveryRegionInput, editingRegionId?: string) => Promise<void>;
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function DeliveryRegionFormModal({
  isOpen,
  editingRegion,
  existingRegions,
  defaultCity = '',
  onClose,
  onSubmit,
}: DeliveryRegionFormModalProps) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [neighborhoodInput, setNeighborhoodInput] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('5');
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('0');
  const [estimatedTime, setEstimatedTime] = useState('35 - 50 min');
  const [status, setStatus] = useState<DeliveryRegionStatus>('active');
  const [isTemporarilySuspended, setIsTemporarilySuspended] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<number[]>(ALL_WEEKDAYS);
  const [scheduleStart, setScheduleStart] = useState('18:00');
  const [scheduleEnd, setScheduleEnd] = useState('23:30');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitting(false);
    setNeighborhoodInput('');

    if (editingRegion) {
      setName(editingRegion.name);
      setCity(editingRegion.city);
      setNeighborhoods(editingRegion.neighborhoods);
      setDescription(editingRegion.description);
      setDeliveryFee(String(editingRegion.deliveryFee));
      setMinimumOrderAmount(String(editingRegion.minimumOrderAmount));
      setEstimatedTime(editingRegion.estimatedTime);
      setStatus(editingRegion.status);
      setIsTemporarilySuspended(editingRegion.isTemporarilySuspended);
      setSuspensionReason(editingRegion.suspensionReason);
      setScheduleEnabled(editingRegion.scheduleEnabled);
      setScheduleDays(
        editingRegion.scheduleDays.length > 0
          ? editingRegion.scheduleDays
          : ALL_WEEKDAYS,
      );
      setScheduleStart(editingRegion.scheduleStart || '18:00');
      setScheduleEnd(editingRegion.scheduleEnd || '23:30');
      setNotes(editingRegion.notes);
    } else {
      setName('');
      setCity(defaultCity);
      setNeighborhoods([]);
      setDescription('');
      setDeliveryFee('5');
      setMinimumOrderAmount('0');
      setEstimatedTime('35 - 50 min');
      setStatus('active');
      setIsTemporarilySuspended(false);
      setSuspensionReason('');
      setScheduleEnabled(false);
      setScheduleDays(ALL_WEEKDAYS);
      setScheduleStart('18:00');
      setScheduleEnd('23:30');
      setNotes('');
    }
  }, [isOpen, editingRegion, defaultCity]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  function handleAddNeighborhoodsFromInput() {
    const parsed = parseNeighborhoodListInput(neighborhoodInput);
    if (parsed.length === 0) return;
    setNeighborhoods((prev) => deduplicateNeighborhoods([...prev, ...parsed]));
    setNeighborhoodInput('');
    setError(null);
  }

  function handleRemoveNeighborhood(target: string) {
    const norm = normalizeDeliveryGeoText(target);
    setNeighborhoods((prev) =>
      prev.filter((nb) => normalizeDeliveryGeoText(nb) !== norm),
    );
  }

  function handleToggleScheduleDay(day: number) {
    setScheduleDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const pendingNeighborhoods = neighborhoodInput.trim()
      ? parseNeighborhoodListInput(neighborhoodInput)
      : [];
    const combinedNeighborhoods = deduplicateNeighborhoods([
      ...neighborhoods,
      ...pendingNeighborhoods,
    ]);

    const parsedFee = Number(String(deliveryFee).replace(',', '.'));
    const parsedMinOrder = Number(String(minimumOrderAmount || '0').replace(',', '.'));

    const candidate: DeliveryRegionInput = {
      name: name.trim(),
      city: city.trim(),
      neighborhoods: combinedNeighborhoods,
      description: description.trim(),
      deliveryFee: Number.isFinite(parsedFee) ? Math.round(parsedFee * 100) / 100 : -1,
      minimumOrderAmount: Number.isFinite(parsedMinOrder)
        ? Math.round(parsedMinOrder * 100) / 100
        : -1,
      estimatedTime: estimatedTime.trim(),
      status,
      isTemporarilySuspended,
      suspensionReason: isTemporarilySuspended ? suspensionReason.trim() : '',
      scheduleEnabled,
      scheduleDays,
      scheduleStart: scheduleStart.trim(),
      scheduleEnd: scheduleEnd.trim(),
      notes: notes.trim(),
    };

    const validation = validateDeliveryRegionInput(
      candidate,
      existingRegions,
      editingRegion?.id ?? null,
    );

    if (!validation.valid) {
      setError(validation.error ?? 'Verifique os dados informados.');
      return;
    }

    candidate.neighborhoods = validation.normalizedNeighborhoods;
    setNeighborhoods(validation.normalizedNeighborhoods);
    setNeighborhoodInput('');
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(candidate, editingRegion?.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar a região de entrega.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-region-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-[#172033]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.18)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3 bg-white shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="delivery-region-modal-title"
                className="text-base sm:text-lg font-extrabold text-[#172033] tracking-tight"
              >
                {editingRegion ? 'Editar Região de Entrega' : 'Nova Região de Entrega'}
              </h2>
              <p className="text-xs text-[#778094] mt-0.5">
                Configure município, bairros atendidos, taxa, pedido mínimo e janela de atendimento.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Fechar janela de região"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F7F8FC]/60"
        >
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Identificação da Região & Município */}
          <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
              Localização e Identificação
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="region-name-input"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Nome da região ou bairro <span className="text-[#E35D62]">*</span>
                </label>
                <input
                  id="region-name-input"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Zona Central / Centro"
                  className="mgw-input !min-h-[42px]"
                />
              </div>

              <div>
                <label
                  htmlFor="region-city-input"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Município / Cidade <span className="text-[#E35D62]">*</span>
                </label>
                <input
                  id="region-city-input"
                  type="text"
                  required
                  maxLength={100}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex.: Manaus"
                  className="mgw-input !min-h-[42px]"
                />
              </div>
            </div>

            {/* Bairros atendidos */}
            <div className="space-y-2">
              <label
                htmlFor="region-neighborhood-input"
                className="block text-xs font-semibold text-[#172033]"
              >
                Bairros atendidos nesta região <span className="text-[#E35D62]">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="region-neighborhood-input"
                  type="text"
                  value={neighborhoodInput}
                  onChange={(e) => setNeighborhoodInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNeighborhoodsFromInput();
                    }
                  }}
                  placeholder="Digite um bairro ou separe vários por vírgula (ex.: Centro, Praça 14)"
                  className="mgw-input !min-h-[42px] flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddNeighborhoodsFromInput}
                  className="min-h-[42px] px-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] hover:bg-[#FEF3C7] text-xs font-bold text-[#8A6200] inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Adicionar bairro</span>
                </button>
              </div>
              <p className="text-[11px] text-[#778094]">
                Dica: cadastre 1 bairro individual ou agrupe vários bairros que compartilham a mesma taxa de entrega.
              </p>

              {neighborhoods.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {neighborhoods.map((nb) => (
                    <span
                      key={nb}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7F8FC] border border-[#E8EAF0] text-xs font-semibold text-[#172033]"
                    >
                      <span>{nb}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveNeighborhood(nb)}
                        aria-label={`Remover bairro ${nb}`}
                        className="text-[#778094] hover:text-[#DC2626] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="region-description-input"
                className="block text-xs font-semibold text-[#172033] mb-1"
              >
                Descrição curta da cobertura (opcional)
              </label>
              <input
                id="region-description-input"
                type="text"
                maxLength={240}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Entregas até as proximidades da Av. Brasil"
                className="mgw-input !min-h-[40px]"
              />
            </div>
          </div>

          {/* Taxa, Pedido Mínimo e Prazo */}
          <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
              Taxa, Pedido Mínimo e Prazo
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label
                  htmlFor="region-fee-input"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Taxa de entrega (R$) <span className="text-[#E35D62]">*</span>
                </label>
                <input
                  id="region-fee-input"
                  type="number"
                  min="0"
                  step="0.50"
                  inputMode="decimal"
                  required
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  className="mgw-input !min-h-[42px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="region-min-order-input"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Pedido mínimo (R$)
                </label>
                <input
                  id="region-min-order-input"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={minimumOrderAmount}
                  onChange={(e) => setMinimumOrderAmount(e.target.value)}
                  className="mgw-input !min-h-[42px] font-mono tabular-nums"
                />
                <p className="text-[11px] text-[#778094] mt-1">
                  0 = usa o padrão da loja
                </p>
              </div>

              <div>
                <label
                  htmlFor="region-time-input"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Tempo estimado
                </label>
                <input
                  id="region-time-input"
                  type="text"
                  maxLength={60}
                  value={estimatedTime}
                  onChange={(e) => setEstimatedTime(e.target.value)}
                  placeholder="Ex.: 30 - 45 min"
                  className="mgw-input !min-h-[42px]"
                />
              </div>
            </div>
          </div>

          {/* Status, Suspensão & Horários */}
          <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#778094]">
              Disponibilidade e Horário de Atendimento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="region-status-select"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Status da região
                </label>
                <select
                  id="region-status-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DeliveryRegionStatus)}
                  className="mgw-input !min-h-[42px]"
                >
                  <option value="active">Ativa (aceita entregas)</option>
                  <option value="inactive">Inativa (oculta / sem entrega)</option>
                </select>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTemporarilySuspended}
                  onChange={(e) => setIsTemporarilySuspended(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#F5B900] cursor-pointer"
                />
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-[#172033]">
                    Suspender temporariamente
                  </span>
                  <span className="block text-[11px] text-[#778094] mt-0.5">
                    Bloqueia entregas na região (ex.: chuva forte ou falta de motoboy).
                  </span>
                </div>
              </label>
            </div>

            {isTemporarilySuspended && (
              <div>
                <label
                  htmlFor="region-suspension-reason"
                  className="block text-xs font-semibold text-[#172033] mb-1"
                >
                  Motivo da suspensão exibido ao cliente (opcional)
                </label>
                <input
                  id="region-suspension-reason"
                  type="text"
                  maxLength={240}
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  placeholder="Ex.: Chuva intensa na região no momento"
                  className="mgw-input !min-h-[40px]"
                />
              </div>
            )}

            <div className="pt-2 border-t border-[#E8EAF0] space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#F5B900] cursor-pointer"
                />
                <Clock className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
                <span className="text-xs font-bold text-[#172033]">
                  Restringir atendimento desta região por dias e horários específicos
                </span>
              </label>

              {scheduleEnabled && (
                <div className="p-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-3">
                  <div>
                    <span className="block text-[11px] font-semibold text-[#778094] mb-1.5">
                      Dias da semana com entrega
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SCHEDULE_DAY_OPTIONS.map((day) => {
                        const selected = scheduleDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => handleToggleScheduleDay(day.value)}
                            aria-pressed={selected}
                            className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                              selected
                                ? 'bg-[#F5B900] border-[#F5B900] text-[#172033]'
                                : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                            }`}
                          >
                            {day.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="region-schedule-start"
                        className="block text-[11px] font-semibold text-[#778094] mb-1"
                      >
                        Início
                      </label>
                      <input
                        id="region-schedule-start"
                        type="time"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="mgw-input !min-h-[40px] font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="region-schedule-end"
                        className="block text-[11px] font-semibold text-[#778094] mb-1"
                      >
                        Fim
                      </label>
                      <input
                        id="region-schedule-end"
                        type="time"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        className="mgw-input !min-h-[40px] font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#778094]">
                    Horários noturnos que viram a meia-noite (ex.: 18:00 às 02:00) são suportados automaticamente.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="region-notes-input"
                className="block text-xs font-semibold text-[#172033] mb-1"
              >
                Observações internas da operação (opcional)
              </label>
              <textarea
                id="region-notes-input"
                rows={2}
                maxLength={400}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: Priorizar despacho duplo para esta região nos horários de pico."
                className="w-full p-3 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-sm text-[#172033]"
              />
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="mgw-btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="mgw-btn-primary"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Salvando...'
                  : editingRegion
                    ? 'Salvar alterações'
                    : 'Cadastrar região'}
              </span>
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
