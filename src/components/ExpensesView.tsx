import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CupSoda,
  DollarSign,
  Download,
  Eye,
  Flame,
  Package,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseRecord,
} from '../types/finance';
import {
  addDays,
  formatCurrencyBRL,
  formatDateBR,
  formatShortDateBR,
  getLocalTodayDate,
} from '../utils/finance';
import {
  buildExpensesCsvContent,
  computeExpensesViewSummary,
  formatDeltaPercentSignedBR,
  getExpenseCategoryColor,
  paginateList,
  SALES_EXPENSES_PERIOD_OPTIONS,
  type SalesExpensesPeriodPreset,
  triggerCsvDownload,
} from '../utils/salesExpensesSummary';
import {
  type DoughnutSegmentItem,
  InteractiveBreakdownDoughnutChart,
} from './SalesExpensesCharts';

interface ExpensesViewProps {
  expenses: ExpenseRecord[];
  canCreateExpenses?: boolean;
  canEditExpenses?: boolean;
  canDeleteExpenses?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onOpenNewExpense: () => void;
  onEditExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (expenseId: string) => Promise<void>;
}

const EXPENSES_PAGE_SIZE = 15;

function getExpenseCategoryVisual(category: ExpenseCategory): {
  Icon: typeof Receipt;
  badgeClass: string;
} {
  switch (category) {
    case 'Carnes e hambúrgueres':
    case 'Ingredientes':
      return {
        Icon: Utensils,
        badgeClass: 'bg-[#FEF2F2] border-[#FECACA]/70 text-[#E35D62]',
      };
    case 'Pães':
    case 'Queijos e frios':
      return {
        Icon: ShoppingBag,
        badgeClass: 'bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]',
      };
    case 'Bebidas':
      return {
        Icon: CupSoda,
        badgeClass: 'bg-[#ECFEFF] border-[#A5F3FC] text-[#0891B2]',
      };
    case 'Embalagens':
      return {
        Icon: Package,
        badgeClass: 'bg-[#F5F3FF] border-[#DDD6FE] text-[#7C3AED]',
      };
    case 'Gás':
      return {
        Icon: Flame,
        badgeClass: 'bg-[#FFF7ED] border-[#FED7AA] text-[#EA580C]',
      };
    case 'Energia':
      return {
        Icon: Zap,
        badgeClass: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#3478E5]',
      };
    case 'Transporte':
      return {
        Icon: Truck,
        badgeClass: 'bg-[#EEF2FF] border-[#C7D2FE] text-[#4F46E5]',
      };
    default:
      return {
        Icon: Receipt,
        badgeClass: 'bg-[#F7F8FC] border-[#E8EAF0] text-[#778094]',
      };
  }
}

