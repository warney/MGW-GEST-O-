import {
  normalizePaymentMethod,
  type ExpenseCategory,
  type ExpenseRecord,
  type ReportPeriodPreset,
  type SaleRecord,
} from '../types/finance';
import {
  addDays,
  computeExpenseByCategory,
  computePaymentMethodBreakdown,
  computeReportSummary,
  formatDateBR,
  formatSaleItemsSummary,
  formatShortDateBR,
  getLocalTodayDate,
  getReportDateRange,
  getSaleOrigin,
  getSaleXSaladaCount,
  parseLocalDate,
  roundCurrency,
  type CategoryBreakdownItem,
  type PaymentMethodStat,
} from './finance';

export type SalesExpensesPeriodPreset =
  | Extract<
      ReportPeriodPreset,
      'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom'
    >
  | 'all';

export const SALES_EXPENSES_PERIOD_OPTIONS: ReadonlyArray<{
  id: SalesExpensesPeriodPreset;
  label: string;
  comparisonHint: string;
}> = [
  { id: 'today', label: 'Hoje', comparisonHint: 'vs ontem' },
  { id: 'yesterday', label: 'Ontem', comparisonHint: 'vs dia anterior' },
  { id: 'last7', label: 'Últimos 7 dias', comparisonHint: 'vs 7 dias anteriores' },
  { id: 'last30', label: 'Últimos 30 dias', comparisonHint: 'vs período anterior' },
  { id: 'thisMonth', label: 'Este mês', comparisonHint: 'vs mês anterior' },
  { id: 'lastMonth', label: 'Mês anterior', comparisonHint: 'vs 2 meses atrás' },
  { id: 'all', label: 'Todo o período', comparisonHint: 'histórico completo' },
  { id: 'custom', label: 'Personalizado', comparisonHint: 'vs período anterior' },
];

const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export interface SalesDailyChartPoint {
  date: string;
  shortDate: string;
  fullDateLabel: string;
  weekdayShort: string;
  revenue: number;
  ordersCount: number;
  xSaladasCount: number;
}

export interface SalesViewSummary {
  preset: SalesExpensesPeriodPreset;
  periodLabel: string;
  comparisonHint: string;
  rangeStart: string;
  rangeEnd: string;
  filteredSales: SaleRecord[];
  totalRevenue: number;
  averageTicket: number;
  salesCount: number;
  totalXSaladas: number;
  revenueDeltaPct: number | null;
  averageTicketDeltaPct: number | null;
  salesCountDeltaPct: number | null;
  dailySeries: SalesDailyChartPoint[];
  paymentBreakdown: PaymentMethodStat[];
}

function computeComparisonDeltaPct(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) {
    return null;
  }
  return roundCurrency(((current - previous) / previous) * 100);
}

function buildDailySalesPoints(
  sales: SaleRecord[],
  rangeStart: string,
  rangeEnd: string,
): SalesDailyChartPoint[] {
  const byDay = new Map<
    string,
    { revenue: number; ordersCount: number; xSaladasCount: number }
  >();

  for (const s of sales) {
    const cur = byDay.get(s.date) ?? {
      revenue: 0,
      ordersCount: 0,
      xSaladasCount: 0,
    };
    cur.revenue = roundCurrency(cur.revenue + s.totalAmount);
    cur.ordersCount += 1;
    cur.xSaladasCount += getSaleXSaladaCount(s);
    byDay.set(s.date, cur);
  }

  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => {
        const dayIndex = parseLocalDate(date).getDay();
        const weekdayShort = WEEKDAY_SHORT_PT[dayIndex] ?? '';
        return {
          date,
          shortDate: formatShortDateBR(date),
          fullDateLabel: `${weekdayShort}, ${formatDateBR(date)}`,
          weekdayShort,
          revenue: stats.revenue,
          ordersCount: stats.ordersCount,
          xSaladasCount: stats.xSaladasCount,
        };
      });
  }

  const startMs = parseLocalDate(rangeStart).getTime();
  const endMs = parseLocalDate(rangeEnd).getTime();
  const spanDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

  // When range exceeds 90 days (e.g., long custom or full history), render active days + chronological endpoints cleanly
  if (spanDays > 90) {
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => {
        const dayIndex = parseLocalDate(date).getDay();
        const weekdayShort = WEEKDAY_SHORT_PT[dayIndex] ?? '';
        return {
          date,
          shortDate: formatShortDateBR(date),
          fullDateLabel: `${weekdayShort}, ${formatDateBR(date)}`,
          weekdayShort,
          revenue: stats.revenue,
          ordersCount: stats.ordersCount,
          xSaladasCount: stats.xSaladasCount,
        };
      });
  }

  const points: SalesDailyChartPoint[] = [];
  for (let i = 0; i < spanDays; i += 1) {
    const date = addDays(rangeStart, i);
    const stats = byDay.get(date) ?? {
      revenue: 0,
      ordersCount: 0,
      xSaladasCount: 0,
    };
    const dayIndex = parseLocalDate(date).getDay();
    const weekdayShort = WEEKDAY_SHORT_PT[dayIndex] ?? '';
    points.push({
      date,
      shortDate: formatShortDateBR(date),
      fullDateLabel: `${weekdayShort}, ${formatDateBR(date)}`,
      weekdayShort,
      revenue: stats.revenue,
      ordersCount: stats.ordersCount,
      xSaladasCount: stats.xSaladasCount,
    });
  }
  return points;
}

