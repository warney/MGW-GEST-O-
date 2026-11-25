import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  MessageCircle,
  Phone,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type {
  DeliveryCourierInput,
  DeliveryCourierRecord,
  DeliveryDispatchRecord,
} from '../types/finance';
import {
  buildWhatsappUrlBR,
  computeDeliveryCouriersKpis,
  COURIER_AVAILABILITY_SPEC,
  COURIER_FILTER_OPTIONS,
  COURIER_STATUS_SPEC,
  COURIER_TYPE_SPEC,
  type CourierFilterOption,
  type CourierSortOption,
  filterAndSortDeliveryCouriers,
  formatCourierMotorcycleSummary,
  formatCustomerPhoneBR,
  normalizeCourierType,
} from '../utils/deliveryCouriers';
import { isActiveDispatchStatus } from '../utils/deliveryDispatch';
import { getUserInitials } from '../utils/shellProfile';
import { DeliveryCourierFormModal } from './DeliveryCourierFormModal';
import { DeliveryCourierProfileModal } from './DeliveryCourierProfileModal';

interface DeliveryCouriersViewProps {
  establishmentName: string;
  couriers: DeliveryCourierRecord[];
  dispatches?: DeliveryDispatchRecord[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => Promise<void> | void;
  onCreateCourier: (input: DeliveryCourierInput) => Promise<string>;
  onUpdateCourier: (
    courierId: string,
    input: DeliveryCourierInput,
  ) => Promise<void>;
  onToggleCourierStatus: (courier: DeliveryCourierRecord) => Promise<void>;
  onToggleCourierAvailability: (
    courier: DeliveryCourierRecord,
  ) => Promise<void>;
  onDeleteCourier: (courier: DeliveryCourierRecord) => Promise<void>;
}

function DeliveryCouriersSkeleton() {
  return (
    <div
      className="space-y-5 sm:space-y-6"
      aria-busy="true"
      aria-label="Carregando entregadores do MGW Delivery"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-7 w-44 rounded-lg" />
          <div className="mgw-skeleton h-4 w-80 max-w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-28 rounded-xl" />
          <div className="mgw-skeleton h-10 w-40 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="mgw-skeleton h-[128px] rounded-2xl" />
        ))}
      </div>

      <div className="mgw-skeleton h-24 w-full rounded-2xl" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="mgw-skeleton h-[210px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function DeliveryCouriersView({
  establishmentName,
  couriers,
  dispatches = [],
  isLoading = false,
  errorMessage = null,
  onRefresh,
  onCreateCourier,
  onUpdateCourier,
  onToggleCourierStatus,
  onToggleCourierAvailability,
  onDeleteCourier,
}: DeliveryCouriersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CourierFilterOption>('all');
  const [sortBy, setSortBy] = useState<CourierSortOption>('availability');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCourier, setEditingCourier] =
    useState<DeliveryCourierRecord | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );

  const [busyCourierId, setBusyCourierId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingCourier, setDeletingCourier] =
    useState<DeliveryCourierRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const kpis = useMemo(
    () => computeDeliveryCouriersKpis(couriers),
    [couriers],
  );

  const filteredCouriers = useMemo(
    () =>
      filterAndSortDeliveryCouriers(couriers, {
        searchQuery,
        filter: statusFilter,
        sortBy,
      }),
    [couriers, searchQuery, statusFilter, sortBy],
  );

  const selectedProfile = useMemo(
    () =>
      selectedProfileId
        ? couriers.find((c) => c.id === selectedProfileId) ?? null
        : null,
    [couriers, selectedProfileId],
  );

  const activeDeliveriesByCourier = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dispatches) {
      if (!isActiveDispatchStatus(d.dispatchStatus)) continue;
      map.set(d.courierId, (map.get(d.courierId) ?? 0) + 1);
    }
    return map;
  }, [dispatches]);

  if (isLoading) {
    return <DeliveryCouriersSkeleton />;
  }

  const displayEstablishment = establishmentName.trim() || 'Seu estabelecimento';

  const filterCounts: Record<CourierFilterOption, number> = {
    all: kpis.totalCouriers,
    active: kpis.activeCouriers,
    available: kpis.availableCouriers,
    unavailable: kpis.unavailableActiveCouriers,
    inactive: kpis.inactiveCouriers,
  };

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
          : 'Não foi possível atualizar a lista de entregadores.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleFormSubmit(
    input: DeliveryCourierInput,
    editingId?: string,
  ) {
    if (editingId) {
      await onUpdateCourier(editingId, input);
    } else {
      const createdId = await onCreateCourier(input);
      if (createdId) {
        setSelectedProfileId(createdId);
      }
    }
  }

  async function handleStatusToggle(courier: DeliveryCourierRecord) {
    setBusyCourierId(courier.id);
    setActionError(null);
    try {
      await onToggleCourierStatus(courier);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível alterar a situação do entregador.';
      setActionError(message);
      throw err;
    } finally {
      setBusyCourierId(null);
    }
  }

  async function handleAvailabilityToggle(courier: DeliveryCourierRecord) {
    setBusyCourierId(courier.id);
    setActionError(null);
    try {
      await onToggleCourierAvailability(courier);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível alterar a disponibilidade do entregador.';
      setActionError(message);
      throw err;
    } finally {
      setBusyCourierId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingCourier) return;
    setBusyCourierId(deletingCourier.id);
    setDeleteError(null);
    try {
      await onDeleteCourier(deletingCourier);
      if (selectedProfileId === deletingCourier.id) {
        setSelectedProfileId(null);
      }
      setDeletingCourier(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir o entregador.',
      );
    } finally {
      setBusyCourierId(null);
    }
  }

  async function handleDeactivateInsteadOfDelete() {
    if (!deletingCourier) return;
    setBusyCourierId(deletingCourier.id);
    setDeleteError(null);
    try {
      if (deletingCourier.status !== 'inactive') {
        await onToggleCourierStatus(deletingCourier);
      }
      setDeletingCourier(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Não foi possível desativar o entregador.',
      );
    } finally {
      setBusyCourierId(null);
    }
  }

  const combinedError = actionError || errorMessage;

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
            <Bike className="w-6 h-6" aria-hidden="true" />
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
              Entregadores
            </h2>
            <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
              Gerencie os motoboys do seu estabelecimento.
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
            onClick={() => {
              setEditingCourier(null);
              setFormModalOpen(true);
            }}
            className="mgw-btn-primary whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>+ Novo entregador</span>
          </button>
        </div>
      </section>

      {/* Dashboard de Entregadores — 4 KPIs Reais */}
      <section
        aria-label="Indicadores da equipe de entregadores"
        className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4"
      >
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#B38300] flex items-center justify-center shrink-0">
              <Bike className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Equipe total
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Total de entregadores cadastrados
            </p>
            <p
              data-testid="couriers-kpi-total"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.totalCouriers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Cadastro operacional do estabelecimento
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]/80 text-[#15803D] flex items-center justify-center shrink-0">
              <UserCheck className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Habilitados
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregadores ativos
            </p>
            <p
              data-testid="couriers-kpi-active"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.activeCouriers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              {kpis.unavailableActiveCouriers > 0
                ? `${kpis.unavailableActiveCouriers} ativo(s) indisponível(is) no momento`
                : 'Prontos para atuar nas entregas'}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#B45309] flex items-center justify-center shrink-0">
              <Clock className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Em escala
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregadores disponíveis
            </p>
            <p
              data-testid="couriers-kpi-available"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.availableCouriers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Ativos e disponíveis para despacho
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#F3F4F6] border border-[#E5E7EB] text-[#4B5563] flex items-center justify-center shrink-0">
              <UserX className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Desativados
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Entregadores inativos
            </p>
            <p
              data-testid="couriers-kpi-inactive"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.inactiveCouriers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Cadastros preservados fora de escala
            </p>
          </div>
        </article>
      </section>

      {/* Busca, Filtros e Ordenação */}
      <section
        aria-label="Busca e filtros de entregadores"
        className="bg-white border border-[#E8EAF0] rounded-2xl p-4 shadow-[0_2px_8px_rgba(23,32,51,0.04)] space-y-3"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search
              className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, telefone, WhatsApp ou placa..."
              aria-label="Buscar entregadores por nome, telefone ou placa"
              className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] focus:bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor="couriers-sort"
              className="text-xs font-semibold text-[#778094] whitespace-nowrap"
            >
              Ordenar por:
            </label>
            <select
              id="couriers-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CourierSortOption)}
              className="min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] focus:border-[#F5B900] focus:outline-none"
            >
              <option value="availability">Disponibilidade</option>
              <option value="name">Nome (A-Z)</option>
              <option value="recent">Mais recentes</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {COURIER_FILTER_OPTIONS.map((opt) => {
            const active = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`min-h-[34px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#FFFBEB] border-[#F5B900] text-[#172033]'
                    : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033] hover:bg-[#F7F8FC]'
                }`}
              >
                <span>{opt.label}</span>
                <span className="font-mono tabular-nums text-[11px] opacity-80">
                  ({filterCounts[opt.id]})
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Listagem em Cards */}
      <section aria-label="Lista de entregadores">
        {filteredCouriers.length === 0 ? (
          <div
            data-testid="couriers-empty-state"
            className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] px-6 py-12 text-center flex flex-col items-center justify-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mb-3">
              <Bike className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-[#172033]">
              {couriers.length === 0
                ? 'Nenhum entregador cadastrado ainda'
                : 'Nenhum entregador encontrado com os filtros atuais'}
            </p>
            <p className="text-xs text-[#778094] mt-1 max-w-md leading-relaxed">
              {couriers.length === 0
                ? 'Cadastre os motoboys do seu estabelecimento para organizar a equipe e preparar a operação de despacho.'
                : 'Tente buscar por outro nome, telefone ou placa, ou limpe os filtros selecionados.'}
            </p>
            {couriers.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setEditingCourier(null);
                  setFormModalOpen(true);
                }}
                className="mt-4 mgw-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo entregador</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="mt-4 mgw-btn-secondary"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCouriers.map((courier) => {
              const statusSpec = COURIER_STATUS_SPEC[courier.status];
              const availabilitySpec =
                COURIER_AVAILABILITY_SPEC[courier.availabilityStatus];
              const typeSpec =
                COURIER_TYPE_SPEC[normalizeCourierType(courier.courierType)];
              const activeCount = activeDeliveriesByCourier.get(courier.id) ?? 0;
              const isBusy = busyCourierId === courier.id;
              const formattedPhone = formatCustomerPhoneBR(courier.phone);
              const whatsappUrl = buildWhatsappUrlBR(
                courier.whatsapp || courier.phone,
              );
              const initials = getUserInitials(courier.name, courier.email);

              return (
                <article
                  key={courier.id}
                  data-testid={`courier-card-${courier.id}`}
                  className="bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="space-y-3">
                    {/* Cabeçalho do Card */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#172033] text-xs font-extrabold flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedProfileId(courier.id)}
                            className="text-left text-sm font-bold text-[#172033] hover:text-[#B38300] truncate block max-w-full cursor-pointer"
                          >
                            {courier.name}
                          </button>
                          <p className="text-xs font-mono tabular-nums text-[#778094] flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{formattedPhone}</span>
                          </p>
                        </div>
                      </div>

                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Conversar com ${courier.name} no WhatsApp`}
                          title="Abrir WhatsApp"
                          className="w-8 h-8 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] hover:bg-[#D1FAE5] flex items-center justify-center shrink-0"
                        >
                          <MessageCircle className="w-4 h-4" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    {/* Indicadores de Situação e Disponibilidade */}
                    <div className="flex flex-wrap items-center gap-1.5">
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

                      {activeCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border bg-[#FFFBEB] border-[#FDE68A] text-[#92400E] text-[11px] font-semibold">
                          <span>
                            Ocupado · {activeCount} entrega{activeCount > 1 ? 's' : ''}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Motocicleta e Observações */}
                    <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] px-3 py-2.5 space-y-1">
                      <p className="text-xs font-medium text-[#172033] flex items-center gap-1.5">
                        <Bike
                          className="w-3.5 h-3.5 text-[#B38300] shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {formatCourierMotorcycleSummary(courier)}
                        </span>
                      </p>
                      {courier.notes && (
                        <p className="text-[11px] text-[#778094] line-clamp-2">
                          {courier.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ações do Card */}
                  <div className="pt-3 border-t border-[#E8EAF0] flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setSelectedProfileId(courier.id)}
                        className="min-h-[34px] px-2.5 rounded-lg border border-[#E8EAF0] bg-white hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Detalhes</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingCourier(courier);
                          setFormModalOpen(true);
                        }}
                        aria-label={`Editar ${courier.name}`}
                        className="min-h-[34px] px-2.5 rounded-lg border border-[#E8EAF0] bg-white hover:border-[#D5D9E4] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Editar</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {courier.status === 'active' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAvailabilityToggle(courier)}
                          title={
                            courier.availabilityStatus === 'available'
                              ? 'Marcar como indisponível'
                              : 'Marcar como disponível'
                          }
                          className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                            courier.availabilityStatus === 'available'
                              ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E] hover:bg-[#FEF3C7]'
                              : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                          }`}
                        >
                          {courier.availabilityStatus === 'available'
                            ? 'Pausar'
                            : 'Disponibilizar'}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusToggle(courier)}
                        aria-label={
                          courier.status === 'active'
                            ? `Desativar ${courier.name}`
                            : `Ativar ${courier.name}`
                        }
                        title={
                          courier.status === 'active'
                            ? 'Desativar entregador'
                            : 'Ativar entregador'
                        }
                        className="w-[34px] h-[34px] rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-[#778094] hover:text-[#172033] inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingCourier(courier);
                        }}
                        aria-label={`Excluir ${courier.name}`}
                        title="Excluir cadastro"
                        className="w-[34px] h-[34px] rounded-lg border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de Cadastro / Edição */}
      <DeliveryCourierFormModal
        isOpen={formModalOpen}
        editingCourier={editingCourier}
        existingCouriers={couriers}
        onClose={() => {
          setFormModalOpen(false);
          setEditingCourier(null);
        }}
        onSubmit={handleFormSubmit}
        onOpenExistingCourier={(courierId) => setSelectedProfileId(courierId)}
      />

      {/* Modal de Detalhes do Entregador */}
      <DeliveryCourierProfileModal
        courier={selectedProfile}
        busyCourierId={busyCourierId}
        activeDeliveriesCount={
          selectedProfile
            ? activeDeliveriesByCourier.get(selectedProfile.id) ?? 0
            : 0
        }
        onClose={() => setSelectedProfileId(null)}
        onEdit={(courier) => {
          setEditingCourier(courier);
          setFormModalOpen(true);
        }}
        onToggleStatus={handleStatusToggle}
        onToggleAvailability={handleAvailabilityToggle}
        onRequestDelete={(courier) => {
          setDeleteError(null);
          setDeletingCourier(courier);
        }}
      />

      {/* Confirmação Segura de Exclusão */}
      {deletingCourier &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="courier-delete-confirm-title"
            onClick={(e) => {
              if (
                e.target === e.currentTarget &&
                busyCourierId !== deletingCourier.id
              ) {
                setDeletingCourier(null);
              }
            }}
            className="fixed inset-0 z-[60] bg-[#172033]/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md bg-white border border-[#E8EAF0] rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <h3
                    id="courier-delete-confirm-title"
                    className="text-base font-extrabold text-[#172033]"
                  >
                    Excluir entregador?
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={busyCourierId === deletingCourier.id}
                  onClick={() => setDeletingCourier(null)}
                  aria-label="Fechar confirmação"
                  className="w-8 h-8 rounded-lg border border-[#E8EAF0] flex items-center justify-center text-[#778094] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {deleteError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]"
                >
                  {deleteError}
                </div>
              )}

              <p className="text-xs sm:text-sm text-[#778094] leading-relaxed">
                O cadastro de{' '}
                <strong className="font-semibold text-[#172033]">
                  {deletingCourier.name}
                </strong>{' '}
                será removido permanentemente deste estabelecimento. Se preferir
                manter o registro para referência futura, recomendamos apenas
                desativar o entregador.
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyCourierId === deletingCourier.id}
                  onClick={() => setDeletingCourier(null)}
                  className="mgw-btn-secondary"
                >
                  Cancelar
                </button>

                {deletingCourier.status === 'active' && (
                  <button
                    type="button"
                    disabled={busyCourierId === deletingCourier.id}
                    onClick={() => void handleDeactivateInsteadOfDelete()}
                    className="min-h-[40px] px-3.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] hover:bg-[#FEF3C7] text-xs font-bold text-[#92400E] cursor-pointer disabled:opacity-50"
                  >
                    Desativar em vez de excluir
                  </button>
                )}

                <button
                  type="button"
                  disabled={busyCourierId === deletingCourier.id}
                  onClick={() => void handleConfirmDelete()}
                  className="min-h-[40px] px-4 rounded-xl bg-[#E35D62] hover:bg-[#DC2626] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {busyCourierId === deletingCourier.id
                    ? 'Excluindo...'
                    : 'Confirmar exclusão'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
