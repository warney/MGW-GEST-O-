import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Award,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Info,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import type {
  DeliveryCustomerAddressInput,
  DeliveryCustomerAddressRecord,
  DeliveryCustomerClassificationConfig,
  DeliveryCustomerInput,
  DeliveryCustomerRecord,
  DigitalMenuSettings,
  OnlineOrderRecord,
  OnlineOrderStatus,
} from '../types/finance';
import {
  CLASSIFICATION_BADGE_SPEC,
  computeDeliveryCustomersKpis,
  CUSTOMER_FILTER_OPTIONS,
  type CustomerFilterOption,
  type CustomerSortOption,
  describeClassificationRules,
  enrichDeliveryCustomersWithMetrics,
  filterAndSortDeliveryCustomers,
  formatCustomerPhoneBR,
  normalizeClassificationConfig,
  paginateDeliveryCustomers,
} from '../utils/deliveryCustomers';
import { formatCurrencyBRL } from '../utils/finance';
import { type OrderProgressionAction } from '../utils/onlineOrders';
import {
  fromOnlineOrderRecord,
  type PrintableOrderSource,
} from '../utils/orderPrint';
import { DeliveryCustomerFormModal } from './DeliveryCustomerFormModal';
import { DeliveryCustomerProfileModal } from './DeliveryCustomerProfileModal';
import { OrderDetailsModal } from './OrderDetailsModal';
import { OrderPrintModal } from './OrderPrintModal';

interface DeliveryCustomersViewProps {
  establishmentName: string;
  customers: DeliveryCustomerRecord[];
  addresses: DeliveryCustomerAddressRecord[];
  orders: OnlineOrderRecord[];
  classificationConfig: DeliveryCustomerClassificationConfig;
  digitalMenuSettings: DigitalMenuSettings;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => Promise<void> | void;
  onCreateCustomer: (
    input: DeliveryCustomerInput,
    initialAddress?: DeliveryCustomerAddressInput | null,
  ) => Promise<string>;
  onUpdateCustomer: (
    customerId: string,
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
  onSaveClassificationConfig: (
    config: DeliveryCustomerClassificationConfig,
  ) => Promise<void>;
  onMarkOrderViewed: (order: OnlineOrderRecord) => Promise<void>;
  onTransitionOrderStatus: (
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
    reason?: string,
  ) => Promise<void>;
}

const CUSTOMERS_PAGE_SIZE = 12;

function formatShortDateBR(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return 'Sem compras';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ms));
}

function DeliveryCustomersSkeleton() {
  return (
    <div
      className="space-y-5 sm:space-y-6"
      aria-busy="true"
      aria-label="Carregando clientes do MGW Delivery"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-7 w-40 rounded-lg" />
          <div className="mgw-skeleton h-4 w-80 max-w-full rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-28 rounded-xl" />
          <div className="mgw-skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="mgw-skeleton h-[128px] rounded-2xl" />
        ))}
      </div>

      <div className="mgw-skeleton h-14 w-full rounded-2xl" />
      <div className="mgw-skeleton h-[340px] w-full rounded-2xl" />
    </div>
  );
}