export function computeSalesViewSummary(
  sales: SaleRecord[],
  preset: SalesExpensesPeriodPreset,
  referenceDate: string = getLocalTodayDate(),
  customStart?: string,
  customEnd?: string,
): SalesViewSummary {
  const optionMeta =
    SALES_EXPENSES_PERIOD_OPTIONS.find((opt) => opt.id === preset) ??
    SALES_EXPENSES_PERIOD_OPTIONS[3];

  if (preset === 'all') {
    const sorted = [...sales].sort((a, b) =>
      b.date !== a.date
        ? b.date.localeCompare(a.date)
        : b.createdAtMs - a.createdAtMs,
    );
    const totalRevenue = roundCurrency(
      sorted.reduce((acc, s) => acc + s.totalAmount, 0),
    );
    const salesCount = sorted.length;
    const averageTicket =
      salesCount > 0 ? roundCurrency(totalRevenue / salesCount) : 0;
    const totalXSaladas = sorted.reduce(
      (acc, s) => acc + getSaleXSaladaCount(s),
      0,
    );
    const minDate = sorted.length > 0 ? sorted[sorted.length - 1].date : referenceDate;
    const maxDate = sorted.length > 0 ? sorted[0].date : referenceDate;

    return {
      preset,
      periodLabel: optionMeta.label,
      comparisonHint: optionMeta.comparisonHint,
      rangeStart: minDate,
      rangeEnd: maxDate,
      filteredSales: sorted,
      totalRevenue,
      averageTicket,
      salesCount,
      totalXSaladas,
      revenueDeltaPct: null,
      averageTicketDeltaPct: null,
      salesCountDeltaPct: null,
      dailySeries: buildDailySalesPoints(sorted, minDate, maxDate),
      paymentBreakdown: computePaymentMethodBreakdown(sorted),
    };
  }

  const reportSummary = computeReportSummary(
    sales,
    [],
    preset,
    referenceDate,
    customStart,
    customEnd,
  );

  const prevSales = sales.filter(
    (s) =>
      s.date >= reportSummary.range.prevStart &&
      s.date <= reportSummary.range.prevEnd,
  );
  const prevSalesCount = prevSales.length;
  const prevRevenue = reportSummary.comparison.previousRevenue;
  const prevAvgTicket =
    prevSalesCount > 0 ? roundCurrency(prevRevenue / prevSalesCount) : 0;

  return {
    preset,
    periodLabel:
      preset === 'custom' ? reportSummary.range.label : optionMeta.label,
    comparisonHint: optionMeta.comparisonHint,
    rangeStart: reportSummary.range.start,
    rangeEnd: reportSummary.range.end,
    filteredSales: reportSummary.filteredSales,
    totalRevenue: reportSummary.totalRevenue,
    averageTicket: reportSummary.averageTicket,
    salesCount: reportSummary.salesCount,
    totalXSaladas: reportSummary.totalXSaladas,
    revenueDeltaPct: computeComparisonDeltaPct(
      reportSummary.totalRevenue,
      prevRevenue,
    ),
    averageTicketDeltaPct: computeComparisonDeltaPct(
      reportSummary.averageTicket,
      prevAvgTicket,
    ),
    salesCountDeltaPct: computeComparisonDeltaPct(
      reportSummary.salesCount,
      prevSalesCount,
    ),
    dailySeries: buildDailySalesPoints(
      reportSummary.filteredSales,
      reportSummary.range.start,
      reportSummary.range.end,
    ),
    paymentBreakdown: reportSummary.paymentBreakdown,
  };
}

