import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Globe,
  Layers,
  Plus,
  QrCode,
  ShoppingBag,
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
  computeFinancialHealth,
  computeTopCombos,
  formatCurrencyBRL,
  formatDateBR,
  getLocalTodayDate,
  getMonthBounds,
} from '../utils/finance';
import {
  FinancialHealthChart,
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
  onOpenNewSale: () => void;
  onOpenNewExpense: () => void;
  onOpenOrders?: () => void;
}

export function DashboardView({
  sales,
  expenses,
  settings,
  onlineOrders = [],
  onOpenNewSale,
  onOpenNewExpense,
  onOpenOrders,
}: DashboardViewProps) {
  const [granularity, setGranularity] = useState<DashboardGranularity>('daily');
  const today = getLocalTodayDate();

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
    let windowSales: SaleRecord[];
    if (granularity === 'daily') {
      const todaySales = sales.filter((s) => s.date === today);
      windowSales =
        todaySales.length > 0
          ? todaySales
          : sales.filter(
              (s) => s.date >= monthBounds.start && s.date <= monthBounds.end,
            );
    } else if (granularity === 'weekly') {
      const weekStart = addDays(today, -6);
      windowSales = sales.filter((s) => s.date >= weekStart && s.date <= today);
    } else {
      windowSales = sales.filter(
        (s) => s.date >= monthBounds.start && s.date <= monthBounds.end,
      );
    }
    return computeTopCombos(windowSales);
  }, [sales, granularity, today, monthBounds]);

  const topCombosCaption = useMemo(() => {
    if (granularity === 'daily') {
      const hasTodayCombos = sales.some(
        (s) => s.date === today && (s.combosCount ?? 0) > 0,
      );
      return hasTodayCombos ? 'Hoje' : 'Mês atual';
    }
    return granularity === 'weekly' ? 'Últimos 7 dias' : 'Mês atual';
  }, [granularity, sales, today]);

  const dailyGoalPct =
    settings.dailyGoal > 0
      ? Math.min(100, Math.round((metrics.todayRevenue / settings.dailyGoal) * 100))
      : 0;
  const monthlyGoalPct =
    settings.monthlyGoal > 0
      ? Math.min(100, Math.round((metrics.monthRevenue / settings.monthlyGoal) * 100))
      : 0;

  const healthContext = useMemo(() => {
    if (granularity === 'weekly') {
      const rev = last7Series.reduce((acc, d) => acc + d.revenue, 0);
      const exp = last7Series.reduce((acc, d) => acc + d.expenses, 0);
      return {
        revenue: rev,
        expenses: exp,
        goal: settings.dailyGoal * 7,
        caption: '7 dias',
        chartData: last7Series,
      };
    }
    if (granularity === 'monthly') {
      return {
        revenue: metrics.monthRevenue,
        expenses: metrics.monthExpenses,
        goal: settings.monthlyGoal,
        caption: 'mês atual',
        chartData: monthlyProfitSeries,
      };
    }
    return {
      revenue: metrics.todayRevenue,
      expenses: metrics.todayExpenses,
      goal: settings.dailyGoal,
      caption: 'hoje',
      chartData: last7Series,
    };
  }, [
    granularity,
    last7Series,
    monthlyProfitSeries,
    metrics.todayRevenue,
    metrics.todayExpenses,
    metrics.monthRevenue,
    metrics.monthExpenses,
    settings.dailyGoal,
    settings.monthlyGoal,
  ]);

  const healthSummary = useMemo(
    () =>
      computeFinancialHealth(
        healthContext.revenue,
        healthContext.expenses,
        healthContext.goal,
      ),
    [healthContext],
  );

  const healthAccent =
    healthSummary.status === 'saudavel'
      ? { text: 'text-[#22C55E]', Icon: CheckCircle2 }
      : healthSummary.status === 'atencao'
        ? { text: 'text-[#EAB308]', Icon: AlertTriangle }
        : healthSummary.status === 'critico'
          ? { text: 'text-[#EF4444]', Icon: TrendingDown }
          : { text: 'text-[#6B7280]', Icon: Activity };
  const HealthIcon = healthAccent.Icon;

  const granularityLabel =
    granularity === 'daily'
      ? 'Diária (últimos 14 dias)'
      : granularity === 'weekly'
        ? 'Semanal (últimas 8 semanas)'
        : 'Mensal (últimos 6 meses)';

  const maxComboQty = topCombosInWindow[0]?.quantitySold ?? 1;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Compact Header & Period Toggle */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white border border-gray-200 rounded-xl shadow-sm px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-[#111827] truncate">
            {settings.establishmentName}
          </h2>
          <span className="text-xs text-[#6B7280] font-mono tabular-nums shrink-0">
            · {formatDateBR(today)}
          </span>
        </div>

        <div
          role="group"
          aria-label="Visualização dos gráficos por período"
          className="grid grid-cols-3 sm:inline-flex items-center p-0.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg"
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
              className={`min-h-[36px] sm:min-h-[38px] px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                granularity === opt.id
                  ? 'bg-[#EAB308] text-[#F9FAFB]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Compact Financial Health Info & Chart */}
      <section
        aria-labelledby="financial-health-heading"
        className="bg-white border border-gray-200 rounded-xl shadow-sm p-3.5 sm:p-4"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-5 items-center">
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3
                id="financial-health-heading"
                className="text-xs sm:text-sm font-bold text-[#111827]"
              >
                Saúde Financeira
              </h3>
              <span
                data-testid="financial-health-status"
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${healthAccent.text}`}
              >
                <HealthIcon className="w-3.5 h-3.5 shrink-0" />
                {healthSummary.statusLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-[#E5E7EB]">
              <div>
                <p className="text-[11px] text-[#6B7280]">Margem</p>
                <p
                  data-testid="health-margin"
                  className={`text-sm sm:text-base font-bold font-mono tabular-nums ${
                    healthSummary.status === 'sem_dados'
                      ? 'text-[#6B7280]'
                      : healthSummary.marginPercent >= 0
                        ? 'text-[#22C55E]'
                        : 'text-[#EF4444]'
                  }`}
                >
                  {healthSummary.status === 'sem_dados'
                    ? '0,0%'
                    : `${healthSummary.marginPercent.toFixed(1).replace('.', ',')}%`}
                </p>
              </div>

              <div>
                <p className="text-[11px] text-[#6B7280]">Despesas/Rec.</p>
                <p
                  data-testid="health-expense-ratio"
                  className="text-sm sm:text-base font-bold text-[#111827] font-mono tabular-nums"
                >
                  {healthSummary.expenseRatioPercent.toFixed(1).replace('.', ',')}%
                </p>
              </div>

              <div>
                <p className="text-[11px] text-[#6B7280]">Saldo ({healthContext.caption})</p>
                <p
                  data-testid="health-net-profit"
                  className={`text-sm sm:text-base font-bold font-mono tabular-nums truncate ${
                    healthSummary.netProfit >= 0
                      ? 'text-[#22C55E]'
                      : 'text-[#EF4444]'
                  }`}
                >
                  {formatCurrencyBRL(healthSummary.netProfit)}
                </p>
              </div>
            </div>

            <p className="text-[11px] sm:text-xs text-[#6B7280] leading-snug">
              {healthSummary.summaryText}
            </p>
          </div>

          <div className="lg:col-span-7 lg:border-l lg:border-[#E5E7EB] lg:pl-5 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#E5E7EB]">
            <FinancialHealthChart
              data={healthContext.chartData}
              revenue={healthContext.revenue}
              expenses={healthContext.expenses}
              periodCaption={healthContext.caption}
            />
          </div>
        </div>
      </section>

      {/* Today Indicators */}
      <section aria-labelledby="today-section-heading" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            id="today-section-heading"
            className="text-xs sm:text-sm font-semibold text-[#4B5563]"
          >
            Indicadores de Hoje
          </h3>
          {settings.dailyGoal > 0 && (
            <span className="text-[11px] sm:text-xs text-[#6B7280] font-mono tabular-nums">
              Meta diária: {formatCurrencyBRL(settings.dailyGoal)} ({dailyGoalPct}%)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Faturamento hoje</span>
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EAB308] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-today-revenue"
                className="text-lg sm:text-2xl font-bold text-[#EAB308] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.todayRevenue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 font-mono tabular-nums leading-snug">
                {metrics.todaySalesCount} pedido{metrics.todaySalesCount === 1 ? '' : 's'}
                <span className="block sm:inline">
                  <span className="hidden sm:inline"> · </span>Ticket{' '}
                  {formatCurrencyBRL(metrics.todayAverageTicket)}
                </span>
              </p>
            </div>
            {settings.dailyGoal > 0 && (
              <div className="h-1 w-full bg-[#F1F3F5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#EAB308] rounded-full transition-all duration-300"
                  style={{ width: `${dailyGoalPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">X-Saladas hoje</span>
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EAB308] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-today-qty"
                className="text-lg sm:text-2xl font-bold text-[#111827] font-mono tabular-nums truncate"
              >
                {metrics.todayQty} un
              </p>
              <p
                data-testid="kpi-today-combos"
                className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 font-mono tabular-nums truncate"
              >
                {metrics.todayCombos} combo{metrics.todayCombos === 1 ? '' : 's'} vendido{metrics.todayCombos === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Despesas hoje</span>
              <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EF4444] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-today-expenses"
                className="text-lg sm:text-2xl font-bold text-[#F87171] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.todayExpenses)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 truncate">
                Custos lançados hoje
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Lucro líquido hoje</span>
              <TrendingUp
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                  metrics.todayNetProfit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              />
            </div>
            <div>
              <p
                data-testid="kpi-today-profit"
                className={`text-lg sm:text-2xl font-bold font-mono tabular-nums truncate ${
                  metrics.todayNetProfit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              >
                {formatCurrencyBRL(metrics.todayNetProfit)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 truncate">
                {metrics.todayNetProfit >= 0 ? 'Saldo positivo' : 'Acima da receita'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Month Indicators */}
      <section aria-labelledby="month-section-heading" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            id="month-section-heading"
            className="text-xs sm:text-sm font-semibold text-[#4B5563]"
          >
            Acumulado do Mês Atual
          </h3>
          {settings.monthlyGoal > 0 && (
            <span className="text-[11px] sm:text-xs text-[#6B7280] font-mono tabular-nums">
              Meta: {formatCurrencyBRL(settings.monthlyGoal)} ({monthlyGoalPct}%)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Faturamento mês</span>
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EAB308] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-month-revenue"
                className="text-lg sm:text-2xl font-bold text-[#111827] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.monthRevenue)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 font-mono tabular-nums leading-snug">
                {metrics.monthSalesCount} pedido{metrics.monthSalesCount === 1 ? '' : 's'}
                <span className="block sm:inline">
                  <span className="hidden sm:inline"> · </span>Ticket{' '}
                  {formatCurrencyBRL(metrics.monthAverageTicket)}
                </span>
              </p>
            </div>
            {settings.monthlyGoal > 0 && (
              <div className="h-1 w-full bg-[#F1F3F5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#EAB308] rounded-full transition-all duration-300"
                  style={{ width: `${monthlyGoalPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Lanches no mês</span>
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D97706] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-month-qty"
                className="text-lg sm:text-2xl font-bold text-[#111827] font-mono tabular-nums truncate"
              >
                {metrics.monthQty} un
              </p>
              <p
                data-testid="kpi-month-combos"
                className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 font-mono tabular-nums truncate"
              >
                {metrics.monthCombos} combo{metrics.monthCombos === 1 ? '' : 's'} no mês
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Despesas mês</span>
              <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EF4444] shrink-0" />
            </div>
            <div>
              <p
                data-testid="kpi-month-expenses"
                className="text-lg sm:text-2xl font-bold text-[#F87171] font-mono tabular-nums truncate"
              >
                {formatCurrencyBRL(metrics.monthExpenses)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 truncate">
                Saídas no mês
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#6B7280]">
              <span className="truncate">Lucro do mês</span>
              <TrendingUp
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                  metrics.monthNetProfit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              />
            </div>
            <div>
              <p
                data-testid="kpi-month-profit"
                className={`text-lg sm:text-2xl font-bold font-mono tabular-nums truncate ${
                  metrics.monthNetProfit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                }`}
              >
                {formatCurrencyBRL(metrics.monthNetProfit)}
              </p>
              <p className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5 truncate">
                {metrics.monthNetProfit >= 0 ? 'Resultado positivo' : 'Saldo negativo'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Empty State Banner if zero records exist */}
      {sales.length === 0 && expenses.length === 0 && (
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-center space-y-3">
          <h3 className="text-base font-bold text-[#111827]">
            Ainda não há lançamentos registrados
          </h3>
          <p className="text-sm text-[#6B7280] max-w-lg mx-auto">
            Comece registrando as vendas de X-Saladas, combos ou despesas do dia para acompanhar o faturamento, os gráficos e o lucro líquido da {settings.establishmentName}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenNewSale}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Venda
            </button>
            <button
              type="button"
              onClick={onOpenNewExpense}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E5E7EB] hover:border-[#374151] bg-[#F1F3F5] text-sm font-semibold text-[#111827] inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>
          </div>
        </section>
      )}

      {/* Combos Mais Vendidos */}
      <section
        aria-labelledby="top-combos-heading"
        className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#EAB308]" />
            <h3
              id="top-combos-heading"
              className="text-sm font-bold text-[#111827]"
            >
              Combos mais vendidos
            </h3>
          </div>
          <span className="text-xs text-[#6B7280]">{topCombosCaption}</span>
        </div>

        {topCombosInWindow.length === 0 ? (
          <p className="text-xs text-[#6B7280]">
            Nenhum combo vendido neste período ainda. Cadastre combos em Ajustes e registre suas vendas rápidas.
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
                  className="bg-[#F9FAFB]/70 border border-[#E5E7EB] rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#111827] truncate">
                        #{idx + 1} · {combo.name}
                      </p>
                      <p className="text-xs text-[#6B7280] font-mono tabular-nums">
                        {combo.quantitySold} combo{combo.quantitySold === 1 ? '' : 's'} vendido{combo.quantitySold === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#EAB308] font-mono tabular-nums shrink-0">
                      {formatCurrencyBRL(combo.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#F1F3F5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#EAB308] rounded-full"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Charts Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">
                Faturamento dos últimos 7 dias
              </h3>
              <p className="text-xs text-[#6B7280]">
                Receita diária em reais
              </p>
            </div>
          </div>
          <Revenue7DaysChart data={last7Series} />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">
                Vendas de X-Saladas por dia
              </h3>
              <p className="text-xs text-[#6B7280]">
                Volume de lanches nos últimos 7 dias (individuais + combos)
              </p>
            </div>
          </div>
          <XSaladaDailyChart data={last7Series} />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">
                Faturamento vs Despesas
              </h3>
              <p className="text-xs text-[#6B7280]">
                Visão {granularityLabel}
              </p>
            </div>
          </div>
          <RevenueVsExpensesChart data={periodSeries} />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#111827]">
                Evolução do lucro mensal
              </h3>
              <p className="text-xs text-[#6B7280]">
                Lucro líquido acumulado nos últimos 6 meses
              </p>
            </div>
          </div>
          <MonthlyProfitEvolutionChart data={monthlyProfitSeries} />
        </div>
      </section>

      {/* Controle Financeiro (Faturamento - Despesas = Resultado Líquido + Meios de Pagamento) */}
      <section
        aria-labelledby="financial-control-heading"
        className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E7EB] pb-4">
          <div>
            <h3
              id="financial-control-heading"
              className="text-base font-bold text-[#111827]"
            >
              Controle Financeiro do Mês
            </h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Faturamento bruto não é lucro: acompanhe o resultado líquido após subtrair todas as despesas.
            </p>
          </div>
        </div>

        {/* Equation Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB] bg-[#F9FAFB]/60 rounded-xl">
          <div className="p-4">
            <p className="text-xs text-[#6B7280]">Total de vendas (Faturamento)</p>
            <p className="text-xl font-bold text-[#EAB308] font-mono tabular-nums mt-1">
              {formatCurrencyBRL(monthFinancialControl.totalRevenue)}
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-[#6B7280]">Total de despesas (−)</p>
            <p className="text-xl font-bold text-[#F87171] font-mono tabular-nums mt-1">
              {formatCurrencyBRL(monthFinancialControl.totalExpenses)}
            </p>
          </div>

          <div className="p-4">
            <p className="text-xs text-[#6B7280]">Resultado líquido estimado (=)</p>
            <p
              className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                monthFinancialControl.netResult >= 0
                  ? 'text-[#22C55E]'
                  : 'text-[#EF4444]'
              }`}
            >
              {formatCurrencyBRL(monthFinancialControl.netResult)}
            </p>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div
          className={`grid grid-cols-1 ${
            monthFinancialControl.otherReceived > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
          } gap-4 pt-2 border-t border-[#E5E7EB]`}
        >
          <div className="flex items-center gap-3 py-2">
            <Banknote className="w-5 h-5 text-[#22C55E] shrink-0" />
            <div>
              <p className="text-xs text-[#6B7280]">Dinheiro recebido</p>
              <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                {formatCurrencyBRL(monthFinancialControl.cashReceived)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <QrCode className="w-5 h-5 text-[#38BDF8] shrink-0" />
            <div>
              <p className="text-xs text-[#6B7280]">Pix recebido</p>
              <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                {formatCurrencyBRL(monthFinancialControl.pixReceived)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <CreditCard className="w-5 h-5 text-[#EAB308] shrink-0" />
            <div>
              <p className="text-xs text-[#6B7280]">Cartão recebido</p>
              <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                {formatCurrencyBRL(monthFinancialControl.cardReceived)}
              </p>
              <p className="text-[11px] text-[#6B7280] font-mono tabular-nums">
                Débito {formatCurrencyBRL(monthFinancialControl.debitReceived)} · Crédito{' '}
                {formatCurrencyBRL(monthFinancialControl.creditReceived)}
              </p>
            </div>
          </div>

          {monthFinancialControl.otherReceived > 0 && (
            <div className="flex items-center gap-3 py-2">
              <DollarSign className="w-5 h-5 text-[#4B5563] shrink-0" />
              <div>
                <p className="text-xs text-[#6B7280]">Outros</p>
                <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                  {formatCurrencyBRL(monthFinancialControl.otherReceived)}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Cardápio Digital e Pedidos Online (bloco aditivo preservando os KPIs existentes) */}
      <section
        aria-labelledby="digital-menu-dashboard-heading"
        className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3.5">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#EAB308]" />
            <h3
              id="digital-menu-dashboard-heading"
              className="text-sm sm:text-base font-bold text-[#111827]"
            >
              Cardápio Digital e Pedidos Online
            </h3>
          </div>
          {onOpenOrders && (
            <button
              type="button"
              onClick={onOpenOrders}
              className="min-h-[38px] px-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/50 bg-[#F9FAFB] text-xs font-semibold text-[#EAB308] self-start sm:self-center cursor-pointer"
            >
              Abrir Central de Pedidos
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1">
            <p className="text-[11px] text-[#6B7280]">Recebidos hoje</p>
            <p
              data-testid="kpi-online-received-today"
              className="text-lg font-bold text-[#111827] font-mono tabular-nums"
            >
              {onlineStats.receivedTodayCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1">
            <p className="text-[11px] text-[#6B7280]">Em andamento</p>
            <p
              data-testid="kpi-online-in-progress"
              className="text-lg font-bold text-[#EAB308] font-mono tabular-nums"
            >
              {onlineStats.inProgressCount + onlineStats.pendingApprovalCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1">
            <p className="text-[11px] text-[#6B7280]">Concluídos hoje</p>
            <p
              data-testid="kpi-online-completed-today"
              className="text-lg font-bold text-[#22C55E] font-mono tabular-nums"
            >
              {onlineStats.completedTodayCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1">
            <p className="text-[11px] text-[#6B7280]">Recusados / Cancelados</p>
            <p
              data-testid="kpi-online-rejected-today"
              className="text-lg font-bold text-[#F87171] font-mono tabular-nums"
            >
              {onlineStats.rejectedOrCancelledTodayCount}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1">
            <p className="text-[11px] text-[#6B7280]">Faturamento online (mês)</p>
            <p
              data-testid="kpi-online-revenue-month"
              className="text-base font-bold text-[#EAB308] font-mono tabular-nums truncate"
            >
              {formatCurrencyBRL(onlineStats.onlineRevenueMonth)}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1">
            <p className="text-[11px] text-[#6B7280]">Itens online (mês)</p>
            <p
              data-testid="kpi-online-units-month"
              className="text-lg font-bold text-[#111827] font-mono tabular-nums"
            >
              {onlineStats.onlineUnitsSoldMonth} un
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