export function DeliveryCustomersView({
  establishmentName,
  customers,
  addresses,
  orders,
  classificationConfig,
  digitalMenuSettings,
  isLoading = false,
  errorMessage = null,
  onRefresh,
  onCreateCustomer,
  onUpdateCustomer,
  onSaveAddress,
  onDeleteAddress,
  onSetPrimaryAddress,
  onSaveClassificationConfig,
  onMarkOrderViewed,
  onTransitionOrderStatus,
}: DeliveryCustomersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [classificationFilter, setClassificationFilter] =
    useState<CustomerFilterOption>('all');
  const [sortBy, setSortBy] = useState<CustomerSortOption>('lastPurchase');
  const [page, setPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<DeliveryCustomerRecord | null>(null);
  const [selectedProfileCustomerId, setSelectedProfileCustomerId] = useState<
    string | null
  >(null);

  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [showRulesLegend, setShowRulesLegend] = useState(false);
  const [configDraft, setConfigDraft] =
    useState<DeliveryCustomerClassificationConfig>(classificationConfig);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
  const [reasonPrompt, setReasonPrompt] = useState<{
    order: OnlineOrderRecord;
    action: OrderProgressionAction;
  } | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [printingOrder, setPrintingOrder] =
    useState<PrintableOrderSource | null>(null);

  useEffect(() => {
    setConfigDraft(classificationConfig);
  }, [classificationConfig]);

  const enrichedCustomers = useMemo(
    () =>
      enrichDeliveryCustomersWithMetrics(
        customers,
        addresses,
        orders,
        classificationConfig,
      ),
    [customers, addresses, orders, classificationConfig],
  );

  const kpis = useMemo(
    () => computeDeliveryCustomersKpis(enrichedCustomers),
    [enrichedCustomers],
  );

  const filteredCustomers = useMemo(
    () =>
      filterAndSortDeliveryCustomers(enrichedCustomers, {
        searchQuery,
        classificationFilter,
        sortBy,
      }),
    [enrichedCustomers, searchQuery, classificationFilter, sortBy],
  );

  const paginated = useMemo(
    () => paginateDeliveryCustomers(filteredCustomers, page, CUSTOMERS_PAGE_SIZE),
    [filteredCustomers, page],
  );

  const selectedProfile = useMemo(
    () =>
      selectedProfileCustomerId
        ? enrichedCustomers.find(
            (item) => item.customer.id === selectedProfileCustomerId,
          ) ?? null
        : null,
    [enrichedCustomers, selectedProfileCustomerId],
  );

  const selectedOrder = useMemo(
    () =>
      selectedOrderId
        ? orders.find((o) => o.id === selectedOrderId) ?? null
        : null,
    [orders, selectedOrderId],
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, classificationFilter, sortBy]);

  if (isLoading) {
    return <DeliveryCustomersSkeleton />;
  }

  const displayEstablishment =
    establishmentName.trim() ||
    digitalMenuSettings.storeName.trim() ||
    'Seu estabelecimento';

  const ruleDescriptions = describeClassificationRules(classificationConfig);

  async function handleRefreshClick() {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleFormSubmit(
    input: DeliveryCustomerInput,
    initialAddress?: DeliveryCustomerAddressInput | null,
    editingId?: string,
  ) {
    if (editingId) {
      await onUpdateCustomer(editingId, input);
    } else {
      const createdId = await onCreateCustomer(input, initialAddress);
      if (createdId) {
        setSelectedProfileCustomerId(createdId);
      }
    }
  }

  async function handleSaveRules(e: FormEvent) {
    e.preventDefault();
    setConfigError(null);
    const normalized = normalizeClassificationConfig(configDraft);
    if (normalized.vipMinOrders < normalized.recurringMinOrders) {
      setConfigError(
        'O mínimo de pedidos para VIP deve ser maior ou igual ao mínimo de Recorrente.',
      );
      return;
    }
    setSavingConfig(true);
    try {
      await onSaveClassificationConfig(normalized);
      setRulesModalOpen(false);
    } catch (err) {
      setConfigError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar os critérios.',
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleOrderDirectTransition(
    order: OnlineOrderRecord,
    nextStatus: OnlineOrderStatus,
  ) {
    setBusyOrderId(order.id);
    setOrderActionError(null);
    try {
      await onTransitionOrderStatus(order, nextStatus, '');
    } catch (err) {
      setOrderActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar pedido.',
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleConfirmReasonTransition(e: FormEvent) {
    e.preventDefault();
    if (!reasonPrompt) return;
    const cleanReason = reasonDraft.trim();
    if (cleanReason.length < 3) {
      setOrderActionError('Informe o motivo (mínimo 3 caracteres).');
      return;
    }
    setBusyOrderId(reasonPrompt.order.id);
    setOrderActionError(null);
    try {
      await onTransitionOrderStatus(
        reasonPrompt.order,
        reasonPrompt.action.nextStatus,
        cleanReason,
      );
      setReasonPrompt(null);
      setReasonDraft('');
    } catch (err) {
      setOrderActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar pedido.',
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  const filterCounts: Record<CustomerFilterOption, number> = {
    all: kpis.totalCustomers,
    new: kpis.newCustomers,
    recurring: kpis.recurringOnlyCustomers,
    vip: kpis.vipCustomers,
    inactive: kpis.inactiveCustomers,
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#B91C1C] flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Cabeçalho */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(23,32,51,0.04)]">
            <Users className="w-6 h-6" aria-hidden="true" />
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
              Clientes
            </h2>
            <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
              Gerencie sua carteira de clientes e acompanhe o histórico de compras.
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
              setConfigDraft(classificationConfig);
              setConfigError(null);
              setRulesModalOpen(true);
            }}
            className="mgw-btn-secondary whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Critérios</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCustomer(null);
              setFormModalOpen(true);
            }}
            className="mgw-btn-primary whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>+ Novo cliente</span>
          </button>
        </div>
      </section>

      {/* Dashboard de Clientes — 4 Cards Reais */}
      <section
        aria-label="Indicadores da carteira de clientes"
        className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4"
      >
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A]/80 text-[#B38300] flex items-center justify-center shrink-0">
              <UserCheck className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Carteira ativa
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Total de clientes cadastrados
            </p>
            <p
              data-testid="customers-kpi-total"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.totalCustomers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Cadastro manual + Cardápio Digital
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/80 text-[#1D4ED8] flex items-center justify-center shrink-0">
              <UserPlus className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              Primeiros pedidos
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Clientes novos
            </p>
            <p
              data-testid="customers-kpi-new"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.newCustomers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Até {Math.max(1, classificationConfig.recurringMinOrders - 1)} pedido(s) válido(s)
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]/80 text-[#15803D] flex items-center justify-center shrink-0">
              <Repeat className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            {kpis.vipCustomers > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[10px] font-bold text-[#92400E]">
                <Award className="w-3 h-3" aria-hidden="true" />
                {kpis.vipCustomers} VIP
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Clientes recorrentes
            </p>
            <p
              data-testid="customers-kpi-recurring"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.recurringCustomers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              {kpis.vipCustomers > 0
                ? `${kpis.recurringOnlyCustomers} recorrente(s) + ${kpis.vipCustomers} VIP`
                : `A partir de ${classificationConfig.recurringMinOrders} pedidos ativos`}
            </p>
          </div>
        </article>

        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[128px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#F3F4F6] border border-[#E5E7EB] text-[#4B5563] flex items-center justify-center shrink-0">
              <UserX className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094]">
              {classificationConfig.inactiveDays}+ dias
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Clientes inativos
            </p>
            <p
              data-testid="customers-kpi-inactive"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5"
            >
              {kpis.inactiveCustomers}
            </p>
            <p className="text-[11px] text-[#778094] mt-1 truncate">
              Sem novos pedidos há {classificationConfig.inactiveDays} dias ou mais
            </p>
          </div>
        </article>
      </section>

      {/* Regras Transparentes de Classificação */}
      <div className="bg-white border border-[#E8EAF0] rounded-2xl px-4 py-3 shadow-[0_1px_4px_rgba(23,32,51,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowRulesLegend((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#172033] cursor-pointer"
          >
            <Info className="w-4 h-4 text-[#B38300]" aria-hidden="true" />
            <span>
              Regras automáticas de classificação ({classificationConfig.inactiveDays} dias inatividade · {classificationConfig.recurringMinOrders}+ recorrente · {classificationConfig.vipMinOrders}+ pedidos ou {formatCurrencyBRL(classificationConfig.vipMinSpent)} VIP)
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setConfigDraft(classificationConfig);
              setConfigError(null);
              setRulesModalOpen(true);
            }}
            className="text-xs font-semibold text-[#8A6200] hover:underline cursor-pointer"
          >
            Configurar critérios
          </button>
        </div>

        {showRulesLegend && (
          <ul className="mt-2.5 pt-2.5 border-t border-[#E8EAF0] grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-[#778094]">
            {ruleDescriptions.map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <span className="text-[#B38300] font-bold">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Barra de Busca, Filtros e Ordenação */}
      <section
        aria-label="Busca e filtros de clientes"
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
              placeholder="Buscar por nome ou telefone..."
              aria-label="Buscar clientes por nome ou telefone"
              className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] focus:bg-white text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor="customers-sort"
              className="text-xs font-semibold text-[#778094] whitespace-nowrap"
            >
              Ordenar por:
            </label>
            <select
              id="customers-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CustomerSortOption)}
              className="min-h-[42px] px-3 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] focus:border-[#F5B900] focus:outline-none"
            >
              <option value="lastPurchase">Última compra</option>
              <option value="name">Nome (A-Z)</option>
              <option value="ordersCount">Quantidade de pedidos</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CUSTOMER_FILTER_OPTIONS.map((opt) => {
            const active = classificationFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setClassificationFilter(opt.id)}
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

      {/* Lista de Clientes */}
      <section
        aria-label="Carteira de clientes"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        {paginated.totalItems === 0 ? (
          <div
            data-testid="customers-empty-state"
            className="px-6 py-12 text-center flex flex-col items-center justify-center max-w-md mx-auto"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mb-3">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-[#172033]">
              {customers.length === 0
                ? 'Nenhum cliente cadastrado ainda'
                : 'Nenhum cliente encontrado com os filtros atuais'}
            </p>
            <p className="text-xs text-[#778094] mt-1 leading-relaxed">
              {customers.length === 0
                ? 'Cadastre um cliente manualmente ou aguarde pedidos realizados pelo Cardápio Digital para identificação automática.'
                : 'Tente buscar por outro nome ou telefone, ou limpe o filtro de classificação.'}
            </p>
            {customers.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditingCustomer(null);
                  setFormModalOpen(true);
                }}
                className="mt-4 mgw-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo cliente</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E8EAF0] bg-[#F7F8FC] text-[11px] font-semibold text-[#778094]">
                    <th className="py-3 px-5">Nome</th>
                    <th className="py-3 px-4 whitespace-nowrap">Telefone</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">
                      Qtd. pedidos
                    </th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">
                      Total comprado
                    </th>
                    <th className="py-3 px-4 whitespace-nowrap">Última compra</th>
                    <th className="py-3 px-4 whitespace-nowrap">Classificação</th>
                    <th className="py-3 px-5 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EAF0] text-[13px]">
                  {paginated.items.map((item) => {
                    const badge = CLASSIFICATION_BADGE_SPEC[item.classification];
                    return (
                      <tr
                        key={item.customer.id}
                        className="hover:bg-[#F7F8FC]/80 transition-colors"
                      >
                        <td className="py-3.5 px-5 max-w-[240px]">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedProfileCustomerId(item.customer.id)
                            }
                            className="text-left font-bold text-[#172033] hover:text-[#B38300] truncate block max-w-full cursor-pointer"
                          >
                            {item.customer.name}
                          </button>
                          {item.primaryAddress && (
                            <span className="block text-[11px] text-[#778094] truncate mt-0.5">
                              {item.primaryAddress.street}
                              {item.primaryAddress.number
                                ? `, ${item.primaryAddress.number}`
                                : ''}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-xs text-[#172033]">
                          {formatCustomerPhoneBR(item.customer.phone)}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap font-bold font-mono tabular-nums text-[#172033]">
                          {item.validOrdersCount}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap font-bold font-mono tabular-nums text-[#172033]">
                          {formatCurrencyBRL(item.totalSpent)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-xs text-[#778094]">
                          {formatShortDateBR(item.lastOrderAtMs)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${badge.containerClass}`}
                          >
                            {badge.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProfileCustomerId(item.customer.id)
                              }
                              className="min-h-[32px] px-2.5 rounded-lg border border-[#E8EAF0] bg-white hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Perfil</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCustomer(item.customer);
                                setFormModalOpen(true);
                              }}
                              aria-label={`Editar ${item.customer.name}`}
                              className="w-8 h-8 rounded-lg border border-[#E8EAF0] bg-white hover:border-[#D5D9E4] text-[#778094] hover:text-[#172033] inline-flex items-center justify-center cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#E8EAF0]">
              {paginated.items.map((item) => {
                const badge = CLASSIFICATION_BADGE_SPEC[item.classification];
                return (
                  <article
                    key={item.customer.id}
                    className="p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#172033] truncate">
                          {item.customer.name}
                        </h3>
                        <p className="text-xs font-mono tabular-nums text-[#778094] mt-0.5">
                          {formatCustomerPhoneBR(item.customer.phone)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${badge.containerClass}`}
                      >
                        {badge.shortLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] p-2.5 text-xs">
                      <div>
                        <span className="block text-[10px] text-[#778094]">
                          Pedidos
                        </span>
                        <span className="font-bold font-mono tabular-nums text-[#172033]">
                          {item.validOrdersCount}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#778094]">
                          Total gasto
                        </span>
                        <span className="font-bold font-mono tabular-nums text-[#172033]">
                          {formatCurrencyBRL(item.totalSpent)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#778094]">
                          Última compra
                        </span>
                        <span className="font-mono tabular-nums text-[#172033]">
                          {formatShortDateBR(item.lastOrderAtMs)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedProfileCustomerId(item.customer.id)
                        }
                        className="flex-1 min-h-[38px] rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs font-bold text-[#172033] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Ver perfil</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer(item.customer);
                          setFormModalOpen(true);
                        }}
                        className="min-h-[38px] px-3.5 rounded-xl border border-[#E8EAF0] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Paginação */}
            {paginated.totalPages > 1 && (
              <div className="px-4 sm:px-6 py-3.5 border-t border-[#E8EAF0] bg-[#F7F8FC]/60 flex items-center justify-between gap-2 text-xs">
                <span className="text-[#778094]">
                  Página{' '}
                  <strong className="font-mono tabular-nums text-[#172033]">
                    {paginated.currentPage}
                  </strong>{' '}
                  de{' '}
                  <strong className="font-mono tabular-nums text-[#172033]">
                    {paginated.totalPages}
                  </strong>{' '}
                  ({paginated.totalItems} cliente(s))
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={paginated.currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                    className="w-9 h-9 rounded-xl border border-[#E8EAF0] bg-white disabled:opacity-40 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={paginated.currentPage >= paginated.totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(paginated.totalPages, p + 1))
                    }
                    aria-label="Próxima página"
                    className="w-9 h-9 rounded-xl border border-[#E8EAF0] bg-white disabled:opacity-40 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Modal de Cadastro / Edição */}
      <DeliveryCustomerFormModal
        isOpen={formModalOpen}
        editingCustomer={editingCustomer}
        existingCustomers={customers}
        onClose={() => {
          setFormModalOpen(false);
          setEditingCustomer(null);
        }}
        onSubmit={handleFormSubmit}
        onOpenExistingCustomer={(customerId) => {
          setSelectedProfileCustomerId(customerId);
        }}
      />

      {/* Modal / Perfil Individual do Cliente */}
      <DeliveryCustomerProfileModal
        customerProfile={selectedProfile}
        digitalMenuSettings={digitalMenuSettings}
        onClose={() => setSelectedProfileCustomerId(null)}
        onEditCustomer={(cust) => {
          setEditingCustomer(cust);
          setFormModalOpen(true);
        }}
        onUpdateCustomerNotes={async (cust, input) => {
          await onUpdateCustomer(cust.id, input);
        }}
        onSaveAddress={onSaveAddress}
        onDeleteAddress={onDeleteAddress}
        onSetPrimaryAddress={onSetPrimaryAddress}
        onOpenOrderDetails={(ord) => {
          setOrderActionError(null);
          setSelectedOrderId(ord.id);
        }}
      />

      {/* Reutilização direta do OrderDetailsModal para histórico de pedidos do cliente */}
      <OrderDetailsModal
        order={selectedOrder}
        busyOrderId={busyOrderId}
        actionError={orderActionError}
        onClose={() => setSelectedOrderId(null)}
        onMarkViewed={onMarkOrderViewed}
        onDirectTransition={handleOrderDirectTransition}
        onRequestReasonTransition={(order, action) => {
          setReasonDraft('');
          setOrderActionError(null);
          setReasonPrompt({ order, action });
        }}
        onPrint={(ord) =>
          setPrintingOrder(
            fromOnlineOrderRecord(ord, {
              storeName:
                digitalMenuSettings.storeName || displayEstablishment,
              storePhone: digitalMenuSettings.phoneWhatsapp,
              storeAddress: digitalMenuSettings.address,
            }),
          )
        }
      />

      <OrderPrintModal
        order={printingOrder}
        onClose={() => setPrintingOrder(null)}
      />

      {/* Modal de motivo para cancelamento/recusa a partir do histórico */}
      {reasonPrompt &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[60] bg-[#172033]/55 flex items-center justify-center p-4"
          >
            <form
              onSubmit={(e) => void handleConfirmReasonTransition(e)}
              className="w-full max-w-md bg-white border border-[#E8EAF0] rounded-2xl p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[#172033]">
                  {reasonPrompt.action.label}
                </h3>
                <button
                  type="button"
                  onClick={() => setReasonPrompt(null)}
                  className="w-8 h-8 rounded-lg border border-[#E8EAF0] flex items-center justify-center text-[#778094]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                rows={3}
                required
                minLength={3}
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                placeholder="Informe o motivo..."
                className="w-full p-3 rounded-xl border border-[#E8EAF0] text-sm text-[#172033] focus:border-[#F5B900] focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReasonPrompt(null)}
                  className="mgw-btn-secondary"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={busyOrderId === reasonPrompt.order.id}
                  className="min-h-[40px] px-4 rounded-xl bg-[#E35D62] text-white text-xs font-bold cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* Modal de Critérios Configuráveis de Classificação */}
      {rulesModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="classification-config-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !savingConfig) {
                setRulesModalOpen(false);
              }
            }}
            className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <form
              onSubmit={(e) => void handleSaveRules(e)}
              className="w-full max-w-md bg-white border border-[#E8EAF0] rounded-2xl shadow-xl overflow-hidden"
            >
              <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between gap-2">
                <div>
                  <h3
                    id="classification-config-title"
                    className="text-base font-extrabold text-[#172033]"
                  >
                    Critérios de classificação
                  </h3>
                  <p className="text-xs text-[#778094] mt-0.5">
                    Ajuste as regras automáticas para o seu estabelecimento.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRulesModalOpen(false)}
                  className="w-8 h-8 rounded-lg border border-[#E8EAF0] text-[#778094] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              <div className="p-5 space-y-3.5">
                {configError && (
                  <div className="p-2.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
                    {configError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    Pedidos mínimos para Cliente Recorrente
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={100}
                    value={configDraft.recurringMinOrders}
                    onChange={(e) =>
                      setConfigDraft((p) => ({
                        ...p,
                        recurringMinOrders: Number(e.target.value) || 2,
                      }))
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] text-sm font-mono tabular-nums text-[#172033]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#172033] mb-1">
                      Pedidos para Cliente VIP
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={500}
                      value={configDraft.vipMinOrders}
                      onChange={(e) =>
                        setConfigDraft((p) => ({
                          ...p,
                          vipMinOrders: Number(e.target.value) || 2,
                        }))
                      }
                      className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] text-sm font-mono tabular-nums text-[#172033]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#172033] mb-1">
                      Ou gasto total VIP (R$)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="10"
                      value={configDraft.vipMinSpent}
                      onChange={(e) =>
                        setConfigDraft((p) => ({
                          ...p,
                          vipMinSpent: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] text-sm font-mono tabular-nums text-[#172033]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    Dias sem comprar para Cliente Inativo
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    value={configDraft.inactiveDays}
                    onChange={(e) =>
                      setConfigDraft((p) => ({
                        ...p,
                        inactiveDays: Number(e.target.value) || 45,
                      }))
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] text-sm font-mono tabular-nums text-[#172033]"
                  />
                </div>

                <p className="text-[11px] text-[#778094] leading-relaxed">
                  Ordem de prioridade: Inativo ({configDraft.inactiveDays}+ dias) → VIP → Recorrente → Novo cliente. Pedidos cancelados ou recusados não são contabilizados.
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-[#E8EAF0] bg-[#F7F8FC] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRulesModalOpen(false)}
                  disabled={savingConfig}
                  className="mgw-btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="mgw-btn-primary"
                >
                  {savingConfig ? 'Salvando...' : 'Salvar critérios'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