export interface ExpensesViewSummary {
  preset: SalesExpensesPeriodPreset;
  periodLabel: string;
  comparisonHint: string;
  rangeStart: string;
  rangeEnd: string;
  filteredExpenses: ExpenseRecord[];
  totalExpenses: number;
  previousTotalExpenses: number;
  expensesDeltaPct: number | null;
  monthlyAverage: number;
  activeMonthsCount: number;
  vsMonthlyAveragePct: number | null;
  categoriesUsedCount: number;
  totalAvailableCategoriesCount: number;
  categoryBreakdown: CategoryBreakdownItem[];
  latestExpenses: ExpenseRecord[];
}

export function computeExpensesViewSummary(
  expenses: ExpenseRecord[],
  preset: SalesExpensesPeriodPreset,
  referenceDate: string = getLocalTodayDate(),
  customStart?: string,
  customEnd?: string,
): ExpensesViewSummary {
  const optionMeta =
    SALES_EXPENSES_PERIOD_OPTIONS.find((opt) => opt.id === preset) ??
    SALES_EXPENSES_PERIOD_OPTIONS[3];

  const sortedAll = [...expenses].sort((a, b) =>
    b.date !== a.date
      ? b.date.localeCompare(a.date)
      : b.createdAtMs - a.createdAtMs,
  );

  // Calculate historical monthly average across distinct months with recorded expenses
  const byMonth = new Map<string, number>();
  let allTotal = 0;
  for (const exp of expenses) {
    const monthKey = exp.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(monthKey)) {
      byMonth.set(
        monthKey,
        roundCurrency((byMonth.get(monthKey) ?? 0) + exp.amount),
      );
      allTotal = roundCurrency(allTotal + exp.amount);
    }
  }
  const activeMonthsCount = byMonth.size;
  const monthlyAverage =
    activeMonthsCount > 0 ? roundCurrency(allTotal / activeMonthsCount) : 0;

  let rangeStart = sortedAll.length > 0 ? sortedAll[sortedAll.length - 1].date : referenceDate;
  let rangeEnd = sortedAll.length > 0 ? sortedAll[0].date : referenceDate;
  let periodLabel = optionMeta.label;
  let filteredExpenses = sortedAll;
  let previousTotalExpenses = 0;
  let expensesDeltaPct: number | null = null;

  if (preset !== 'all') {
    const range = getReportDateRange(
      preset,
      referenceDate,
      customStart,
      customEnd,
    );
    rangeStart = range.start;
    rangeEnd = range.end;
    periodLabel = preset === 'custom' ? range.label : optionMeta.label;

    filteredExpenses = sortedAll.filter(
      (e) => e.date >= range.start && e.date <= range.end,
    );
    const prevList = expenses.filter(
      (e) => e.date >= range.prevStart && e.date <= range.prevEnd,
    );
    previousTotalExpenses = roundCurrency(
      prevList.reduce((acc, e) => acc + e.amount, 0),
    );
  }

  const totalExpenses = roundCurrency(
    filteredExpenses.reduce((acc, e) => acc + e.amount, 0),
  );

  if (preset !== 'all') {
    expensesDeltaPct = computeComparisonDeltaPct(
      totalExpenses,
      previousTotalExpenses,
    );
  }

  const categoryBreakdown = computeExpenseByCategory(filteredExpenses);
  const vsMonthlyAveragePct =
    activeMonthsCount >= 2 && monthlyAverage > 0 && totalExpenses > 0
      ? computeComparisonDeltaPct(totalExpenses, monthlyAverage)
      : null;

  return {
    preset,
    periodLabel,
    comparisonHint: optionMeta.comparisonHint,
    rangeStart,
    rangeEnd,
    filteredExpenses,
    totalExpenses,
    previousTotalExpenses,
    expensesDeltaPct,
    monthlyAverage,
    activeMonthsCount,
    vsMonthlyAveragePct,
    categoriesUsedCount: categoryBreakdown.length,
    totalAvailableCategoriesCount: 10,
    categoryBreakdown,
    latestExpenses: filteredExpenses.slice(0, 4),
  };
}

