import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  Layers,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  DeliveryPricingMode,
  DeliveryPricingSettings,
  DeliveryPricingSettingsInput,
  DeliveryRegionInput,
  DeliveryRegionRecord,
  DeliveryRegionStatus,
  DigitalMenuSettings,
  OnlineOrderRecord,
} from '../types/finance';
import {
  buildCityRegionsHierarchy,
  computeDeliveryRegionsKpis,
  DEFAULT_DELIVERY_PRICING_SETTINGS,
  formatRegionScheduleSummary,
  normalizeDeliveryGeoText,
  validateDeliveryPricingSettingsInput,
} from '../utils/deliveryRegions';
import { formatCurrencyBRL } from '../utils/finance';
import { DeliveryRegionFormModal } from './DeliveryRegionFormModal';

interface DeliveryRegionsViewProps {
  establishmentName: string;
  regions: DeliveryRegionRecord[];
  pricingSettings: DeliveryPricingSettings;
  orders: OnlineOrderRecord[];
  digitalMenuSettings: DigitalMenuSettings;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => Promise<void> | void;
  onCreateRegion: (input: DeliveryRegionInput) => Promise<string>;
  onUpdateRegion: (regionId: string, input: DeliveryRegionInput) => Promise<void>;
  onToggleRegionStatus: (
    region: DeliveryRegionRecord,
    status: DeliveryRegionStatus,
  ) => Promise<void>;
  onToggleRegionSuspension: (
    region: DeliveryRegionRecord,
    suspended: boolean,
    reason?: string,
  ) => Promise<void>;
  onDeleteRegion: (region: DeliveryRegionRecord) => Promise<void>;
  onSavePricingSettings: (input: DeliveryPricingSettingsInput) => Promise<void>;
}

type RegionStatusFilter = 'all' | 'active' | 'suspended' | 'inactive';

function DeliveryRegionsSkeleton() {
  return (
    <div
      className="space-y-5 sm:space-y-6"
      aria-busy="true"
      aria-label="Carregando Regiões e Taxas do MGW Delivery"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-4 w-40 rounded-lg" />
          <div className="mgw-skeleton h-8 w-64 rounded-lg" />
          <div className="mgw-skeleton h-4 w-80 max-w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-28 rounded-xl" />
          <div className="mgw-skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="mgw-skeleton h-[126px] rounded-2xl" />
        ))}
      </div>

      <div className="mgw-skeleton h-[220px] w-full rounded-2xl" />
      <div className="mgw-skeleton h-[260px] w-full rounded-2xl" />
    </div>
  );
}

