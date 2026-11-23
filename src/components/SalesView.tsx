import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  Eye,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  normalizePaymentMethod,
  PAYMENT_METHODS,
  type SaleRecord,
} from '../types/finance';
import {
  addDays,
  formatCurrencyBRL,
  formatDateBR,
  formatSaleItemsSummary,
  getLocalTodayDate,
  getSaleCombosCount,
  getSaleOrigin,
  getSaleXSaladaCount,
} from '../utils/finance';
import {
  buildSalesCsvContent,
  computeSalesViewSummary,
  formatDeltaPercentSignedBR,
  getPaymentMethodColor,
  paginateList,
  SALES_EXPENSES_PERIOD_OPTIONS,
  type SalesExpensesPeriodPreset,
  triggerCsvDownload,
} from '../utils/salesExpensesSummary';
import {
  type DoughnutSegmentItem,
  InteractiveBreakdownDoughnutChart,
  SalesByDayAreaChart,
} from './SalesExpensesCharts';

interface SalesViewProps {
  sales: SaleRecord[];
  canCreateSales?: boolean;
  canEditSales?: boolean;
  canDeleteSales?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onOpenNewSale: () => void;
  onEditSale: (sale: SaleRecord) => void;
  onDeleteSale: (saleId: string) => Promise<void>;
}

const SALES_PAGE_SIZE = 15;

