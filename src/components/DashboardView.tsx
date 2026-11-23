import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  DollarSign,
  Globe,
  Layers,
  Plus,
  QrCode,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  DashboardGranularity,
  ExpenseRecord,
  OnlineOrderRecord,
  SaleRecord,
  ShopSettings,
} from '../types/finance';
import {
  addDays,
  buildLast7DaysSeries,
  buildMonthlyProfitEvolution,
  buildPeriodChartSeries,
  computeDashboardMetrics,
  computeFinancialControl,
  computeTopCombos,
  formatCurrencyBRL,
  formatDateBR,
  getLocalTodayDate,
  getMonthBounds,
} from '../utils/finance';
import {
  computeDashboardHeroMetrics,
  DASHBOARD_PERIOD_OPTIONS,
  type DashboardPeriodPreset,
  formatDeltaPercentBR,
  getUserGreetingFirstName,
} from '../utils/dashboardSummary';
import {
  FinancialHealthDoughnutChart,
  MonthlyProfitEvolutionChart,
  Revenue7DaysChart,
  RevenueVsExpensesChart,
  XSaladaDailyChart,
} from './Charts';
import { computeOnlineOrdersDashboardStats } from '../utils/onlineOrders';

interface DashboardViewProps {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  settings: ShopSettings;
  onlineOrders?: OnlineOrderRecord[];
  userEmail?: string | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onOpenNewSale: () => void;
  onOpenNewExpense: () => void;
  onOpenOrders?: () => void;
}

function DeltaComparisonRow({
  deltaPct,
  comparisonHint,
  invertPolarity = false,
}: {
  deltaPct: number | null;
  comparisonHint: string;
  invertPolarity?: boolean;
}) {
  if (deltaPct === null) {
    return (
      <p className="text-[11px] sm:text-xs text-[#778094] mt-2 truncate">
        Sem base anterior · {comparisonHint}
      </p>
    );
  }

  const isIncrease = deltaPct >= 0;
  const isFavorable = invertPolarity ? deltaPct <= 0 : deltaPct >= 0;
  const ArrowIcon = isIncrease ? ArrowUpRight : ArrowDownRight;

  return (
    <p className="mt-2 flex items-center gap-1 text-[11px] sm:text-xs leading-snug truncate">
      <span
        className={`inline-flex items-center gap-0.5 font-semibold font-mono tabular-nums ${
          isFavorable ? 'text-[#16A36A]' : 'text-[#E35D62]'
        }`}
      >
        <ArrowIcon className="w-3.5 h-3.5 shrink-0" />
        {formatDeltaPercentBR(deltaPct)}
      </span>
      <span className="text-[#778094] truncate">{comparisonHint}</span>
    </p>
  );
}

function DashboardSkeletonView() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando Dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="mgw-skeleton h-7 w-48 rounded-lg" />
          <div className="mgw-skeleton h-4 w-64 rounded-lg" />
        </div>
        <div className="mgw-skeleton h-10 w-44 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((idx) => (
          <div key={idx} className="mgw-skeleton h-[138px] rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 mgw-skeleton h-[320px] rounded-2xl" />
        <div className="lg:col-span-4 mgw-skeleton h-[320px] rounded-2xl" />
      </div>
    </div>
  );
}