export function DeliveryRegionsView({
  establishmentName,
  regions,
  pricingSettings,
  orders,
  digitalMenuSettings,
  isLoading = false,
  errorMessage = null,
  onRefresh,
  onCreateRegion,
  onUpdateRegion,
  onToggleRegionStatus,
  onToggleRegionSuspension,
  onDeleteRegion,
  onSavePricingSettings,
}: DeliveryRegionsViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRegionId, setBusyRegionId] = useState<string | null>(null);

  // Filtros da listagem
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RegionStatusFilter>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');

  // Modal de criar/editar região
  const [formOpen, setFormOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<DeliveryRegionRecord | null>(
    null,
  );

  // Modal de suspensão temporária (com motivo)
  const [suspendTarget, setSuspendTarget] = useState<DeliveryRegionRecord | null>(
    null,
  );
  const [suspendReasonInput, setSuspendReasonInput] = useState('');

  // Modal de confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<DeliveryRegionRecord | null>(
    null,
  );

  // Formulário de regras globais de cobrança
  const [pricingMode, setPricingMode] = useState<DeliveryPricingMode>(
    pricingSettings?.pricingMode || DEFAULT_DELIVERY_PRICING_SETTINGS.pricingMode,
  );
  const [defaultFeeEnabled, setDefaultFeeEnabled] = useState<boolean>(
    Boolean(pricingSettings?.defaultFeeEnabled),
  );
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState<string>(
    String(pricingSettings?.defaultDeliveryFee ?? digitalMenuSettings.deliveryFee ?? 5),
  );
  const [defaultMinimumOrderAmount, setDefaultMinimumOrderAmount] = useState<string>(
    String(
      pricingSettings?.defaultMinimumOrderAmount ??
        digitalMenuSettings.minimumOrderAmount ??
        0,
    ),
  );
  const [defaultEstimatedTime, setDefaultEstimatedTime] = useState<string>(
    pricingSettings?.defaultEstimatedTime ??
      DEFAULT_DELIVERY_PRICING_SETTINGS.defaultEstimatedTime,
  );
  const [freeDeliveryEnabled, setFreeDeliveryEnabled] = useState<boolean>(
    Boolean(pricingSettings?.freeDeliveryEnabled),
  );
  const [freeDeliveryMinAmount, setFreeDeliveryMinAmount] = useState<string>(
    String(pricingSettings?.freeDeliveryMinAmount ?? 0),
  );
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSavedFeedback, setPricingSavedFeedback] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  useEffect(() => {
    if (!pricingSettings) return;
    setPricingMode(pricingSettings.pricingMode);
    setDefaultFeeEnabled(pricingSettings.defaultFeeEnabled);
    setDefaultDeliveryFee(String(pricingSettings.defaultDeliveryFee));
    setDefaultMinimumOrderAmount(String(pricingSettings.defaultMinimumOrderAmount));
    setDefaultEstimatedTime(pricingSettings.defaultEstimatedTime || '');
    setFreeDeliveryEnabled(pricingSettings.freeDeliveryEnabled);
    setFreeDeliveryMinAmount(String(pricingSettings.freeDeliveryMinAmount));
  }, [pricingSettings]);

  const kpis = useMemo(
    () => computeDeliveryRegionsKpis(regions, orders),
    [regions, orders],
  );

  const cityHierarchy = useMemo(
    () => buildCityRegionsHierarchy(regions),
    [regions],
  );

  const ordersCountByRegionId = useMemo(() => {
    const map = new Map<string, number>();
    for (const metric of kpis.ordersByRegion) {
      if (metric.regionId) {
        map.set(metric.regionId, metric.ordersCount);
      }
    }
    return map;
  }, [kpis.ordersByRegion]);

  const availableCities = useMemo(
    () => cityHierarchy.map((g) => g.city),
    [cityHierarchy],
  );

  const filteredRegions = useMemo(() => {
    const normQuery = normalizeDeliveryGeoText(searchQuery);
    return regions.filter((region) => {
      if (statusFilter === 'active') {
        if (region.status !== 'active' || region.isTemporarilySuspended) return false;
      } else if (statusFilter === 'suspended') {
        if (!region.isTemporarilySuspended) return false;
      } else if (statusFilter === 'inactive') {
        if (region.status !== 'inactive') return false;
      }

      if (cityFilter !== 'all' && region.city !== cityFilter) {
        return false;
      }

      if (!normQuery) return true;
      const haystack = normalizeDeliveryGeoText(
        `${region.name} ${region.city} ${region.description} ${region.neighborhoods.join(' ')}`,
      );
      return haystack.includes(normQuery);
    });
  }, [regions, statusFilter, cityFilter, searchQuery]);

  if (isLoading) {
    return <DeliveryRegionsSkeleton />;
  }

  const displayEstablishment =
    establishmentName.trim() ||
    digitalMenuSettings.storeName.trim() ||
    'Seu estabelecimento';

  async function handleRefreshClick() {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    setActionError(null);
    try {
      await onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar as regiões e taxas.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmitRegion(
    input: DeliveryRegionInput,
    editingRegionId?: string,
  ) {
    if (editingRegionId) {
      await onUpdateRegion(editingRegionId, input);
    } else {
      await onCreateRegion(input);
    }
  }

  async function handleSavePricingSubmit(e: FormEvent) {
    e.preventDefault();
    if (savingPricing) return;

    const parsedFee = Number(String(defaultDeliveryFee || '0').replace(',', '.'));
    const parsedMinOrder = Number(
      String(defaultMinimumOrderAmount || '0').replace(',', '.'),
    );
    const parsedFreeMin = Number(
      String(freeDeliveryMinAmount || '0').replace(',', '.'),
    );

    const payload: DeliveryPricingSettingsInput = {
      pricingMode,
      defaultFeeEnabled,
      defaultDeliveryFee: Number.isFinite(parsedFee)
        ? Math.round(parsedFee * 100) / 100
        : -1,
      defaultMinimumOrderAmount: Number.isFinite(parsedMinOrder)
        ? Math.round(parsedMinOrder * 100) / 100
        : -1,
      defaultEstimatedTime: defaultEstimatedTime.trim(),
      freeDeliveryEnabled,
      freeDeliveryMinAmount: Number.isFinite(parsedFreeMin)
        ? Math.round(parsedFreeMin * 100) / 100
        : -1,
    };

    const validation = validateDeliveryPricingSettingsInput(payload);
    if (!validation.valid) {
      setPricingError(validation.error ?? 'Verifique as regras de cobrança.');
      return;
    }

    setPricingError(null);
    setSavingPricing(true);
    try {
      await onSavePricingSettings(payload);
      setPricingSavedFeedback(true);
      window.setTimeout(() => setPricingSavedFeedback(false), 3200);
    } catch (err) {
      setPricingError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar as regras gerais de taxa.',
      );
    } finally {
      setSavingPricing(false);
    }
  }

  async function handleConfirmSuspend(e: FormEvent) {
    e.preventDefault();
    if (!suspendTarget || busyRegionId) return;
    setBusyRegionId(suspendTarget.id);
    setActionError(null);
    try {
      await onToggleRegionSuspension(
        suspendTarget,
        true,
        suspendReasonInput.trim(),
      );
      setSuspendTarget(null);
      setSuspendReasonInput('');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível suspender a região.',
      );
    } finally {
      setBusyRegionId(null);
    }
  }

  async function handleReactivateRegion(region: DeliveryRegionRecord) {
    if (busyRegionId) return;
    setBusyRegionId(region.id);
    setActionError(null);
    try {
      await onToggleRegionSuspension(region, false, '');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível reativar a entrega.',
      );
    } finally {
      setBusyRegionId(null);
    }
  }

  async function handleToggleStatus(region: DeliveryRegionRecord) {
    if (busyRegionId) return;
    setBusyRegionId(region.id);
    setActionError(null);
    try {
      const nextStatus: DeliveryRegionStatus =
        region.status === 'active' ? 'inactive' : 'active';
      await onToggleRegionStatus(region, nextStatus);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível alterar o status.',
      );
    } finally {
      setBusyRegionId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || busyRegionId) return;
    setBusyRegionId(deleteTarget.id);
    setActionError(null);
    try {
      await onDeleteRegion(deleteTarget);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Não foi possível excluir a região.',
      );
    } finally {
      setBusyRegionId(null);
    }
  }

  const combinedError = actionError || errorMessage;
  const topOrderRegion =
    kpis.ordersByRegion.find((item) => item.ordersCount > 0) ?? null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {combinedError && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#B91C1C] flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{combinedError}</span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={isRefreshing}
              className="min-h-[34px] px-3 rounded-lg bg-white border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer shrink-0"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Cabeçalho */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(23,32,51,0.04)]">
            <MapPin className="w-6 h-6" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#778094]">
              <span className="font-semibold text-[#8A6200]">MGW Delivery</span>
              <span aria-hidden="true">·</span>
              <span className="truncate font-medium text-[#172033]">
                {displayEstablishment}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight mt-0.5">
              Regiões e Taxas de Entrega
            </h2>
            <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
              Defina municípios, bairros atendidos, taxas, pedido mínimo, entrega grátis e horários aplicados no Cardápio Digital.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {onRefresh && (
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={isRefreshing}
              className="mgw-btn-secondary whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Atualizar</span>
            </button>
          )}

          <button
            type="button"
            data-testid="new-delivery-region-btn"
            onClick={() => {
              setEditingRegion(null);
              setFormOpen(true);
            }}
            className="mgw-btn-primary whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nova Região</span>
          </button>
        </div>
      </section>

      {/* Indicadores Principais */}
      <section
        aria-label="Indicadores de Regiões e Taxas"
        className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5"
      >
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[126px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Cobertura</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">Total de regiões</p>
            <p
              data-testid="regions-kpi-total"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.totalRegionsCount}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              {kpis.totalNeighborhoodsCount} bairro(s) cadastrado(s)
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[126px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Liberadas</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">Regiões ativas</p>
            <p
              data-testid="regions-kpi-active"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.activeRegionsCount}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Em {availableCities.length} município(s)
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[126px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFF7ED] border border-[#FED7AA] text-[#C2410C] flex items-center justify-center shrink-0">
              <PauseCircle className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Bloqueio</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">
              Regiões suspensas / inativas
            </p>
            <p
              data-testid="regions-kpi-suspended"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.suspendedRegionsCount}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              {kpis.temporarilySuspendedCount} suspensa(s) · {kpis.inactiveRegionsCount} inativa(s)
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[126px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Tarifa</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">Taxa média de entrega</p>
            <p
              data-testid="regions-kpi-avg-fee"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {formatCurrencyBRL(kpis.averageDeliveryFee)}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              {freeDeliveryEnabled && Number(freeDeliveryMinAmount) > 0
                ? `Grátis acima de ${formatCurrencyBRL(Number(freeDeliveryMinAmount))}`
                : 'Base nas regiões ativas'}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[126px] min-[480px]:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div className="w-9 h-9 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">Volume</span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-medium text-[#778094]">Pedidos por região</p>
            <p
              data-testid="regions-kpi-orders"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums mt-0.5"
            >
              {kpis.deliveryOrdersWithRegionCount}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              {topOrderRegion
                ? `Líder: ${topOrderRegion.regionName} (${topOrderRegion.ordersCount})`
                : 'Histórico salvo em cada pedido'}
            </p>
          </div>
        </article>
      </section>

      {/* Regras Gerais de Cobrança & Entrega Grátis */}
      <section
        aria-label="Regras gerais de cobrança e entrega grátis"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#172033] tracking-tight flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
              <span>Regras de Cobrança e Entrega Grátis</span>
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Escolha como a taxa é calculada no Cardápio Digital e se haverá taxa padrão fora das áreas mapeadas.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSavePricingSubmit(e)} className="p-4 sm:p-6 space-y-4">
          {pricingError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]"
            >
              {pricingError}
            </div>
          )}

          {pricingSavedFeedback && (
            <div
              role="status"
              className="p-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-semibold text-[#15803D] flex items-center gap-2"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>Regras gerais de taxa de entrega salvas com sucesso.</span>
            </div>
          )}

          <div className="space-y-2">
            <span className="block text-xs font-bold text-[#172033]">
              Modelo de cobrança principal
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {([
                {
                  id: 'by_neighborhood',
                  title: 'Taxa por bairro',
                  desc: 'Cada bairro encontrado aplica a taxa exata da sua região cadastrada.',
                },
                {
                  id: 'by_region',
                  title: 'Taxa por região / zona',
                  desc: 'Agrupa bairros em zonas com a mesma faixa de taxa e pedido mínimo.',
                },
                {
                  id: 'default_only',
                  title: 'Taxa padrão única',
                  desc: 'Cobra a taxa padrão para toda a cidade, ignorando faixas individuais.',
                },
              ] as const).map((opt) => {
                const selected = pricingMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPricingMode(opt.id)}
                    aria-pressed={selected}
                    className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#FFFBEB] border-[#F5B900]'
                        : 'bg-[#F7F8FC] border-[#E8EAF0] hover:border-[#D5D9E4]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#172033]">
                        {opt.title}
                      </span>
                      {selected && (
                        <span className="w-4 h-4 rounded-full bg-[#F5B900] text-[#172033] flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#778094] mt-1 leading-relaxed">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            {/* Taxa padrão / Fallback */}
            <div className="p-4 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC]/70 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultFeeEnabled}
                  onChange={(e) => setDefaultFeeEnabled(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#F5B900] cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-bold text-[#172033]">
                    Aplicar taxa padrão para endereços fora das regiões cadastradas
                  </span>
                  <span className="block text-[11px] text-[#778094] mt-0.5">
                    {defaultFeeEnabled || pricingMode === 'default_only'
                      ? 'Bairros não cadastrados usarão a taxa padrão abaixo.'
                      : 'Quando desativado e houver regiões cadastradas, bairros fora da lista serão bloqueados para entrega.'}
                  </span>
                </div>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor="pricing-default-fee"
                    className="block text-[11px] font-semibold text-[#4B5563] mb-1"
                  >
                    Taxa padrão (R$)
                  </label>
                  <input
                    id="pricing-default-fee"
                    type="number"
                    min="0"
                    step="0.50"
                    inputMode="decimal"
                    value={defaultDeliveryFee}
                    onChange={(e) => setDefaultDeliveryFee(e.target.value)}
                    className="mgw-input !min-h-[38px] font-mono tabular-nums bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pricing-default-min"
                    className="block text-[11px] font-semibold text-[#4B5563] mb-1"
                  >
                    Pedido mínimo (R$)
                  </label>
                  <input
                    id="pricing-default-min"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={defaultMinimumOrderAmount}
                    onChange={(e) => setDefaultMinimumOrderAmount(e.target.value)}
                    className="mgw-input !min-h-[38px] font-mono tabular-nums bg-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pricing-default-time"
                    className="block text-[11px] font-semibold text-[#4B5563] mb-1"
                  >
                    Tempo padrão
                  </label>
                  <input
                    id="pricing-default-time"
                    type="text"
                    maxLength={60}
                    value={defaultEstimatedTime}
                    onChange={(e) => setDefaultEstimatedTime(e.target.value)}
                    placeholder="35 - 50 min"
                    className="mgw-input !min-h-[38px] bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Entrega grátis condicional */}
            <div className="p-4 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC]/70 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={freeDeliveryEnabled}
                    onChange={(e) => setFreeDeliveryEnabled(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#16A36A] cursor-pointer"
                  />
                  <div>
                    <span className="block text-xs font-bold text-[#172033]">
                      Entrega grátis automática a partir de um valor mínimo
                    </span>
                    <span className="block text-[11px] text-[#778094] mt-0.5">
                      Pedidos dentro da área atendida que atingirem o subtotal mínimo recebem frete R$ 0,00.
                    </span>
                  </div>
                </label>

                <div className="max-w-xs">
                  <label
                    htmlFor="pricing-free-min"
                    className="block text-[11px] font-semibold text-[#4B5563] mb-1"
                  >
                    Subtotal mínimo para frete grátis (R$)
                  </label>
                  <input
                    id="pricing-free-min"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    disabled={!freeDeliveryEnabled}
                    value={freeDeliveryMinAmount}
                    onChange={(e) => setFreeDeliveryMinAmount(e.target.value)}
                    className="mgw-input !min-h-[38px] font-mono tabular-nums bg-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  disabled={savingPricing}
                  aria-busy={savingPricing}
                  className="mgw-btn-primary whitespace-nowrap"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  <span>{savingPricing ? 'Salvando...' : 'Salvar regras gerais'}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      {/* Estrutura Geográfica Organizada (Município -> Região -> Bairros) */}
      {cityHierarchy.length > 0 && (
        <section
          aria-label="Organização geográfica por município e região"
          className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
        >
          <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#172033] tracking-tight flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
                <span>Mapa Estruturado de Cobertura</span>
              </h3>
              <p className="text-xs text-[#778094] mt-0.5">
                Hierarquia Município → Região → Bairros preparada para futuras expansões operacionais.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#778094]">
              {cityHierarchy.length} município(s) · {kpis.totalNeighborhoodsCount} bairro(s)
            </span>
          </div>

          <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {cityHierarchy.map((group) => (
              <div
                key={group.city}
                className="rounded-xl border border-[#E8EAF0] bg-[#F7F8FC]/60 p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-[#B38300] shrink-0" />
                    <h4 className="text-sm font-extrabold text-[#172033] truncate">
                      {group.city}
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[#778094]">
                    {formatCurrencyBRL(group.minFee)}
                    {group.maxFee > group.minFee
                      ? ` a ${formatCurrencyBRL(group.maxFee)}`
                      : ''}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#778094]">
                  <span>{group.regions.length} região(ões)</span>
                  <span>·</span>
                  <span className="text-[#15803D] font-semibold">
                    {group.activeCount} ativa(s)
                  </span>
                  {group.suspendedCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-[#B45309] font-semibold">
                        {group.suspendedCount} pausada(s)
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>{group.neighborhoodsCount} bairro(s)</span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {group.regions.map((region) => (
                    <div
                      key={region.id}
                      className="rounded-lg bg-white border border-[#E8EAF0] px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-[#172033]">
                          {region.name}
                        </span>
                        <span className="block text-[11px] text-[#778094] truncate">
                          {region.neighborhoods.join(', ')}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-[#172033] shrink-0">
                        {region.deliveryFee <= 0
                          ? 'Grátis'
                          : formatCurrencyBRL(region.deliveryFee)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Listagem & Gestão das Regiões */}
      <section
        aria-label="Lista de regiões e bairros atendidos"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#172033] tracking-tight">
                Regiões e bairros cadastrados
              </h3>
              <p className="text-xs text-[#778094] mt-0.5">
                Pedidos já realizados preservam a taxa e o bairro do momento da compra mesmo que uma região seja editada ou excluída.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#778094]">
              {filteredRegions.length} exibida(s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="sm:col-span-2 relative">
              <Search
                className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar regiões ou bairros"
                placeholder="Buscar por região, município ou bairro..."
                className="mgw-input !pl-9 !min-h-[38px] !text-xs"
              />
            </div>

            <select
              aria-label="Filtrar por status da região"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RegionStatusFilter)}
              className="mgw-input !min-h-[38px] !text-xs font-semibold"
            >
              <option value="all">Todos os status</option>
              <option value="active">Somente ativas</option>
              <option value="suspended">Suspensas temporariamente</option>
              <option value="inactive">Inativas</option>
            </select>

            <select
              aria-label="Filtrar por município"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="mgw-input !min-h-[38px] !text-xs font-semibold"
            >
              <option value="all">Todos os municípios</option>
              {availableCities.map((cityOption) => (
                <option key={cityOption} value={cityOption}>
                  {cityOption}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredRegions.length === 0 ? (
          <div
            data-testid="delivery-regions-empty"
            className="px-6 py-12 text-center flex flex-col items-center justify-center max-w-md mx-auto"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mb-3">
              <MapPin className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-[#172033]">
              {regions.length === 0
                ? 'Nenhuma região cadastrada ainda'
                : 'Nenhuma região corresponde aos filtros atuais'}
            </p>
            <p className="text-xs text-[#778094] mt-1 leading-relaxed">
              {regions.length === 0
                ? 'Enquanto nenhuma região for cadastrada, o cardápio aplica a taxa padrão da loja. Cadastre seus bairros para cobrar taxas diferenciadas.'
                : 'Ajuste os filtros de busca, status ou município.'}
            </p>
            {regions.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditingRegion(null);
                  setFormOpen(true);
                }}
                className="mt-4 mgw-btn-primary"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Cadastrar primeira região</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#E8EAF0]">
            {filteredRegions.map((region) => {
              const isBusy = busyRegionId === region.id;
              const orderCount = ordersCountByRegionId.get(region.id) ?? 0;

              const statusBadge =
                region.status === 'inactive'
                  ? {
                      label: 'Inativa',
                      className:
                        'bg-[#F1F5F9] border-[#CBD5E1] text-[#475569]',
                    }
                  : region.isTemporarilySuspended
                    ? {
                        label: 'Suspensa temporariamente',
                        className:
                          'bg-[#FFF7ED] border-[#FED7AA] text-[#C2410C]',
                      }
                    : {
                        label: 'Ativa',
                        className:
                          'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]',
                      };

              return (
                <article
                  key={region.id}
                  data-testid={`delivery-region-card-${region.id}`}
                  className="p-4 sm:px-6 hover:bg-[#F7F8FC]/60 transition-colors space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm sm:text-base font-extrabold text-[#172033]">
                          {region.name}
                        </h4>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#F5F6FA] border border-[#E8EAF0] text-[11px] font-semibold text-[#172033]">
                          {region.city}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#778094]">
                          {orderCount} pedido(s)
                        </span>
                      </div>

                      {region.description && (
                        <p className="text-xs text-[#778094]">{region.description}</p>
                      )}

                      {/* Bairros */}
                      <div className="flex flex-wrap gap-1.5">
                        {region.neighborhoods.map((nb) => (
                          <span
                            key={nb}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-[#E8EAF0] text-[11px] font-medium text-[#172033]"
                          >
                            {nb}
                          </span>
                        ))}
                      </div>

                      {/* Parâmetros financeiros e operacionais */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4B5563]">
                        <span>
                          Taxa:{' '}
                          <strong className="font-mono tabular-nums text-[#172033]">
                            {region.deliveryFee <= 0
                              ? 'Grátis'
                              : formatCurrencyBRL(region.deliveryFee)}
                          </strong>
                        </span>
                        <span>
                          Pedido mínimo:{' '}
                          <strong className="font-mono tabular-nums text-[#172033]">
                            {region.minimumOrderAmount > 0
                              ? formatCurrencyBRL(region.minimumOrderAmount)
                              : 'Padrão da loja'}
                          </strong>
                        </span>
                        {region.estimatedTime && (
                          <span>
                            Prazo:{' '}
                            <strong className="text-[#172033]">
                              {region.estimatedTime}
                            </strong>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[#778094]">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{formatRegionScheduleSummary(region)}</span>
                        </span>
                      </div>

                      {region.isTemporarilySuspended && region.suspensionReason && (
                        <p className="text-xs text-[#C2410C] bg-[#FFF7ED] border border-[#FED7AA] rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Motivo da suspensão: {region.suspensionReason}</span>
                        </p>
                      )}

                      {region.notes && (
                        <p className="text-[11px] text-[#778094]">
                          Obs. interna: {region.notes}
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingRegion(region);
                          setFormOpen(true);
                        }}
                        className="min-h-[34px] px-3 rounded-xl border border-[#E8EAF0] bg-white hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Editar</span>
                      </button>

                      {region.isTemporarilySuspended ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleReactivateRegion(region)}
                          className="min-h-[34px] px-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] text-xs font-semibold text-[#15803D] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Retomar entregas</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setSuspendTarget(region);
                            setSuspendReasonInput('');
                          }}
                          className="min-h-[34px] px-3 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] hover:bg-[#FFEDD5] text-xs font-semibold text-[#C2410C] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Suspender</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleStatus(region)}
                        className="min-h-[34px] px-3 rounded-xl border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-xs font-semibold text-[#4B5563] cursor-pointer disabled:opacity-50"
                      >
                        {region.status === 'active' ? 'Desativar' : 'Ativar'}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDeleteTarget(region)}
                        aria-label={`Excluir região ${region.name}`}
                        className="min-h-[34px] px-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Desempenho por Região (Pedidos Históricos) */}
      {kpis.ordersByRegion.some((m) => m.ordersCount > 0) && (
        <section
          aria-label="Volume de pedidos por região"
          className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
        >
          <div className="px-4 sm:px-6 py-4 border-b border-[#E8EAF0]">
            <h3 className="text-base font-bold text-[#172033] tracking-tight">
              Pedidos registrados por região
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Contabilizado a partir do histórico imutável de cada pedido de entrega.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F7F8FC] border-b border-[#E8EAF0] text-[11px] font-semibold text-[#778094]">
                  <th className="py-2.5 px-4 sm:px-6">Região / Bairro</th>
                  <th className="py-2.5 px-4">Município</th>
                  <th className="py-2.5 px-4 text-right">Pedidos</th>
                  <th className="py-2.5 px-4 sm:px-6 text-right">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAF0]">
                {kpis.ordersByRegion
                  .filter((item) => item.ordersCount > 0)
                  .map((item) => (
                    <tr key={item.regionKey} className="hover:bg-[#F7F8FC]/60">
                      <td className="py-3 px-4 sm:px-6 font-semibold text-[#172033]">
                        {item.regionName}
                      </td>
                      <td className="py-3 px-4 text-[#778094]">
                        {item.city || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#172033]">
                        {item.ordersCount}
                      </td>
                      <td className="py-3 px-4 sm:px-6 text-right font-mono tabular-nums font-bold text-[#172033]">
                        {formatCurrencyBRL(item.revenueTotal)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal Criar/Editar Região */}
      <DeliveryRegionFormModal
        isOpen={formOpen}
        editingRegion={editingRegion}
        existingRegions={regions}
        defaultCity={availableCities[0] || ''}
        onClose={() => {
          setFormOpen(false);
          setEditingRegion(null);
        }}
        onSubmit={handleSubmitRegion}
      />

      {/* Modal Suspender Região Temporariamente */}
      {suspendTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-region-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !busyRegionId) {
                setSuspendTarget(null);
              }
            }}
            className="fixed inset-0 z-[60] bg-[#172033]/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <form
              onSubmit={(e) => void handleConfirmSuspend(e)}
              className="w-full max-w-md bg-white border border-[#E8EAF0] rounded-2xl p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3
                    id="suspend-region-title"
                    className="text-base font-extrabold text-[#172033]"
                  >
                    Suspender entregas temporariamente
                  </h3>
                  <p className="text-xs text-[#778094] mt-0.5">
                    {suspendTarget.name} ({suspendTarget.city})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuspendTarget(null)}
                  className="w-8 h-8 rounded-lg border border-[#E8EAF0] flex items-center justify-center text-[#778094] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label
                  htmlFor="suspend-reason-input"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Motivo (opcional, exibido no Cardápio Digital)
                </label>
                <input
                  id="suspend-reason-input"
                  type="text"
                  maxLength={240}
                  value={suspendReasonInput}
                  onChange={(e) => setSuspendReasonInput(e.target.value)}
                  placeholder="Ex.: Chuva forte ou indisponibilidade momentânea"
                  className="mgw-input !min-h-[42px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSuspendTarget(null)}
                  className="mgw-btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(busyRegionId)}
                  className="min-h-[40px] px-4 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyRegionId ? 'Suspendendo...' : 'Confirmar suspensão'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* Modal Confirmar Exclusão */}
      {deleteTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-region-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !busyRegionId) {
                setDeleteTarget(null);
              }
            }}
            className="fixed inset-0 z-[60] bg-[#172033]/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md bg-white border border-[#E8EAF0] rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="space-y-1">
                <h3
                  id="delete-region-title"
                  className="text-base font-extrabold text-[#172033]"
                >
                  Excluir região "{deleteTarget.name}"?
                </h3>
                <p className="text-xs text-[#778094] leading-relaxed">
                  Os bairros {deleteTarget.neighborhoods.join(', ')} ({deleteTarget.city}) deixarão de ter esta regra de taxa. Pedidos antigos já registrados manterão seus valores intactos.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyRegionId)}
                  onClick={() => setDeleteTarget(null)}
                  className="mgw-btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyRegionId)}
                  onClick={() => void handleConfirmDelete()}
                  className="min-h-[40px] px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyRegionId ? 'Excluindo...' : 'Excluir região'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