function SalesDeltaRow({
  deltaPct,
  hint,
}: {
  deltaPct: number | null;
  hint: string;
}) {
  if (deltaPct === null) {
    return (
      <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
        Sem base anterior · {hint}
      </p>
    );
  }
  const isPositive = deltaPct >= 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px] sm:text-xs truncate">
      <span
        className={`inline-flex items-center gap-0.5 font-semibold font-mono tabular-nums ${
          isPositive ? 'text-[#16A36A]' : 'text-[#E35D62]'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {formatDeltaPercentSignedBR(deltaPct)}
      </span>
      <span className="text-[#778094] truncate">{hint}</span>
    </p>
  );
}

function SalesSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando Vendas">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-7 w-36 rounded-lg" />
          <div className="mgw-skeleton h-4 w-52 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-40 rounded-xl" />
          <div className="mgw-skeleton h-10 w-32 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="mgw-skeleton h-[134px] rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 mgw-skeleton h-[310px] rounded-2xl" />
        <div className="lg:col-span-5 mgw-skeleton h-[310px] rounded-2xl" />
      </div>

      <div className="mgw-skeleton h-[260px] rounded-2xl" />
    </div>
  );
}

function SaleDetailsDialog({
  sale,
  canEditSales,
  onClose,
  onEdit,
}: {
  sale: SaleRecord | null;
  canEditSales: boolean;
  onClose: () => void;
  onEdit: (sale: SaleRecord) => void;
}) {
  useEffect(() => {
    if (!sale) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sale, onClose]);

  if (!sale || typeof document === 'undefined') return null;

  const pm = normalizePaymentMethod(sale.paymentMethod);
  const origin = getSaleOrigin(sale);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg max-h-[90vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3">
          <div>
            <h3
              id="sale-detail-title"
              className="text-base font-extrabold text-[#172033]"
            >
              Detalhes da Venda
            </h3>
            <p className="text-xs text-[#778094] mt-0.5 font-mono tabular-nums">
              {formatDateBR(sale.date)} ·{' '}
              {origin === 'online' ? 'Cardápio Online' : 'Venda Manual'}
              {sale.onlineOrderNumber
                ? ` · Pedido #${String(sale.onlineOrderNumber).padStart(4, '0')}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes da venda"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4 bg-[#F7F8FC]/60">
          <div className="bg-white border border-[#E8EAF0] rounded-xl divide-y divide-[#E8EAF0]">
            {sale.items && sale.items.length > 0 ? (
              sale.items.map((item, idx) => (
                <div
                  key={`${item.refId}-${idx}`}
                  className="px-4 py-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#172033]">
                      {item.quantity}x {item.name}
                    </p>
                    <p className="text-[#778094] font-mono tabular-nums mt-0.5">
                      {formatCurrencyBRL(item.unitPrice)} cada
                    </p>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-[#172033] shrink-0">
                    {formatCurrencyBRL(item.lineTotal)}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#172033]">
                  {formatSaleItemsSummary(sale)}
                </span>
                <span className="font-mono tabular-nums font-bold text-[#172033]">
                  {formatCurrencyBRL(sale.totalAmount)}
                </span>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#778094]">
              <span>Forma de pagamento</span>
              <span className="font-semibold text-[#172033]">{pm}</span>
            </div>
            {typeof sale.deliveryFee === 'number' && sale.deliveryFee > 0 && (
              <div className="flex items-center justify-between text-[#778094]">
                <span>Taxa de entrega</span>
                <span className="font-mono tabular-nums text-[#172033]">
                  {formatCurrencyBRL(sale.deliveryFee)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-extrabold text-[#172033] pt-2 border-t border-[#E8EAF0]">
              <span>Total da venda</span>
              <span className="font-mono tabular-nums text-[#16A36A]">
                {formatCurrencyBRL(sale.totalAmount)}
              </span>
            </div>
            {sale.note && (
              <p className="text-xs text-[#778094] pt-2 border-t border-[#E8EAF0]">
                <span className="font-semibold text-[#172033]">Observação:</span>{' '}
                {sale.note}
              </p>
            )}
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex items-center justify-end gap-2">
          {canEditSales && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(sale);
              }}
              className="mgw-btn-primary"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Editar venda</span>
            </button>
          )}
          <button type="button" onClick={onClose} className="mgw-btn-secondary">
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function SalesView({
  sales,
  canCreateSales = true,
  canEditSales = true,
  canDeleteSales = true,
  isLoading = false,
  errorMessage = null,
  onRetry,
  onOpenNewSale,
  onEditSale,
  onDeleteSale,
}: SalesViewProps) {
  const today = getLocalTodayDate();

  const [periodPreset, setPeriodPreset] =
    useState<SalesExpensesPeriodPreset>('last30');
  const [customStart, setCustomStart] = useState(() => addDays(today, -29));
  const [customEnd, setCustomEnd] = useState(today);

  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<
    'all' | 'manual' | 'online'
  >('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [syncHistoryToPeriod, setSyncHistoryToPeriod] = useState(false);
  const [page, setPage] = useState(1);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

  const summary = useMemo(
    () =>
      computeSalesViewSummary(
        sales,
        periodPreset,
        today,
        customStart,
        customEnd,
      ),
    [sales, periodPreset, today, customStart, customEnd],
  );

  const paymentSegments = useMemo<DoughnutSegmentItem[]>(
    () =>
      summary.paymentBreakdown.map((item) => ({
        key: item.paymentMethod,
        label: item.paymentMethod,
        amount: item.amount,
        sharePercent: item.sharePercent,
        count: item.ordersCount,
        color: getPaymentMethodColor(item.paymentMethod),
      })),
    [summary.paymentBreakdown],
  );

  const historySourceSales = useMemo(
    () => (syncHistoryToPeriod ? summary.filteredSales : sales),
    [syncHistoryToPeriod, summary.filteredSales, sales],
  );

  const filteredHistorySales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return historySourceSales.filter((s) => {
      const pm = normalizePaymentMethod(s.paymentMethod);
      const origin = getSaleOrigin(s);
      if (paymentFilter !== 'all' && pm !== paymentFilter) return false;
      if (originFilter !== 'all' && origin !== originFilter) return false;
      if (dateFilter && s.date !== dateFilter) return false;
      if (q) {
        const originLabel = origin === 'online' ? 'cardápio online' : 'manual';
        const hay =
          `${formatSaleItemsSummary(s)} ${s.note} ${pm} ${originLabel} ${formatDateBR(s.date)} ${getSaleXSaladaCount(s)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    historySourceSales,
    paymentFilter,
    originFilter,
    dateFilter,
    searchTerm,
  ]);

  const pagination = useMemo(
    () => paginateList(filteredHistorySales, page, SALES_PAGE_SIZE),
    [filteredHistorySales, page],
  );

  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    paymentFilter,
    originFilter,
    dateFilter,
    syncHistoryToPeriod,
    periodPreset,
  ]);

  async function handleConfirmDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await onDeleteSale(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  function handleExportCsv() {
    if (filteredHistorySales.length === 0) return;
    const csv = buildSalesCsvContent(filteredHistorySales);
    triggerCsvDownload(`mgw-vendas-${today}.csv`, csv);
  }

  if (isLoading) {
    return <SalesSkeleton />;
  }

  const hasHistoryFilters = Boolean(
    dateFilter ||
      paymentFilter !== 'all' ||
      originFilter !== 'all' ||
      searchTerm ||
      syncHistoryToPeriod,
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#B91C1C] flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Não foi possível sincronizar todas as vendas: {errorMessage}
            </span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[34px] px-3 rounded-lg bg-white border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer shrink-0"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* 1. Cabeçalho da Página Vendas */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
            Vendas
          </h2>
          <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
            Acompanhe{' '}
            <span className="font-semibold text-[#172033]">suas vendas</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="relative inline-flex items-center bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-xl shadow-[0_1px_2px_rgba(23,32,51,0.04)] transition-colors">
            <Calendar
              className="w-4 h-4 text-[#778094] absolute left-3 pointer-events-none"
              aria-hidden="true"
            />
            <select
              aria-label="Período de Vendas"
              value={periodPreset}
              onChange={(e) =>
                setPeriodPreset(e.target.value as SalesExpensesPeriodPreset)
              }
              className="appearance-none min-h-[40px] pl-9 pr-8 py-2 bg-transparent text-xs sm:text-[13px] font-semibold text-[#172033] focus:outline-none cursor-pointer"
            >
              {SALES_EXPENSES_PERIOD_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-3.5 h-3.5 text-[#778094] absolute right-2.5 pointer-events-none"
              aria-hidden="true"
            />
          </div>

          {canCreateSales && (
            <button
              type="button"
              onClick={onOpenNewSale}
              className="mgw-btn-primary whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Nova Venda</span>
            </button>
          )}
        </div>
      </section>

      {periodPreset === 'custom' && (
        <section
          aria-label="Intervalo personalizado de datas"
          className="bg-white border border-[#E8EAF0] rounded-2xl p-3.5 flex flex-wrap items-center gap-3 shadow-[0_1px_2px_rgba(23,32,51,0.03)]"
        >
          <span className="text-xs font-semibold text-[#778094]">
            Intervalo personalizado:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Data inicial"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="mgw-input !w-auto max-w-full !min-h-[36px] !text-xs font-mono"
            />
            <span className="text-xs text-[#778094]">até</span>
            <input
              type="date"
              aria-label="Data final"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="mgw-input !w-auto max-w-full !min-h-[36px] !text-xs font-mono"
            />
          </div>
        </section>
      )}

      {/* 2. Três Cartões de Indicadores */}
      <section
        aria-label="Indicadores de Vendas"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4"
      >
        {/* Cartão 1 — Total de Vendas */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[134px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]/70 text-[#16A36A] flex items-center justify-center shrink-0">
              <DollarSign className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {summary.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Total de Vendas
            </p>
            <p
              data-testid="sales-kpi-revenue"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {formatCurrencyBRL(summary.totalRevenue)}
            </p>
            <SalesDeltaRow
              deltaPct={summary.revenueDeltaPct}
              hint={summary.comparisonHint}
            />
          </div>
        </article>

        {/* Cartão 2 — Ticket Médio */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[134px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#3478E5] flex items-center justify-center shrink-0">
              <TrendingUp className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {summary.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Ticket Médio
            </p>
            <p
              data-testid="sales-kpi-ticket"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {formatCurrencyBRL(summary.averageTicket)}
            </p>
            <SalesDeltaRow
              deltaPct={summary.averageTicketDeltaPct}
              hint={summary.comparisonHint}
            />
          </div>
        </article>

        {/* Cartão 3 — Pedidos */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[134px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FFF7ED] border border-[#FED7AA]/80 text-[#F39A25] flex items-center justify-center shrink-0">
              <ShoppingCart className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {summary.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Pedidos
            </p>
            <p
              data-testid="sales-kpi-orders"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {summary.salesCount}
            </p>
            <SalesDeltaRow
              deltaPct={summary.salesCountDeltaPct}
              hint={summary.comparisonHint}
            />
          </div>
        </article>
      </section>

      {/* 3. Gráficos — Vendas por Dia + Formas de Pagamento */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <article className="lg:col-span-7 bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#172033]">
                Vendas por Dia
              </h3>
              <p className="text-xs text-[#778094]">
                Evolução diária em {summary.periodLabel.toLowerCase()}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#778094] shrink-0">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#F5B900]"
                aria-hidden="true"
              />
              <span>Vendas</span>
            </div>
          </div>

          <SalesByDayAreaChart data={summary.dailySeries} />
        </article>

        <article className="lg:col-span-5 bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm sm:text-base font-bold text-[#172033]">
              Formas de Pagamento
            </h3>
            <p className="text-xs text-[#778094]">
              Distribuição real em {summary.periodLabel.toLowerCase()}
            </p>
          </div>

          <div className="my-auto">
            <InteractiveBreakdownDoughnutChart
              segments={paymentSegments}
              totalAmount={summary.totalRevenue}
              centerIdleLabel="Vendas"
              emptyMessage="Nenhuma venda registrada no período para exibir formas de pagamento."
              countUnitSingular="venda"
              countUnitPlural="vendas"
              ariaLabel="Gráfico circular de formas de pagamento"
            />
          </div>
        </article>
      </section>

      {/* 4. Filtros & Histórico Completo de Vendas */}
      <section className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-[#E8EAF0] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#172033]">
                Histórico de Vendas
              </h3>
              <p className="text-xs text-[#778094] font-mono tabular-nums">
                {filteredHistorySales.length}{' '}
                {filteredHistorySales.length === 1
                  ? 'venda encontrada'
                  : 'vendas encontradas'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={syncHistoryToPeriod}
                onClick={() => setSyncHistoryToPeriod((prev) => !prev)}
                className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  syncHistoryToPeriod
                    ? 'bg-[#FFFBEB] border-[#F5B900] text-[#172033]'
                    : 'bg-white border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                }`}
              >
                {syncHistoryToPeriod
                  ? `Filtrado: ${summary.periodLabel}`
                  : 'Exibindo todo o histórico'}
              </button>

              {filteredHistorySales.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="min-h-[36px] px-3 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#778094]" />
                  <span>Exportar CSV</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Buscar vendas por combo, item, observação ou data"
                placeholder="Buscar por combo, item, observação, pagamento ou data..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mgw-input !pl-9 !min-h-[40px] !text-xs sm:!text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por forma de pagamento"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="mgw-input w-full sm:!w-auto max-w-full !min-h-[40px] !text-xs sm:!text-[13px]"
              >
                <option value="all">Todas as formas</option>
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtrar por origem da venda"
                value={originFilter}
                onChange={(e) =>
                  setOriginFilter(
                    e.target.value as 'all' | 'manual' | 'online',
                  )
                }
                className="mgw-input w-full sm:!w-auto max-w-full !min-h-[40px] !text-xs sm:!text-[13px]"
              >
                <option value="all">Todas as origens</option>
                <option value="manual">Vendas Manuais</option>
                <option value="online">Cardápio Online</option>
              </select>

              <input
                type="date"
                aria-label="Filtrar por data"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="mgw-input w-full sm:!w-auto max-w-full !min-h-[40px] !text-xs font-mono"
              />

              {hasHistoryFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setPaymentFilter('all');
                    setOriginFilter('all');
                    setDateFilter('');
                    setSyncHistoryToPeriod(false);
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] text-xs font-semibold text-[#778094] hover:text-[#172033] cursor-pointer whitespace-nowrap"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredHistorySales.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-[#172033]">
              {sales.length === 0
                ? 'Nenhuma venda registrada ainda.'
                : 'Nenhuma venda encontrada com os filtros selecionados.'}
            </p>
            <p className="text-xs text-[#778094]">
              {sales.length === 0
                ? 'Clique em Nova Venda para lançar seu primeiro registro.'
                : 'Altere os filtros acima para visualizar todo o histórico.'}
            </p>
            {sales.length === 0 && canCreateSales && (
              <button
                type="button"
                onClick={onOpenNewSale}
                className="mgw-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar primeira venda</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#E8EAF0]">
              {pagination.items.map((sale) => {
                const xCount = getSaleXSaladaCount(sale);
                const combosCount = getSaleCombosCount(sale);
                const pm = normalizePaymentMethod(sale.paymentMethod);
                const origin = getSaleOrigin(sale);
                const summaryText = formatSaleItemsSummary(sale);

                return (
                  <div
                    key={sale.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F8FC]/85 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-[#172033] truncate max-w-full">
                          {summaryText}
                        </span>
                        <span
                          className="text-xs text-[#778094]"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="text-xs font-medium text-[#4B5563]">
                          {pm}
                        </span>
                        <span
                          className="text-xs text-[#778094]"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            origin === 'online'
                              ? 'text-[#B45309]'
                              : 'text-[#778094]'
                          }`}
                        >
                          {origin === 'online' ? 'Cardápio Online' : 'Manual'}
                        </span>
                        <span
                          className="text-xs text-[#778094]"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        <span className="text-xs text-[#778094] font-mono tabular-nums">
                          {formatDateBR(sale.date)}
                        </span>
                      </div>
                      <p className="text-xs text-[#778094] font-mono tabular-nums truncate">
                        {xCount} X-Salada{xCount === 1 ? '' : 's'}
                        {combosCount > 0
                          ? ` · ${combosCount} combo${
                              combosCount === 1 ? '' : 's'
                            }`
                          : ''}
                        {sale.note ? ` · ${sale.note}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                      <span className="text-sm sm:text-base font-extrabold text-[#16A36A] font-mono tabular-nums">
                        {formatCurrencyBRL(sale.totalAmount)}
                      </span>

                      {canDeleteSales && confirmDeleteId === sale.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingId === sale.id}
                            onClick={() => void handleConfirmDelete(sale.id)}
                            className="min-h-[38px] px-3 rounded-lg bg-[#E35D62] hover:bg-[#DC2626] text-white text-xs font-bold cursor-pointer"
                          >
                            {deletingId === sale.id ? 'Excluindo...' : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[38px] px-3 rounded-lg border border-[#E8EAF0] text-xs font-semibold text-[#4B5563] cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedSale(sale)}
                            aria-label={`Visualizar detalhes da venda ${summaryText}`}
                            className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEditSales && (
                            <button
                              type="button"
                              onClick={() => onEditSale(sale)}
                              aria-label={`Editar venda ${summaryText} em ${formatDateBR(sale.date)}`}
                              className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E8EAF0] hover:border-[#F5B900] flex items-center justify-center text-[#778094] hover:text-[#B45309] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteSales && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(sale.id)}
                              aria-label={`Excluir venda ${summaryText} em ${formatDateBR(sale.date)}`}
                              className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E8EAF0] hover:border-[#FECACA] flex items-center justify-center text-[#778094] hover:text-[#E35D62] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {pagination.totalPages > 1 && (
              <nav
                aria-label="Paginação de vendas"
                className="px-4 sm:px-5 py-3 border-t border-[#E8EAF0] bg-[#F7F8FC]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#778094]"
              >
                <span className="tabular-nums">
                  Exibindo{' '}
                  <strong className="text-[#172033]">
                    {pagination.startIndex + 1}–{pagination.endIndex}
                  </strong>{' '}
                  de{' '}
                  <strong className="text-[#172033]">
                    {pagination.totalItems}
                  </strong>{' '}
                  vendas
                </span>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={pagination.safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[34px] px-3 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-[#172033] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </button>
                  <span className="font-mono tabular-nums px-1.5 text-[#172033] font-semibold">
                    {pagination.safePage} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={pagination.safePage >= pagination.totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(pagination.totalPages, p + 1))
                    }
                    className="min-h-[34px] px-3 rounded-lg border border-[#E8EAF0] bg-white hover:bg-[#F7F8FC] text-[#172033] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>

      <SaleDetailsDialog
        sale={selectedSale}
        canEditSales={canEditSales}
        onClose={() => setSelectedSale(null)}
        onEdit={onEditSale}
      />
    </div>
  );
}