export function DashboardView({
  sales,
  expenses,
  settings,
  onlineOrders = [],
  userEmail,
  isLoading = false,
  errorMessage = null,
  onOpenNewSale,
  onOpenNewExpense,
  onOpenOrders,
}: DashboardViewProps) {
  const [periodPreset, setPeriodPreset] =
    useState<DashboardPeriodPreset>('last30');
  const [granularity, setGranularity] = useState<DashboardGranularity>('daily');
  const today = getLocalTodayDate();

  const firstName = useMemo(
    () => getUserGreetingFirstName(userEmail),
    [userEmail],
  );

  const hero = useMemo(
    () =>
      computeDashboardHeroMetrics(
        sales,
        expenses,
        settings,
        periodPreset,
        today,
      ),
    [sales, expenses, settings, periodPreset, today],
  );

  const onlineStats = useMemo(
    () => computeOnlineOrdersDashboardStats(onlineOrders, sales, today),
    [onlineOrders, sales, today],
  );

  const metrics = useMemo(
    () => computeDashboardMetrics(sales, expenses, today),
    [sales, expenses, today],
  );

  const monthBounds = useMemo(() => getMonthBounds(today), [today]);

  const monthFinancialControl = useMemo(() => {
    const monthSales = sales.filter(
      (s) => s.date >= monthBounds.start && s.date <= monthBounds.end,
    );
    const monthExpenses = expenses.filter(
      (e) => e.date >= monthBounds.start && e.date <= monthBounds.end,
    );
    return computeFinancialControl(monthSales, monthExpenses);
  }, [sales, expenses, monthBounds]);

  const last7Series = useMemo(
    () => buildLast7DaysSeries(sales, expenses, today),
    [sales, expenses, today],
  );

  const periodSeries = useMemo(
    () => buildPeriodChartSeries(sales, expenses, granularity, today),
    [sales, expenses, granularity, today],
  );

  const monthlyProfitSeries = useMemo(
    () => buildMonthlyProfitEvolution(sales, expenses, today, 6),
    [sales, expenses, today],
  );

  const topCombosInWindow = useMemo(() => {
    const { start, end } = hero.reportSummary.range;
    const windowSales = sales.filter((s) => s.date >= start && s.date <= end);
    if (windowSales.length === 0 && periodPreset === 'today') {
      return computeTopCombos(
        sales.filter(
          (s) => s.date >= monthBounds.start && s.date <= monthBounds.end,
        ),
      );
    }
    return computeTopCombos(windowSales);
  }, [sales, hero.reportSummary.range, periodPreset, monthBounds]);

  const topCombosCaption = useMemo(() => {
    if (periodPreset === 'today') {
      const hasTodayCombos = sales.some(
        (s) => s.date === today && (s.combosCount ?? 0) > 0,
      );
      return hasTodayCombos ? 'Hoje' : hero.periodLabel;
    }
    return hero.periodLabel;
  }, [periodPreset, sales, today, hero.periodLabel]);

  const dailyGoalPct =
    settings.dailyGoal > 0
      ? Math.min(100, Math.round((metrics.todayRevenue / settings.dailyGoal) * 100))
      : 0;
  const monthlyGoalPct =
    settings.monthlyGoal > 0
      ? Math.min(100, Math.round((metrics.monthRevenue / settings.monthlyGoal) * 100))
      : 0;

  const healthAccent =
    hero.health.status === 'saudavel'
      ? {
          text: 'text-[#16A36A]',
          pill: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#16A36A]',
          Icon: CheckCircle2,
        }
      : hero.health.status === 'atencao'
        ? {
            text: 'text-[#B45309]',
            pill: 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]',
            Icon: AlertTriangle,
          }
        : hero.health.status === 'critico'
          ? {
              text: 'text-[#E35D62]',
              pill: 'bg-[#FEF2F2] border-[#FECACA] text-[#E35D62]',
              Icon: TrendingDown,
            }
          : {
              text: 'text-[#778094]',
              pill: 'bg-[#F5F6FA] border-[#E8EAF0] text-[#778094]',
              Icon: Activity,
            };
  const HealthIcon = healthAccent.Icon;

  const granularityLabel =
    granularity === 'daily'
      ? 'Diária (últimos 14 dias)'
      : granularity === 'weekly'
        ? 'Semanal (últimas 8 semanas)'
        : 'Mensal (últimos 6 meses)';

  const maxComboQty = topCombosInWindow[0]?.quantitySold ?? 1;

  if (isLoading) {
    return <DashboardSkeletonView />;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs sm:text-sm text-[#E35D62] flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Não foi possível atualizar todos os dados do painel: {errorMessage}</span>
        </div>
      )}

      {/* 1. Cabeçalho do Dashboard */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight truncate">
            {firstName ? `Olá, ${firstName}!` : 'Olá!'}
          </h2>
          <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
            Aqui está o resumo do seu negócio hoje.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative inline-flex items-center bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-xl shadow-[0_1px_2px_rgba(23,32,51,0.04)] transition-colors">
            <Calendar
              className="w-4 h-4 text-[#778094] absolute left-3 pointer-events-none"
              aria-hidden="true"
            />
            <select
              aria-label="Período do Dashboard"
              value={periodPreset}
              onChange={(e) => {
                const next = e.target.value as DashboardPeriodPreset;
                setPeriodPreset(next);
                if (next === 'today' || next === 'last7') setGranularity('daily');
                else if (next === 'last30') setGranularity('weekly');
                else setGranularity('monthly');
              }}
              className="appearance-none min-h-[40px] pl-9 pr-8 py-2 bg-transparent text-xs sm:text-[13px] font-semibold text-[#172033] focus:outline-none cursor-pointer"
            >
              {DASHBOARD_PERIOD_OPTIONS.map((opt) => (
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
        </div>
      </section>

      {/* 2. Primeira Linha — Quatro Cartões Principais */}
      <section
        aria-label="Resumo financeiro do período selecionado"
        className="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4"
      >
        {/* Cartão 1 — Faturamento */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]/60 text-[#16A36A] flex items-center justify-center shrink-0">
              <DollarSign className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {hero.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Faturamento
            </p>
            <p
              data-testid="hero-kpi-revenue"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {formatCurrencyBRL(hero.reportSummary.totalRevenue)}
            </p>
            <DeltaComparisonRow
              deltaPct={hero.revenueDeltaPct}
              comparisonHint={hero.comparisonHint}
            />
          </div>
        </article>

        {/* Cartão 2 — Despesas */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#FEF2F2] border border-[#FECACA]/70 text-[#E35D62] flex items-center justify-center shrink-0">
              <Receipt className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {hero.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Despesas
            </p>
            <p
              data-testid="hero-kpi-expenses"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {formatCurrencyBRL(hero.reportSummary.totalExpenses)}
            </p>
            <DeltaComparisonRow
              deltaPct={hero.expensesDeltaPct}
              comparisonHint={hero.comparisonHint}
              invertPolarity
            />
          </div>
        </article>

        {/* Cartão 3 — Lucro */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div
              className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 ${
                hero.reportSummary.netProfit >= 0
                  ? 'bg-[#FFFBEB] border-[#FDE68A]/80 text-[#B38300]'
                  : 'bg-[#FEF2F2] border-[#FECACA]/70 text-[#E35D62]'
              }`}
            >
              {hero.reportSummary.netProfit >= 0 ? (
                <TrendingUp className="w-[18px] h-[18px]" />
              ) : (
                <TrendingDown className="w-[18px] h-[18px]" />
              )}
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {hero.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Lucro
            </p>
            <p
              data-testid="hero-kpi-profit"
              className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums tracking-tight mt-0.5 truncate ${
                hero.reportSummary.netProfit < 0
                  ? 'text-[#E35D62]'
                  : 'text-[#172033]'
              }`}
            >
              {formatCurrencyBRL(hero.reportSummary.netProfit)}
            </p>
            <DeltaComparisonRow
              deltaPct={hero.profitDeltaPct}
              comparisonHint={hero.comparisonHint}
            />
          </div>
        </article>

        {/* Cartão 4 — Pedidos */}
        <article className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between min-h-[138px]">
          <div className="flex items-center justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]/70 text-[#3478E5] flex items-center justify-center shrink-0">
              <ShoppingCart className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[11px] font-medium text-[#778094] truncate">
              {hero.periodLabel}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs sm:text-[13px] font-medium text-[#778094]">
              Pedidos
            </p>
            <p
              data-testid="hero-kpi-orders"
              className="text-xl sm:text-2xl font-extrabold text-[#172033] font-mono tabular-nums tracking-tight mt-0.5 truncate"
            >
              {hero.salesCount}
            </p>
            <DeltaComparisonRow
              deltaPct={hero.salesCountDeltaPct}
              comparisonHint={hero.comparisonHint}
            />
          </div>
        </article>
      </section>

      {/* 3. Segunda Área — Faturamento dos Últimos 7 Dias (65%) + Saúde Financeira (35%) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Gráfico de Faturamento dos Últimos 7 Dias */}
        <div className="lg:col-span-8 bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-6 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-[#172033] tracking-tight">
                Faturamento dos Últimos 7 Dias
              </h3>
              <p className="text-xs text-[#778094] mt-0.5">
                Receita diária em reais · {hero.last7DaysRangeLabel}
              </p>
            </div>

            <span className="inline-flex items-center gap-2 text-xs font-medium text-[#778094] bg-[#F7F8FC] border border-[#E8EAF0] rounded-full px-3 py-1">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#F5B900]"
                aria-hidden="true"
              />
              Faturamento
            </span>
          </div>

          <Revenue7DaysChart data={hero.last7Days} />
        </div>

        {/* Cartão Saúde Financeira */}
        <section
          aria-labelledby="financial-health-heading"
          className="lg:col-span-4 bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-6 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between gap-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="financial-health-heading"
              className="text-base font-bold text-[#172033] tracking-tight"
            >
              Saúde Financeira
            </h3>
            <span className="text-[11px] font-medium text-[#778094]">
              {hero.periodLabel}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 my-auto py-1">
            <FinancialHealthDoughnutChart health={hero.health} />

            <div className="min-w-0 flex-1 text-center sm:text-left lg:text-center xl:text-left space-y-2">
              <p className="text-xs font-medium text-[#778094]">Situação:</p>
              <div className="flex items-center justify-center sm:justify-start lg:justify-center xl:justify-start">
                <span
                  data-testid="financial-health-status"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-sm font-bold ${healthAccent.pill}`}
                >
                  <HealthIcon className="w-4 h-4 shrink-0" />
                  {hero.health.situationLabel}
                </span>
              </div>
              <p className="text-xs text-[#778094] leading-relaxed">
                {hero.health.isAvailable
                  ? hero.health.summary.summaryText
                  : 'Registre vendas ou despesas neste período para calcular a saúde financeira.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E8EAF0]">
            <div>
              <p className="text-[11px] text-[#778094]">Margem</p>
              <p
                data-testid="health-margin"
                className={`text-xs sm:text-sm font-bold font-mono tabular-nums ${
                  !hero.health.isAvailable
                    ? 'text-[#778094]'
                    : hero.health.summary.marginPercent >= 0
                      ? 'text-[#16A36A]'
                      : 'text-[#E35D62]'
                }`}
              >
                {!hero.health.isAvailable
                  ? '—'
                  : `${hero.health.summary.marginPercent.toFixed(1).replace('.', ',')}%`}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-[#778094]">Desp./Rec.</p>
              <p
                data-testid="health-expense-ratio"
                className="text-xs sm:text-sm font-bold text-[#172033] font-mono tabular-nums"
              >
                {!hero.health.isAvailable
                  ? '—'
                  : `${hero.health.summary.expenseRatioPercent.toFixed(1).replace('.', ',')}%`}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-[#778094]">Saldo</p>
              <p
                data-testid="health-net-profit"
                className={`text-xs sm:text-sm font-bold font-mono tabular-nums truncate ${
                  hero.health.summary.netProfit >= 0
                    ? 'text-[#16A36A]'
                    : 'text-[#E35D62]'
                }`}
              >
                {formatCurrencyBRL(hero.health.summary.netProfit)}
              </p>
            </div>
          </div>
        </section>
      </section>

      {/* Empty State Banner se zero registros existirem */}
      {sales.length === 0 && expenses.length === 0 && (
        <section className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-6 text-center space-y-3">
          <h3 className="text-base font-bold text-[#172033]">
            Ainda não há lançamentos registrados
          </h3>
          <p className="text-sm text-[#778094] max-w-lg mx-auto">
            Comece registrando as vendas de X-Saladas, combos ou despesas do dia para acompanhar o faturamento, os gráficos e o lucro líquido da {settings.establishmentName}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenNewSale}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Venda
            </button>
            <button
              type="button"
              onClick={onOpenNewExpense}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-[#F7F8FC] text-sm font-semibold text-[#172033] inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>
          </div>
        </section>
      )}

      {/* 4. Seções Existentes Preservadas — Indicadores de Hoje e Mês Atual */}
      <section aria-labelledby="today-section-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="today-section-heading"
            className="text-xs sm:text-sm font-bold text-[#172033] uppercase tracking-wider"
          >
            Indicadores de Hoje · {formatDateBR(today)}
          </h3>
          {settings.dailyGoal > 0 && (
            <span className="text-[11px] sm:text-xs text-[#778094] font-mono tabular-nums">
              Meta diária: {formatCurrencyBRL(settings.dailyGoal)} ({dailyGoalPct}%)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Faturamento hoje</span>
              <DollarSign className="w-4 h-4 text-[#B38300] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-today-revenue"
                className="text-lg sm:text-2xl font-bold text-[#172033] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.todayRevenue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5 font-mono tabular-nums leading-snug">
                {metrics.todaySalesCount} pedido{metrics.todaySalesCount === 1 ? '' : 's'}
                <span className="block sm:inline">
                  <span className="hidden sm:inline"> · </span>Ticket{' '}
                  {formatCurrencyBRL(metrics.todayAverageTicket)}
                </span>
              </p>
            </div>
            {settings.dailyGoal > 0 && (
              <div className="h-1.5 w-full bg-[#EFF1F7] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#F5B900] rounded-full transition-all duration-300"
                  style={{ width: `${dailyGoalPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">X-Saladas hoje</span>
              <ShoppingBag className="w-4 h-4 text-[#B38300] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-today-qty"
                className="text-lg sm:text-2xl font-bold text-[#172033] font-mono tabular-nums truncate"
              >
                {metrics.todayQty} un
              </p>
              <p
                data-testid="kpi-today-combos"
                className="text-[11px] sm:text-xs text-[#778094] mt-0.5 font-mono tabular-nums truncate"
              >
                {metrics.todayCombos} combo{metrics.todayCombos === 1 ? '' : 's'} vendido{metrics.todayCombos === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Despesas hoje</span>
              <ArrowDownRight className="w-4 h-4 text-[#E35D62] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-today-expenses"
                className="text-lg sm:text-2xl font-bold text-[#E35D62] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.todayExpenses)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5 truncate">
                Custos lançados hoje
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Lucro líquido hoje</span>
              <TrendingUp
                className={`w-4 h-4 shrink-0 ${
                  metrics.todayNetProfit >= 0 ? 'text-[#16A36A]' : 'text-[#E35D62]'
                }`}
              />
            </div>
            <div>
              <p
                data-testid="kpi-today-profit"
                className={`text-lg sm:text-2xl font-bold font-mono tabular-nums truncate ${
                  metrics.todayNetProfit >= 0 ? 'text-[#16A36A]' : 'text-[#E35D62]'
                }`}
              >
                {formatCurrencyBRL(metrics.todayNetProfit)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5 truncate">
                {metrics.todayNetProfit >= 0 ? 'Saldo positivo' : 'Acima da receita'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="month-section-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="month-section-heading"
            className="text-xs sm:text-sm font-bold text-[#172033] uppercase tracking-wider"
          >
            Acumulado do Mês Atual
          </h3>
          {settings.monthlyGoal > 0 && (
            <span className="text-[11px] sm:text-xs text-[#778094] font-mono tabular-nums">
              Meta: {formatCurrencyBRL(settings.monthlyGoal)} ({monthlyGoalPct}%)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Faturamento mês</span>
              <ArrowUpRight className="w-4 h-4 text-[#B38300] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-month-revenue"
                className="text-lg sm:text-2xl font-bold text-[#172033] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.monthRevenue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5 font-mono tabular-nums leading-snug">
                {metrics.monthSalesCount} pedido{metrics.monthSalesCount === 1 ? '' : 's'}
                <span className="block sm:inline">
                  <span className="hidden sm:inline"> · </span>Ticket{' '}
                  {formatCurrencyBRL(metrics.monthAverageTicket)}
                </span>
              </p>
            </div>
            {settings.monthlyGoal > 0 && (
              <div className="h-1.5 w-full bg-[#EFF1F7] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#F5B900] rounded-full transition-all duration-300"
                  style={{ width: `${monthlyGoalPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Lanches no mês</span>
              <ShoppingBag className="w-4 h-4 text-[#B38300] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-month-qty"
                className="text-lg sm:text-2xl font-bold text-[#172033] font-mono tabular-nums truncate"
              >
                {metrics.monthQty} un
              </p>
              <p
                data-testid="kpi-month-combos"
                className="text-[11px] sm:text-xs text-[#778094] mt-0.5 font-mono tabular-nums truncate"
              >
                {metrics.monthCombos} combo{metrics.monthCombos === 1 ? '' : 's'} no mês
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Despesas mês</span>
              <ArrowDownRight className="w-4 h-4 text-[#E35D62] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-month-expenses"
                className="text-lg sm:text-2xl font-bold text-[#E35D62] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.monthExpenses)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5 truncate">
                Saídas no mês
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_1px_4px_rgba(23,32,51,0.03)] p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#778094]">
              <span className="truncate">Lucro do mês</span>
              <TrendingUp
                className={`w-4 h-4 shrink-0 ${
                  metrics.monthNetProfit >= 0 ? 'text-[#16A36A]' : 'text-[#E35D62]'
                }`}
              />
            </div>
            <div>
              <p
                data-testid="kpi-month-profit"
                className={`text-lg sm:text-2xl font-bold font-mono tabular-nums truncate ${
                  metrics.monthNetProfit >= 0 ? 'text-[#16A36A]' : 'text-[#E35D62]'
                }`}
              >
                {formatCurrencyBRL(metrics.monthNetProfit)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5 truncate">
                {metrics.monthNetProfit >= 0 ? 'Resultado positivo' : 'Saldo negativo'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Combos Mais Vendidos */}
      <section
        aria-labelledby="top-combos-heading"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-5 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#B38300]" />
            <h3
              id="top-combos-heading"
              className="text-sm font-bold text-[#172033]"
            >
              Combos mais vendidos
            </h3>
          </div>
          <span className="text-xs text-[#778094]">{topCombosCaption}</span>
        </div>

        {topCombosInWindow.length === 0 ? (
          <p className="text-xs text-[#778094]">
            Nenhum combo vendido neste período ainda. Cadastre combos em Produtos e registre suas vendas rápidas.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topCombosInWindow.slice(0, 6).map((combo, idx) => {
              const barPct = Math.max(
                8,
                Math.round((combo.quantitySold / maxComboQty) * 100),
              );
              return (
                <div
                  key={combo.comboId}
                  className="bg-[#F7F8FC] border border-[#E8EAF0] rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#172033] truncate">
                        #{idx + 1} · {combo.name}
                      </p>
                      <p className="text-xs text-[#778094] font-mono tabular-nums">
                        {combo.quantitySold} combo{combo.quantitySold === 1 ? '' : 's'} vendido{combo.quantitySold === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#B38300] font-mono tabular-nums shrink-0">
                      {formatCurrencyBRL(combo.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#E8EAF0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F5B900] rounded-full"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Demais Gráficos Preservados */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#172033]">
                Vendas de X-Saladas por dia
              </h3>
              <p className="text-xs text-[#778094]">
                Volume de lanches nos últimos 7 dias (individuais + combos)
              </p>
            </div>
          </div>
          <XSaladaDailyChart data={last7Series} />
        </div>

        <div className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#172033]">
                Faturamento vs Despesas
              </h3>
              <p className="text-xs text-[#778094]">
                Visão {granularityLabel}
              </p>
            </div>

            <div
              role="group"
              aria-label="Granularidade do comparativo"
              className="inline-flex items-center p-0.5 bg-[#F5F6FA] border border-[#E8EAF0] rounded-lg"
            >
              {(
                [
                  { id: 'daily', label: 'Diário' },
                  { id: 'weekly', label: 'Semanal' },
                  { id: 'monthly', label: 'Mensal' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGranularity(opt.id)}
                  className={`min-h-[30px] px-2.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    granularity === opt.id
                      ? 'bg-[#F5B900] text-[#172033]'
                      : 'text-[#778094] hover:text-[#172033]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <RevenueVsExpensesChart data={periodSeries} />
        </div>

        <div className="lg:col-span-2 bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#172033]">
                Evolução do lucro mensal
              </h3>
              <p className="text-xs text-[#778094]">
                Lucro líquido acumulado nos últimos 6 meses
              </p>
            </div>
          </div>
          <MonthlyProfitEvolutionChart data={monthlyProfitSeries} />
        </div>
      </section>

      {/* Controle Financeiro do Mês */}
      <section
        aria-labelledby="financial-control-heading"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8EAF0] pb-4">
          <div>
            <h3
              id="financial-control-heading"
              className="text-base font-bold text-[#172033]"
            >
              Controle Financeiro do Mês
            </h3>
            <p className="text-xs text-[#778094] mt-0.5">
              Faturamento bruto não é lucro: acompanhe o resultado líquido após subtrair todas as despesas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E8EAF0] bg-[#F7F8FC] rounded-xl">
          <div className="p-4">
            <p className="text-xs text-[#778094]">Total de vendas (Faturamento)</p>
            <p className="text-xl font-bold text-[#B38300] font-mono tabular-nums mt-1">
              {formatCurrencyBRL(monthFinancialControl.totalRevenue)}
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-[#778094]">Total de despesas (−)</p>
            <p className="text-xl font-bold text-[#E35D62] font-mono tabular-nums mt-1">
              {formatCurrencyBRL(monthFinancialControl.totalExpenses)}
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-[#778094]">Resultado líquido estimado (=)</p>
            <p
              className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                monthFinancialControl.netResult >= 0
                  ? 'text-[#16A36A]'
                  : 'text-[#E35D62]'
              }`}
            >
              {formatCurrencyBRL(monthFinancialControl.netResult)}
            </p>
          </div>
        </div>

        <div
          className={`grid grid-cols-1 ${
            monthFinancialControl.otherReceived > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
          } gap-4 pt-2 border-t border-[#E8EAF0]`}
        >
          <div className="flex items-center gap-3 py-2">
            <Banknote className="w-5 h-5 text-[#16A36A] shrink-0" />
            <div>
              <p className="text-xs text-[#778094]">Dinheiro recebido</p>
              <p className="text-base font-bold text-[#172033] font-mono tabular-nums">
                {formatCurrencyBRL(monthFinancialControl.cashReceived)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <QrCode className="w-5 h-5 text-[#3478E5] shrink-0" />
            <div>
              <p className="text-xs text-[#778094]">Pix recebido</p>
              <p className="text-base font-bold text-[#172033] font-mono tabular-nums">
                {formatCurrencyBRL(monthFinancialControl.pixReceived)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <CreditCard className="w-5 h-5 text-[#B38300] shrink-0" />
            <div>
              <p className="text-xs text-[#778094]">Cartão recebido</p>
              <p className="text-base font-bold text-[#172033] font-mono tabular-nums">
                {formatCurrencyBRL(monthFinancialControl.cardReceived)}
              </p>
              <p className="text-[11px] text-[#778094] font-mono tabular-nums">
                Débito {formatCurrencyBRL(monthFinancialControl.debitReceived)} · Crédito{' '}
                {formatCurrencyBRL(monthFinancialControl.creditReceived)}
              </p>
            </div>
          </div>

          {monthFinancialControl.otherReceived > 0 && (
            <div className="flex items-center gap-3 py-2">
              <DollarSign className="w-5 h-5 text-[#778094] shrink-0" />
              <div>
                <p className="text-xs text-[#778094]">Outros</p>
                <p className="text-base font-bold text-[#172033] font-mono tabular-nums">
                  {formatCurrencyBRL(monthFinancialControl.otherReceived)}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Cardápio Digital e Pedidos Online */}
      <section
        aria-labelledby="digital-menu-dashboard-heading"
        className="bg-white border border-[#E8EAF0] rounded-2xl shadow-[0_2px_8px_rgba(23,32,51,0.04)] p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8EAF0] pb-3.5">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#3478E5]" />
            <h3
              id="digital-menu-dashboard-heading"
              className="text-sm sm:text-base font-bold text-[#172033]"
            >
              Cardápio Digital e Pedidos Online
            </h3>
          </div>
          {onOpenOrders && (
            <button
              type="button"
              onClick={onOpenOrders}
              className="min-h-[38px] px-3.5 rounded-xl border border-[#E8EAF0] hover:border-[#F5B900] bg-[#F7F8FC] text-xs font-semibold text-[#172033] self-start sm:self-center cursor-pointer transition-colors"
            >
              Abrir Central de Pedidos
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-1">
            <p className="text-[11px] text-[#778094]">Recebidos hoje</p>
            <p
              data-testid="kpi-online-received-today"
              className="text-lg font-bold text-[#172033] font-mono tabular-nums"
            >
              {onlineStats.receivedTodayCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-1">
            <p className="text-[11px] text-[#778094]">Em andamento</p>
            <p
              data-testid="kpi-online-in-progress"
              className="text-lg font-bold text-[#B38300] font-mono tabular-nums"
            >
              {onlineStats.inProgressCount + onlineStats.pendingApprovalCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-1">
            <p className="text-[11px] text-[#778094]">Concluídos hoje</p>
            <p
              data-testid="kpi-online-completed-today"
              className="text-lg font-bold text-[#16A36A] font-mono tabular-nums"
            >
              {onlineStats.completedTodayCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-1">
            <p className="text-[11px] text-[#778094]">Recusados / Cancelados</p>
            <p
              data-testid="kpi-online-rejected-today"
              className="text-lg font-bold text-[#E35D62] font-mono tabular-nums"
            >
              {onlineStats.rejectedOrCancelledTodayCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-1">
            <p className="text-[11px] text-[#778094]">Faturamento online (mês)</p>
            <p
              data-testid="kpi-online-revenue-month"
              className="text-base font-bold text-[#3478E5] font-mono tabular-nums truncate"
            >
              {formatCurrencyBRL(onlineStats.onlineRevenueMonth)}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] space-y-1">
            <p className="text-[11px] text-[#778094]">Itens online (mês)</p>
            <p
              data-testid="kpi-online-units-month"
              className="text-lg font-bold text-[#172033] font-mono tabular-nums"
            >
              {onlineStats.onlineUnitsSoldMonth} un
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