export function formatDeltaPercentSignedBR(deltaPct: number): string {
  const absFormatted = Math.abs(deltaPct).toFixed(1).replace('.', ',');
  return `${deltaPct >= 0 ? '+' : '-'}${absFormatted}%`;
}

export function paginateList<T>(
  items: T[],
  page: number,
  pageSize = 15,
): {
  items: T[];
  safePage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
} {
  const safeSize = Math.max(1, Math.trunc(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), totalPages);
  const startIndex = (safePage - 1) * safeSize;
  const sliced = items.slice(startIndex, startIndex + safeSize);

  return {
    items: sliced,
    safePage,
    totalPages,
    totalItems,
    startIndex,
    endIndex: startIndex + sliced.length,
  };
}

export function getPaymentMethodColor(method: string): string {
  const normalized = normalizePaymentMethod(method);
  switch (normalized) {
    case 'Dinheiro':
      return '#3478E5';
    case 'Cartão de crédito':
      return '#F5B900';
    case 'Cartão de débito':
      return '#F39A25';
    case 'Pix':
      return '#16A36A';
    case 'Outros':
      return '#8B5CF6';
  }
}

const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Ingredientes: '#3478E5',
  'Carnes e hambúrgueres': '#E35D62',
  Pães: '#F5B900',
  'Queijos e frios': '#F39A25',
  Bebidas: '#06B6D4',
  Embalagens: '#8B5CF6',
  Gás: '#EC4899',
  Energia: '#16A36A',
  Transporte: '#6366F1',
  Outros: '#64748B',
};

export function getExpenseCategoryColor(category: ExpenseCategory): string {
  return EXPENSE_CATEGORY_COLORS[category] ?? '#64748B';
}

function escapeCsvCell(raw: string | number): string {
  const text = String(raw ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

export function buildSalesCsvContent(sales: SaleRecord[]): string {
  const header = [
    'Data',
    'Itens',
    'Quantidade X-Salada',
    'Forma de Pagamento',
    'Origem',
    'Valor Total (R$)',
    'Observacao',
  ].join(';');

  const rows = sales.map((s) =>
    [
      escapeCsvCell(formatDateBR(s.date)),
      escapeCsvCell(formatSaleItemsSummary(s)),
      escapeCsvCell(getSaleXSaladaCount(s)),
      escapeCsvCell(normalizePaymentMethod(s.paymentMethod)),
      escapeCsvCell(getSaleOrigin(s) === 'online' ? 'Cardápio Online' : 'Manual'),
      escapeCsvCell(s.totalAmount.toFixed(2).replace('.', ',')),
      escapeCsvCell(s.note || ''),
    ].join(';'),
  );

  return `\uFEFF${[header, ...rows].join('\n')}`;
}

export function buildExpensesCsvContent(expenses: ExpenseRecord[]): string {
  const header = [
    'Data',
    'Descricao',
    'Categoria',
    'Pagamento',
    'Valor (R$)',
    'Observacao',
  ].join(';');

  const rows = expenses.map((e) =>
    [
      escapeCsvCell(formatDateBR(e.date)),
      escapeCsvCell(e.description),
      escapeCsvCell(e.category),
      escapeCsvCell(e.paymentMethod),
      escapeCsvCell(e.amount.toFixed(2).replace('.', ',')),
      escapeCsvCell(e.note || ''),
    ].join(';'),
  );

  return `\uFEFF${[header, ...rows].join('\n')}`;
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
