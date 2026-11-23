import type {
  ExpenseRecord,
  ReportPeriodPreset,
  SaleRecord,
  ShopSettings,
} from '../types/finance';
import {
  buildLast7DaysSeries,
  type ChartPoint,
  computeFinancialHealth,
  computeReportSummary,
  type FinancialHealthStatus,
  type FinancialHealthSummary,
  formatDateBR,
  parseLocalDate,
  type ReportSummary,
  roundCurrency,
} from './finance';
import { formatUserDisplayName } from './shellProfile';

export type DashboardPeriodPreset = Extract<
  ReportPeriodPreset,
  'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth'
>;

export const DASHBOARD_PERIOD_OPTIONS: ReadonlyArray<{
  id: DashboardPeriodPreset;
  label: string;
  comparisonHint: string;
}> = [
  { id: 'today', label: 'Hoje', comparisonHint: 'vs ontem' },
  { id: 'last7', label: 'Últimos 7 dias', comparisonHint: 'vs 7 dias anteriores' },
  { id: 'last30', label: 'Últimos 30 dias', comparisonHint: 'vs período anterior' },
  { id: 'thisMonth', label: 'Este mês', comparisonHint: 'vs mês anterior' },
  { id: 'lastMonth', label: 'Mês anterior', comparisonHint: 'vs 2 meses atrás' },
];

const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export interface DashboardRevenueDayPoint extends ChartPoint {
  weekdayLabel: string;
  shortDateLabel: string;
  fullDateLabel: string;
}

export type DashboardHealthSituation = 'Ótima' | 'Atenção' | 'Crítica' | 'Indisponível';

export interface DashboardFinancialHealthView {
  summary: FinancialHealthSummary;
  situationLabel: DashboardHealthSituation;
  status: FinancialHealthStatus;
  centerPercent: number | null;
  positiveArcPercent: number;
  isAvailable: boolean;
  caption: string;
}

export interface DashboardHeroMetrics {
  preset: DashboardPeriodPreset;
  periodLabel: string;
  comparisonHint: string;
  reportSummary: ReportSummary;
  revenueDeltaPct: number | null;
  expensesDeltaPct: number | null;
  profitDeltaPct: number | null;
  salesCount: number;
  previousSalesCount: number;
  salesCountDeltaPct: number | null;
  last7Days: DashboardRevenueDayPoint[];
  last7DaysRangeLabel: string;
  health: DashboardFinancialHealthView;
}

export function getUserGreetingFirstName(email?: string | null): string | null {
  const clean = (email || '').trim();
  if (!clean) return null;
  const fullName = formatUserDisplayName(clean);
  if (!fullName || fullName === 'Usuário MGW') return null;
  const first = fullName.split(/\s+/)[0]?.trim();
  return first || null;
}

export function mapFinancialHealthSituation(
  status: FinancialHealthStatus,
): DashboardHealthSituation {
  switch (status) {
    case 'saudavel':
      return 'Ótima';
    case 'atencao':
      return 'Atenção';
    case 'critico':
      return 'Crítica';
    default:
      return 'Indisponível';
  }
}

export function formatDeltaPercentBR(deltaPct: number): string {
  const absFormatted = Math.abs(deltaPct).toFixed(1).replace('.', ',');
  return `${absFormatted}%`;
}

function normalizeComparisonDelta(
  currentValue: number,
  previousValue: number,
  rawDelta: number | null,
): number | null {
  if (previousValue === 0 && currentValue === 0) {
    return null;
  }
  return rawDelta;
}

export function computeDashboardHeroMetrics(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  settings: ShopSettings,
  preset: DashboardPeriodPreset,
  referenceDate: string,
): DashboardHeroMetrics {
  const optionMeta =
    DASHBOARD_PERIOD_OPTIONS.find((opt) => opt.id === preset) ??
    DASHBOARD_PERIOD_OPTIONS[2];

  const reportSummary = computeReportSummary(
    sales,
    expenses,
    preset,
    referenceDate,
  );

  const prevSalesCount = sales.filter(
    (s) =>
      s.date >= reportSummary.range.prevStart &&
      s.date <= reportSummary.range.prevEnd,
  ).length;

  const salesCountDeltaPct =
    prevSalesCount > 0
      ? roundCurrency(
          ((reportSummary.salesCount - prevSalesCount) / prevSalesCount) * 100,
        )
      : null;

  const revenueDeltaPct = normalizeComparisonDelta(
    reportSummary.totalRevenue,
    reportSummary.comparison.previousRevenue,
    reportSummary.comparison.revenueDeltaPct,
  );
  const expensesDeltaPct = normalizeComparisonDelta(
    reportSummary.totalExpenses,
    reportSummary.comparison.previousExpenses,
    reportSummary.comparison.expensesDeltaPct,
  );
  const profitDeltaPct = normalizeComparisonDelta(
    reportSummary.netProfit,
    reportSummary.comparison.previousProfit,
    reportSummary.comparison.profitDeltaPct,
  );

  const chartEndDate =
    preset === 'lastMonth' ? reportSummary.range.end : referenceDate;
  const rawLast7 = buildLast7DaysSeries(sales, expenses, chartEndDate);
  const last7Days: DashboardRevenueDayPoint[] = rawLast7.map((point) => {
    const dayIndex = parseLocalDate(point.key).getDay();
    return {
      ...point,
      weekdayLabel: WEEKDAY_SHORT_PT[dayIndex] ?? '',
      shortDateLabel: point.label,
      fullDateLabel: formatDateBR(point.key),
    };
  });

  const last7DaysRangeLabel =
    last7Days.length > 0
      ? `${last7Days[0].shortDateLabel} a ${last7Days[last7Days.length - 1].shortDateLabel}`
      : '';

  const periodGoal =
    preset === 'today'
      ? settings.dailyGoal
      : preset === 'last7'
        ? settings.dailyGoal * 7
        : settings.monthlyGoal;

  const healthSummary = computeFinancialHealth(
    reportSummary.totalRevenue,
    reportSummary.totalExpenses,
    periodGoal,
  );

  const isAvailable = healthSummary.status !== 'sem_dados';
  const centerPercent = isAvailable ? Math.round(healthSummary.marginPercent) : null;
  const positiveArcPercent = isAvailable
    ? Math.max(0, Math.min(100, healthSummary.marginPercent))
    : 0;

  return {
    preset,
    periodLabel: optionMeta.label,
    comparisonHint: optionMeta.comparisonHint,
    reportSummary,
    revenueDeltaPct,
    expensesDeltaPct,
    profitDeltaPct,
    salesCount: reportSummary.salesCount,
    previousSalesCount: prevSalesCount,
    salesCountDeltaPct,
    last7Days,
    last7DaysRangeLabel,
    health: {
      summary: healthSummary,
      situationLabel: mapFinancialHealthSituation(healthSummary.status),
      status: healthSummary.status,
      centerPercent,
      positiveArcPercent,
      isAvailable,
      caption: optionMeta.label.toLowerCase(),
    },
  };
}