function ExpensesDeltaRow({
  deltaPct,
  hint,
  invertPolarity = true,
}: {
  deltaPct: number | null;
  hint: string;
  invertPolarity?: boolean;
}) {
  if (deltaPct === null) {
    return (
      <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
        {hint}
      </p>
    );
  }
  const isIncrease = deltaPct >= 0;
  const isFavorable = invertPolarity ? deltaPct <= 0 : deltaPct >= 0;
  const Icon = isIncrease ? ArrowUpRight : ArrowDownRight;

  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px] sm:text-xs truncate">
      <span
        className={`inline-flex items-center gap-0.5 font-semibold font-mono tabular-nums ${
          isFavorable ? 'text-[#16A36A]' : 'text-[#E35D62]'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {formatDeltaPercentSignedBR(deltaPct)}
      </span>
      <span className="text-[#778094] truncate">{hint}</span>
    </p>
  );
}

function ExpensesSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando Despesas">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-7 w-40 rounded-lg" />
          <div className="mgw-skeleton h-4 w-52 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="mgw-skeleton h-10 w-40 rounded-xl" />
          <div className="mgw-skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="mgw-skeleton h-[134px] rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 mgw-skeleton h-[300px] rounded-2xl" />
        <div className="lg:col-span-6 mgw-skeleton h-[300px] rounded-2xl" />
      </div>

      <div className="mgw-skeleton h-[260px] rounded-2xl" />
    </div>
  );
}

function ExpenseDetailsDialog({
  expense,
  canEditExpenses,
  onClose,
  onEdit,
}: {
  expense: ExpenseRecord | null;
  canEditExpenses: boolean;
  onClose: () => void;
  onEdit: (expense: ExpenseRecord) => void;
}) {
  useEffect(() => {
    if (!expense) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expense, onClose]);

  if (!expense || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg max-h-[90vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.16)] flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#E8EAF0] flex items-start justify-between gap-3">
          <div>
            <h3
              id="expense-detail-title"
              className="text-base font-extrabold text-[#172033]"
            >
              Detalhes da Despesa
            </h3>
            <p className="text-xs text-[#778094] mt-0.5 font-mono tabular-nums">
              {formatDateBR(expense.date)} · {expense.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes da despesa"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4 bg-[#F7F8FC]/60">
          <div className="bg-white border border-[#E8EAF0] rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[#778094]">Descrição</span>
              <span className="font-bold text-[#172033] text-right">
                {expense.description}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#778094]">Categoria</span>
              <span className="font-semibold text-[#172033]">
                {expense.category}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#778094]">Forma de pagamento</span>
              <span className="font-semibold text-[#172033]">
                {expense.paymentMethod}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#778094]">Data</span>
              <span className="font-mono tabular-nums text-[#172033]">
                {formatDateBR(expense.date)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#E8EAF0] text-sm font-extrabold text-[#172033]">
              <span>Valor</span>
              <span className="font-mono tabular-nums text-[#E35D62]">
                − {formatCurrencyBRL(expense.amount)}
              </span>
            </div>
            {expense.note && (
              <p className="text-xs text-[#778094] pt-2 border-t border-[#E8EAF0]">
                <span className="font-semibold text-[#172033]">Observação:</span>{' '}
                {expense.note}
              </p>
            )}
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E8EAF0] bg-white flex items-center justify-end gap-2">
          {canEditExpenses && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(expense);
              }}
              className="mgw-btn-primary"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Editar despesa</span>
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

export function ExpensesView({
  expenses,
  canCreateExpenses = true,
  canEditExpenses = true,
  canDeleteExpenses = true,
  isLoading = false,
  errorMessage = null,
  onRetry,
  onOpenNewExpense,
  onEditExpense,
  onDeleteExpense,
}: ExpensesViewProps) {
  const today = getLocalTodayDate();

  const [periodPreset, setPeriodPreset] =
    useState<SalesExpensesPeriodPreset>('last30');
  const [customStart, setCustomStart] = useState(() => addDays(today, -29));
  const [customEnd, setCustomEnd] = useState(today);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [syncHistoryToPeriod, setSyncHistoryToPeriod] = useState(false);
  const [page, setPage] = useState(1);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(
    null,
  );

  const summary = useMemo(
    () =>
      computeExpensesViewSummary(
        expenses,
        periodPreset,
        today,
        customStart,
        customEnd,
      ),
    [expenses, periodPreset, today, customStart, customEnd],
  );

  const categorySegments = useMemo<DoughnutSegmentItem[]>(
    () =>
      summary.categoryBreakdown.map((item) => ({
        key: item.category,
        label: item.category,
        amount: item.amount,
        sharePercent: item.sharePercent,
        count: item.count,
        color: getExpenseCategoryColor(item.category),
      })),
    [summary.categoryBreakdown],
  );

  const historySourceExpenses = useMemo(
    () => (syncHistoryToPeriod ? summary.filteredExpenses : expenses),
    [syncHistoryToPeriod, summary.filteredExpenses, expenses],
  );

  const filteredHistoryExpenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return historySourceExpenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) {
        return false;
      }
      if (q) {
        const hay =
          `${e.description} ${e.category} ${e.paymentMethod} ${e.note} ${formatDateBR(e.date)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [historySourceExpenses, categoryFilter, searchTerm]);

  const pagination = useMemo(
    () => paginateList(filteredHistoryExpenses, page, EXPENSES_PAGE_SIZE),
    [filteredHistoryExpenses, page],
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, categoryFilter, syncHistoryToPeriod, periodPreset]);

  async function handleConfirmDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await onDeleteExpense(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  function handleViewAllExpenses() {
    setSearchTerm('');
    setCategoryFilter('all');
    setSyncHistoryToPeriod(false);
    if (typeof document !== 'undefined') {
      document
        .getElementById('expenses-history-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleExportCsv() {
    if (filteredHistoryExpenses.length === 0) return;
    const csv = buildExpensesCsvContent(filteredHistoryExpenses);
    triggerCsvDownload(`mgw-despesas-${today}.csv`, csv);
  }

  if (isLoading) {
    return <ExpensesSkeleton />;
  }

  const hasHistoryFilters = Boolean(
    categoryFilter !== 'all' || searchTerm || syncHistoryToPeriod,
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
              Não foi possível sincronizar todas as despesas: {errorMessage}
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

      {/* 1. Cabeçalho da Página Despesas */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
            Despesas
          </h2>
          <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
            Controle{' '}
            <span className="font-semibold text-[#172033]">seus gastos</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="relative inline-flex items-center bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-xl shadow-[0_1px_2px_rgba(23,32,51,0.04)] transition-colors">
            <Calendar
              className="w-4 h-4 text-[#778094] absolute left-3 pointer-events-none"
              aria-hidden="true"
            />
            <select
              aria-label="Período de Despesas"
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

          {canCreateExpenses && (
            <button
              type="button"
              onClick={onOpenNewExpense}
              className="mgw-btn-primary whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Nova Despesa</span>
            </button>
          )}
        </div>
      </section>

      {periodPreset === 'custom' && (
        <section
          aria-label="Intervalo personalizado de despesas"
          className="bg-white border border-[#E8EAF0] rounded-2xl p-3.5 flex flex-wrap items-center gap-3 shadow-[0_1px_2px_rgba(23,32,51,0.03)]"
        >
          <span className="text-xs font-semibold text-[#778094]">
            Intervalo personalizado:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Data inicial de despesas"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="mgw-input !w-auto max-w-full !min-h-[36px] !text-xs font-mono"
            />
            <span className="text-xs text-[#778094]">até</span>
            <input
              type="date"
              aria-label="Data final de despesas"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="mgw-input !w-auto max-w-full !min-h-[36px] !text-xs font-mono"
            />
          </div>
        </section>
      )}

      {/* 2. Três Cartões de Indicadores */}
      <section
        aria-label="Indicadores de Despesas"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4"
      >
        {/* Cartão 1 — Total de Despesas */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[134px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FEF2F2] border border-[#FECACA]/70 text-[#E35D62] flex items-center justify-center shrink-0">
              <DollarSign className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {summary.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Total de Despesas
            </p>
            <p
              data-testid="expenses-kpi-total"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {formatCurrencyBRL(summary.totalExpenses)}
            </p>
            <ExpensesDeltaRow
              deltaPct={summary.expensesDeltaPct}
              hint={
                summary.expensesDeltaPct !== null
                  ? summary.comparisonHint
                  : `Sem base anterior · ${summary.comparisonHint}`
              }
              invertPolarity
            />
          </div>
        </article>

        {/* Cartão 2 — Média Mensal */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[134px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#3478E5] flex items-center justify-center shrink-0">
              <Calendar className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              Histórico ativo
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Média Mensal
            </p>
            <p
              data-testid="expenses-kpi-monthly-avg"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {formatCurrencyBRL(summary.monthlyAverage)}
            </p>
            <ExpensesDeltaRow
              deltaPct={summary.vsMonthlyAveragePct}
              hint={
                summary.vsMonthlyAveragePct !== null
                  ? `período vs média (${summary.activeMonthsCount} meses)`
                  : summary.activeMonthsCount > 0
                    ? `Base: ${summary.activeMonthsCount} ${
                        summary.activeMonthsCount === 1 ? 'mês' : 'meses'
                      }`
                    : 'Sem meses anteriores'
              }
              invertPolarity
            />
          </div>
        </article>

        {/* Cartão 3 — Categorias */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[134px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#F5F3FF] border border-[#DDD6FE] text-[#7C3AED] flex items-center justify-center shrink-0">
              <Tag className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {summary.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Categorias
            </p>
            <p
              data-testid="expenses-kpi-categories"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {summary.categoriesUsedCount}
            </p>
            <p className="mt-1.5 text-[11px] sm:text-xs text-[#778094] truncate">
              de {EXPENSE_CATEGORIES.length} disponíveis com gastos
            </p>
          </div>
        </article>
      </section>

      {/* 3. Despesas por Categoria (Doughnut) + Últimas Despesas */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <article className="lg:col-span-6 bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-sm sm:text-base font-bold text-[#172033]">
              Despesas por Categoria
            </h3>
            <p className="text-xs text-[#778094]">
              Distribuição dos custos em {summary.periodLabel.toLowerCase()}
            </p>
          </div>

          <div className="my-auto">
            <InteractiveBreakdownDoughnutChart
              segments={categorySegments}
              totalAmount={summary.totalExpenses}
              centerIdleLabel="Despesas"
              emptyMessage="Nenhuma despesa registrada no período selecionado."
              countUnitSingular="lançamento"
              countUnitPlural="lançamentos"
              ariaLabel="Gráfico circular de despesas por categoria"
            />
          </div>
        </article>

        <article className="lg:col-span-6 bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#172033]">
                Últimas Despesas
              </h3>
              <p className="text-xs text-[#778094]">
                Registros recentes em {summary.periodLabel.toLowerCase()}
              </p>
            </div>

            <button
              type="button"
              onClick={handleViewAllExpenses}
              className="text-xs font-bold text-[#D97706] hover:text-[#B45309] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Ver todas</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {summary.latestExpenses.length === 0 ? (
            <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-center px-4 bg-[#F9FAFC] border border-dashed border-[#E8EAF0] rounded-xl gap-2">
              <div className="w-10 h-10 rounded-full bg-white border border-[#E8EAF0] text-[#778094] flex items-center justify-center">
                <Receipt className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-xs sm:text-sm font-medium text-[#778094]">
                Nenhuma despesa registrada neste período.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E8EAF0] my-auto">
              {summary.latestExpenses.map((expense) => {
                const { Icon, badgeClass } = getExpenseCategoryVisual(
                  expense.category,
                );
                return (
                  <div
                    key={expense.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedExpense(expense)}
                      className="flex items-center gap-3 min-w-0 text-left flex-1 cursor-pointer group"
                    >
                      <div
                        className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${badgeClass}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-[13px] font-semibold text-[#172033] group-hover:text-[#B45309] truncate transition-colors">
                          {expense.description}
                        </p>
                        <p className="text-[11px] text-[#778094] truncate">
                          {expense.category}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p className="text-xs sm:text-[13px] font-bold text-[#172033] font-mono tabular-nums">
                          {formatCurrencyBRL(expense.amount)}
                        </p>
                        <p className="text-[11px] text-[#778094] font-mono tabular-nums">
                          {formatShortDateBR(expense.date)}
                        </p>
                      </div>

                      {canEditExpenses && (
                        <button
                          type="button"
                          onClick={() => onEditExpense(expense)}
                          aria-label={`Editar rapidamente ${expense.description}`}
                          className="w-8 h-8 rounded-lg border border-[#E8EAF0] hover:border-[#F5B900] flex items-center justify-center text-[#778094] hover:text-[#B45309] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      {/* 4. Filtros & Histórico Completo de Despesas */}
      <section
        id="expenses-history-section"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] overflow-hidden"
      >
        <div className="p-4 sm:px-5 border-b border-[#E8EAF0] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#172033]">
                Histórico de Despesas
              </h3>
              <p className="text-xs text-[#778094] font-mono tabular-nums">
                {filteredHistoryExpenses.length}{' '}
                {filteredHistoryExpenses.length === 1
                  ? 'registro encontrado'
                  : 'registros encontrados'}
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

              {filteredHistoryExpenses.length > 0 && (
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

          <div className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Buscar despesas"
                placeholder="Buscar por descrição, categoria ou observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mgw-input !pl-9 !min-h-[40px] !text-xs sm:!text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por categoria de despesa"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="mgw-input w-full sm:!w-auto max-w-full !min-h-[40px] !text-xs sm:!text-[13px]"
              >
                <option value="all">Todas as categorias</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {hasHistoryFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setSearchTerm('');
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

        {filteredHistoryExpenses.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-[#172033]">
              {expenses.length === 0
                ? 'Nenhuma despesa registrada ainda.'
                : 'Nenhuma despesa encontrada para os filtros atuais.'}
            </p>
            <p className="text-xs text-[#778094]">
              {expenses.length === 0
                ? 'Registre compras de carne, pães, queijos, bebidas, gás e outras despesas.'
                : 'Limpe os filtros para visualizar todas as despesas.'}
            </p>
            {expenses.length === 0 && canCreateExpenses && (
              <button
                type="button"
                onClick={onOpenNewExpense}
                className="mgw-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar primeira despesa</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#E8EAF0]">
              {pagination.items.map((expense) => {
                const { Icon, badgeClass } = getExpenseCategoryVisual(
                  expense.category,
                );
                return (
                  <div
                    key={expense.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F8FC]/85 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${badgeClass}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-sm font-semibold text-[#172033] truncate">
                          {expense.description}
                        </p>
                        <p className="text-xs text-[#778094] truncate">
                          <span>{expense.category}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{expense.paymentMethod}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {formatDateBR(expense.date)}
                          </span>
                          {expense.note ? ` · ${expense.note}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                      <span className="text-sm sm:text-base font-extrabold text-[#E35D62] font-mono tabular-nums">
                        − {formatCurrencyBRL(expense.amount)}
                      </span>

                      {canDeleteExpenses && confirmDeleteId === expense.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingId === expense.id}
                            onClick={() => void handleConfirmDelete(expense.id)}
                            className="min-h-[38px] px-3 rounded-lg bg-[#E35D62] hover:bg-[#DC2626] text-white text-xs font-bold cursor-pointer"
                          >
                            {deletingId === expense.id
                              ? 'Excluindo...'
                              : 'Confirmar'}
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
                            onClick={() => setSelectedExpense(expense)}
                            aria-label={`Visualizar detalhes da despesa ${expense.description}`}
                            className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEditExpenses && (
                            <button
                              type="button"
                              onClick={() => onEditExpense(expense)}
                              aria-label={`Editar despesa ${expense.description}`}
                              className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E8EAF0] hover:border-[#F5B900] flex items-center justify-center text-[#778094] hover:text-[#B45309] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteExpenses && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(expense.id)}
                              aria-label={`Excluir despesa ${expense.description}`}
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
                aria-label="Paginação de despesas"
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
                  despesas
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

      <ExpenseDetailsDialog
        expense={selectedExpense}
        canEditExpenses={canEditExpenses}
        onClose={() => setSelectedExpense(null)}
        onEdit={onEditExpense}
      />
    </div>
  );
}
