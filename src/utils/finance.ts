import {
  type DashboardGranularity,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecord,
  normalizePaymentMethod,
  type PaymentMethod,
  type ReportPeriodPreset,
  type SaleInput,
  type SaleLineItemSnapshot,
  type SaleOrderDraftItem,
  type SaleRecord,
} from '../types/finance';

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const DEFAULT_SHOP_TIMEZONE = 'America/Manaus';

export function getLocalTodayDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateInTimezone(
  date: Date = new Date(),
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback para timezone local se Intl nao reconhecer
  }
  return getLocalTodayDate(date);
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDays(dateStr: string, deltaDays: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + deltaDays);
  return getLocalTodayDate(date);
}

export function diffDaysInclusive(startStr: string, endStr: string): number {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / 86400000) + 1);
}

export function getMonthBounds(dateStr: string): { start: string; end: string } {
  const [year, month] = dateStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getPreviousMonthBounds(dateStr: string): { start: string; end: string } {
  const [year, month] = dateStr.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1, 12, 0, 0, 0);
  return getMonthBounds(getLocalTodayDate(prevDate));
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateBR(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatShortDateBR(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

export function formatMonthLabelBR(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const names = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];
  return `${names[(month - 1) % 12] ?? 'Mês'}/${String(year).slice(-2)}`;
}

export function calculateSaleTotal(quantity: number, unitPrice: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  if (quantity <= 0 || unitPrice <= 0) return 0;
  return roundCurrency(quantity * unitPrice);
}

export function getSaleXSaladaCount(sale: SaleRecord): number {
  if (typeof sale.xSaladaCount === 'number' && Number.isFinite(sale.xSaladaCount)) {
    return sale.xSaladaCount;
  }
  return sale.quantity;
}

export function getSaleCombosCount(sale: SaleRecord): number {
  if (typeof sale.combosCount === 'number' && Number.isFinite(sale.combosCount)) {
    return sale.combosCount;
  }
  return 0;
}

export function formatSaleItemsSummary(sale: SaleRecord): string {
  if (sale.items && sale.items.length > 0) {
    return sale.items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
  }
  return `${sale.quantity} X-Salada${sale.quantity > 1 ? 's' : ''}`;
}

export function getSaleOrigin(sale: Pick<SaleRecord, 'saleOrigin'>): 'manual' | 'online' {
  return sale.saleOrigin === 'online' ? 'online' : 'manual';
}

export interface ReportChannelBreakdown {
  manualRevenue: number;
  manualCount: number;
  manualXSaladas: number;
  onlineRevenue: number;
  onlineCount: number;
  onlineXSaladas: number;
  onlineDeliveryFees: number;
}

export function computeReportChannelBreakdown(
  sales: SaleRecord[],
): ReportChannelBreakdown {
  let manualRevenue = 0;
  let manualCount = 0;
  let manualXSaladas = 0;
  let onlineRevenue = 0;
  let onlineCount = 0;
  let onlineXSaladas = 0;
  let onlineDeliveryFees = 0;

  for (const s of sales) {
    const xCount = getSaleXSaladaCount(s);
    if (getSaleOrigin(s) === 'online') {
      onlineRevenue = roundCurrency(onlineRevenue + s.totalAmount);
      onlineCount += 1;
      onlineXSaladas += xCount;
      onlineDeliveryFees = roundCurrency(
        onlineDeliveryFees + Math.max(0, Number(s.deliveryFee) || 0),
      );
    } else {
      manualRevenue = roundCurrency(manualRevenue + s.totalAmount);
      manualCount += 1;
      manualXSaladas += xCount;
    }
  }

  return {
    manualRevenue,
    manualCount,
    manualXSaladas,
    onlineRevenue,
    onlineCount,
    onlineXSaladas,
    onlineDeliveryFees,
  };
}

export interface SaleCustomerDetails {
  customerId?: string | null;
  customerName?: string;
  customerAddress?: string;
  customerNumber?: string;
  customerNeighborhood?: string;
  customerComplement?: string;
}

export function sanitizeSaleCustomerDetails(
  details?: SaleCustomerDetails,
): Required<Omit<SaleCustomerDetails, 'customerId'>> & { customerId: string | null } {
  const customerId =
    typeof details?.customerId === 'string' && details.customerId.trim().length > 0
      ? details.customerId.trim()
      : null;
  return {
    customerId,
    customerName: (details?.customerName || '').trim().slice(0, 120),
    customerAddress: (details?.customerAddress || '').trim().slice(0, 200),
    customerNumber: (details?.customerNumber || '').trim().slice(0, 40),
    customerNeighborhood: (details?.customerNeighborhood || '').trim().slice(0, 120),
    customerComplement: (details?.customerComplement || '').trim().slice(0, 160),
  };
}

export function hasSaleCustomerDetails(
  sale: Pick<
    SaleRecord,
    | 'customerName'
    | 'customerAddress'
    | 'customerNumber'
    | 'customerNeighborhood'
    | 'customerComplement'
  >,
): boolean {
  return Boolean(
    (sale.customerName || '').trim() ||
      (sale.customerAddress || '').trim() ||
      (sale.customerNumber || '').trim() ||
      (sale.customerNeighborhood || '').trim() ||
      (sale.customerComplement || '').trim(),
  );
}

export function formatSaleCustomerAddressLine(
  sale: Pick<
    SaleRecord,
    'customerAddress' | 'customerNumber' | 'customerNeighborhood' | 'customerComplement'
  >,
): string {
  const street = (sale.customerAddress || '').trim();
  const number = (sale.customerNumber || '').trim();
  const neighborhood = (sale.customerNeighborhood || '').trim();
  const complement = (sale.customerComplement || '').trim();

  const streetPart = [street, number ? `nº ${number}` : '']
    .filter(Boolean)
    .join(', ');
  const parts = [streetPart, neighborhood, complement].filter(Boolean);
  return parts.join(' · ');
}

export function buildSaleInputFromOrder(
  draftItems: SaleOrderDraftItem[],
  date: string,
  paymentMethod: PaymentMethod,
  note: string,
  customerDetails?: SaleCustomerDetails,
): SaleInput {
  const cleanItems = draftItems.filter((item) => item.quantity > 0);
  if (cleanItems.length === 0) {
    throw new Error('Adicione pelo menos um combo ou produto na venda.');
  }

  let totalAmount = 0;
  let xSaladaCount = 0;
  let combosCount = 0;
  let totalItemUnits = 0;
  let hasCombo = false;
  let hasProduct = false;

  const items: SaleLineItemSnapshot[] = cleanItems.map((item) => {
    const qty = Math.trunc(item.quantity);
    const unitPrice = roundCurrency(item.unitPrice);
    const lineTotal = calculateSaleTotal(qty, unitPrice);
    const components = item.components.map((c) => {
      const qtyPerUnit = Math.max(1, Math.trunc(c.quantityPerUnit));
      const totalQuantity = qty * qtyPerUnit;
      if (c.countsAsXSalada) {
        xSaladaCount += totalQuantity;
      }
      return {
        productId: c.productId,
        productName: c.productName,
        quantityPerUnit: qtyPerUnit,
        totalQuantity,
        countsAsXSalada: c.countsAsXSalada,
      };
    });

    const xSaladasPerUnit = components.reduce(
      (acc, c) => (c.countsAsXSalada ? acc + c.quantityPerUnit : acc),
      0,
    );

    totalAmount = roundCurrency(totalAmount + lineTotal);
    totalItemUnits += qty;
    if (item.kind === 'combo') {
      hasCombo = true;
      combosCount += qty;
    } else {
      hasProduct = true;
    }

    return {
      kind: item.kind,
      refId: item.refId,
      name: item.name,
      quantity: qty,
      unitPrice,
      lineTotal,
      estimatedUnitCost: roundCurrency(Math.max(0, item.estimatedUnitCost || 0)),
      xSaladasPerUnit,
      components,
    };
  });

  if (totalAmount <= 0) {
    throw new Error('O valor total da venda deve ser maior que zero.');
  }

  const quantity = Math.max(1, xSaladaCount > 0 ? xSaladaCount : totalItemUnits);
  const unitPrice = roundCurrency(totalAmount / quantity);
  const saleMode = hasCombo && hasProduct ? 'mixed' : hasCombo ? 'combo' : 'individual';

  const normalizedCustomer = sanitizeSaleCustomerDetails(customerDetails);

  return {
    date,
    quantity,
    unitPrice,
    paymentMethod,
    note,
    saleMode,
    xSaladaCount,
    combosCount,
    items,
    customerId: normalizedCustomer.customerId,
    customerName: normalizedCustomer.customerName,
    customerAddress: normalizedCustomer.customerAddress,
    customerNumber: normalizedCustomer.customerNumber,
    customerNeighborhood: normalizedCustomer.customerNeighborhood,
    customerComplement: normalizedCustomer.customerComplement,
  };
}

export interface DashboardMetrics {
  todayRevenue: number;
  todayQty: number;
  todayCombos: number;
  todayExpenses: number;
  todayNetProfit: number;
  todaySalesCount: number;
  todayAverageTicket: number;
  monthRevenue: number;
  monthQty: number;
  monthCombos: number;
  monthExpenses: number;
  monthNetProfit: number;
  monthSalesCount: number;
  monthAverageTicket: number;
}

export function computeDashboardMetrics(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  referenceDate: string,
): DashboardMetrics {
  const monthBounds = getMonthBounds(referenceDate);

  let todayRevenue = 0;
  let todayQty = 0;
  let todayCombos = 0;
  let todaySalesCount = 0;
  let monthRevenue = 0;
  let monthQty = 0;
  let monthCombos = 0;
  let monthSalesCount = 0;

  for (const s of sales) {
    const xCount = getSaleXSaladaCount(s);
    const cCount = getSaleCombosCount(s);
    if (s.date === referenceDate) {
      todayRevenue += s.totalAmount;
      todayQty += xCount;
      todayCombos += cCount;
      todaySalesCount += 1;
    }
    if (s.date >= monthBounds.start && s.date <= monthBounds.end) {
      monthRevenue += s.totalAmount;
      monthQty += xCount;
      monthCombos += cCount;
      monthSalesCount += 1;
    }
  }

  let todayExpenses = 0;
  let monthExpenses = 0;

  for (const e of expenses) {
    if (e.date === referenceDate) {
      todayExpenses += e.amount;
    }
    if (e.date >= monthBounds.start && e.date <= monthBounds.end) {
      monthExpenses += e.amount;
    }
  }

  todayRevenue = roundCurrency(todayRevenue);
  todayExpenses = roundCurrency(todayExpenses);
  monthRevenue = roundCurrency(monthRevenue);
  monthExpenses = roundCurrency(monthExpenses);

  return {
    todayRevenue,
    todayQty,
    todayCombos,
    todayExpenses,
    todayNetProfit: roundCurrency(todayRevenue - todayExpenses),
    todaySalesCount,
    todayAverageTicket:
      todaySalesCount > 0 ? roundCurrency(todayRevenue / todaySalesCount) : 0,
    monthRevenue,
    monthQty,
    monthCombos,
    monthExpenses,
    monthNetProfit: roundCurrency(monthRevenue - monthExpenses),
    monthSalesCount,
    monthAverageTicket:
      monthSalesCount > 0 ? roundCurrency(monthRevenue / monthSalesCount) : 0,
  };
}

export interface FinancialControlSummary {
  totalRevenue: number;
  totalExpenses: number;
  netResult: number;
  cashReceived: number;
  pixReceived: number;
  debitReceived: number;
  creditReceived: number;
  cardReceived: number;
  otherReceived: number;
  salesCount: number;
  expensesCount: number;
}

export function computeFinancialControl(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
): FinancialControlSummary {
  let totalRevenue = 0;
  let cashReceived = 0;
  let pixReceived = 0;
  let debitReceived = 0;
  let creditReceived = 0;
  let otherReceived = 0;

  for (const s of sales) {
    totalRevenue += s.totalAmount;
    switch (normalizePaymentMethod(s.paymentMethod)) {
      case 'Dinheiro':
        cashReceived += s.totalAmount;
        break;
      case 'Pix':
        pixReceived += s.totalAmount;
        break;
      case 'Cartão de débito':
        debitReceived += s.totalAmount;
        break;
      case 'Cartão de crédito':
        creditReceived += s.totalAmount;
        break;
      case 'Outros':
        otherReceived += s.totalAmount;
        break;
    }
  }

  let totalExpenses = 0;
  for (const e of expenses) {
    totalExpenses += e.amount;
  }

  totalRevenue = roundCurrency(totalRevenue);
  totalExpenses = roundCurrency(totalExpenses);
  cashReceived = roundCurrency(cashReceived);
  pixReceived = roundCurrency(pixReceived);
  debitReceived = roundCurrency(debitReceived);
  creditReceived = roundCurrency(creditReceived);
  otherReceived = roundCurrency(otherReceived);

  return {
    totalRevenue,
    totalExpenses,
    netResult: roundCurrency(totalRevenue - totalExpenses),
    cashReceived,
    pixReceived,
    debitReceived,
    creditReceived,
    cardReceived: roundCurrency(debitReceived + creditReceived),
    otherReceived,
    salesCount: sales.length,
    expensesCount: expenses.length,
  };
}

export interface ChartPoint {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
  qty: number;
}

export function buildLast7DaysSeries(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  referenceDate: string,
): ChartPoint[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push(addDays(referenceDate, -i));
  }

  const map = new Map<string, ChartPoint>();
  for (const d of days) {
    map.set(d, {
      key: d,
      label: formatShortDateBR(d),
      revenue: 0,
      expenses: 0,
      profit: 0,
      qty: 0,
    });
  }

  for (const s of sales) {
    const entry = map.get(s.date);
    if (entry) {
      entry.revenue = roundCurrency(entry.revenue + s.totalAmount);
      entry.qty += getSaleXSaladaCount(s);
    }
  }

  for (const e of expenses) {
    const entry = map.get(e.date);
    if (entry) {
      entry.expenses = roundCurrency(entry.expenses + e.amount);
    }
  }

  for (const entry of map.values()) {
    entry.profit = roundCurrency(entry.revenue - entry.expenses);
  }

  return Array.from(map.values());
}

export function buildMonthlyProfitEvolution(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  referenceDate: string,
  monthsCount = 6,
): ChartPoint[] {
  const [refYear, refMonth] = referenceDate.split('-').map(Number);
  const monthKeys: string[] = [];

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const dt = new Date(refYear, refMonth - 1 - i, 1, 12, 0, 0, 0);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push(key);
  }

  const map = new Map<string, ChartPoint>();
  for (const k of monthKeys) {
    map.set(k, {
      key: k,
      label: formatMonthLabelBR(k),
      revenue: 0,
      expenses: 0,
      profit: 0,
      qty: 0,
    });
  }

  for (const s of sales) {
    const monthKey = s.date.slice(0, 7);
    const entry = map.get(monthKey);
    if (entry) {
      entry.revenue = roundCurrency(entry.revenue + s.totalAmount);
      entry.qty += getSaleXSaladaCount(s);
    }
  }

  for (const e of expenses) {
    const monthKey = e.date.slice(0, 7);
    const entry = map.get(monthKey);
    if (entry) {
      entry.expenses = roundCurrency(entry.expenses + e.amount);
    }
  }

  for (const entry of map.values()) {
    entry.profit = roundCurrency(entry.revenue - entry.expenses);
  }

  return Array.from(map.values());
}

export function buildPeriodChartSeries(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  granularity: DashboardGranularity,
  referenceDate: string,
): ChartPoint[] {
  if (granularity === 'daily') {
    const days: string[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      days.push(addDays(referenceDate, -i));
    }
    const map = new Map<string, ChartPoint>();
    for (const d of days) {
      map.set(d, {
        key: d,
        label: formatShortDateBR(d),
        revenue: 0,
        expenses: 0,
        profit: 0,
        qty: 0,
      });
    }
    for (const s of sales) {
      const entry = map.get(s.date);
      if (entry) {
        entry.revenue = roundCurrency(entry.revenue + s.totalAmount);
        entry.qty += getSaleXSaladaCount(s);
      }
    }
    for (const e of expenses) {
      const entry = map.get(e.date);
      if (entry) {
        entry.expenses = roundCurrency(entry.expenses + e.amount);
      }
    }
    for (const entry of map.values()) {
      entry.profit = roundCurrency(entry.revenue - entry.expenses);
    }
    return Array.from(map.values());
  }

  if (granularity === 'weekly') {
    const weeksCount = 8;
    const refParsed = parseLocalDate(referenceDate);
    const dayOfWeek = refParsed.getDay(); // 0=Sun..6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currentWeekStart = addDays(referenceDate, mondayOffset);

    const weeks: Array<{ start: string; end: string; label: string }> = [];
    for (let i = weeksCount - 1; i >= 0; i -= 1) {
      const start = addDays(currentWeekStart, -i * 7);
      const end = addDays(start, 6);
      weeks.push({
        start,
        end,
        label: formatShortDateBR(start),
      });
    }

    return weeks.map((w) => {
      let revenue = 0;
      let exp = 0;
      let qty = 0;
      for (const s of sales) {
        if (s.date >= w.start && s.date <= w.end) {
          revenue += s.totalAmount;
          qty += getSaleXSaladaCount(s);
        }
      }
      for (const e of expenses) {
        if (e.date >= w.start && e.date <= w.end) {
          exp += e.amount;
        }
      }
      revenue = roundCurrency(revenue);
      exp = roundCurrency(exp);
      return {
        key: w.start,
        label: w.label,
        revenue,
        expenses: exp,
        profit: roundCurrency(revenue - exp),
        qty,
      };
    });
  }

  return buildMonthlyProfitEvolution(sales, expenses, referenceDate, 6);
}

export interface CategoryBreakdownItem {
  category: ExpenseCategory;
  amount: number;
  count: number;
  sharePercent: number;
}

export function computeExpenseByCategory(
  expenses: ExpenseRecord[],
): CategoryBreakdownItem[] {
  const totals = new Map<ExpenseCategory, { amount: number; count: number }>();
  for (const cat of EXPENSE_CATEGORIES) {
    totals.set(cat, { amount: 0, count: 0 });
  }

  let grandTotal = 0;
  for (const e of expenses) {
    const item = totals.get(e.category) ?? { amount: 0, count: 0 };
    item.amount = roundCurrency(item.amount + e.amount);
    item.count += 1;
    totals.set(e.category, item);
    grandTotal += e.amount;
  }

  const result: CategoryBreakdownItem[] = [];
  for (const [category, data] of totals.entries()) {
    if (data.amount > 0) {
      result.push({
        category,
        amount: data.amount,
        count: data.count,
        sharePercent:
          grandTotal > 0 ? roundCurrency((data.amount / grandTotal) * 100) : 0,
      });
    }
  }

  result.sort((a, b) => b.amount - a.amount);
  return result;
}

export interface ReportDateRange {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
}

export function getReportDateRange(
  preset: ReportPeriodPreset,
  referenceDate: string,
  customStart?: string,
  customEnd?: string,
): ReportDateRange {
  switch (preset) {
    case 'today': {
      const prev = addDays(referenceDate, -1);
      return {
        start: referenceDate,
        end: referenceDate,
        prevStart: prev,
        prevEnd: prev,
        label: 'Hoje',
      };
    }
    case 'yesterday': {
      const yest = addDays(referenceDate, -1);
      const prev = addDays(referenceDate, -2);
      return {
        start: yest,
        end: yest,
        prevStart: prev,
        prevEnd: prev,
        label: 'Ontem',
      };
    }
    case 'last7': {
      const start = addDays(referenceDate, -6);
      const prevEnd = addDays(start, -1);
      const prevStart = addDays(prevEnd, -6);
      return {
        start,
        end: referenceDate,
        prevStart,
        prevEnd,
        label: 'Últimos 7 dias',
      };
    }
    case 'last30': {
      const start = addDays(referenceDate, -29);
      const prevEnd = addDays(start, -1);
      const prevStart = addDays(prevEnd, -29);
      return {
        start,
        end: referenceDate,
        prevStart,
        prevEnd,
        label: 'Últimos 30 dias',
      };
    }
    case 'thisMonth': {
      const bounds = getMonthBounds(referenceDate);
      const prevBounds = getPreviousMonthBounds(referenceDate);
      return {
        start: bounds.start,
        end: bounds.end,
        prevStart: prevBounds.start,
        prevEnd: prevBounds.end,
        label: 'Este mês',
      };
    }
    case 'lastMonth': {
      const bounds = getPreviousMonthBounds(referenceDate);
      const prevPrevDate = addDays(bounds.start, -1);
      const prevBounds = getMonthBounds(prevPrevDate);
      return {
        start: bounds.start,
        end: bounds.end,
        prevStart: prevBounds.start,
        prevEnd: prevBounds.end,
        label: 'Mês anterior',
      };
    }
    case 'custom': {
      const rawStart = customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart)
        ? customStart
        : referenceDate;
      const rawEnd = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)
        ? customEnd
        : referenceDate;
      const start = rawStart <= rawEnd ? rawStart : rawEnd;
      const end = rawStart <= rawEnd ? rawEnd : rawStart;
      const span = diffDaysInclusive(start, end);
      const prevEnd = addDays(start, -1);
      const prevStart = addDays(prevEnd, -(span - 1));
      return {
        start,
        end,
        prevStart,
        prevEnd,
        label: `${formatDateBR(start)} a ${formatDateBR(end)}`,
      };
    }
  }
}

export interface BestDaySummary {
  date: string;
  revenue: number;
  qty: number;
}

export interface PeriodComparison {
  previousRevenue: number;
  previousExpenses: number;
  previousProfit: number;
  previousQty: number;
  revenueDeltaPct: number | null;
  expensesDeltaPct: number | null;
  profitDeltaPct: number | null;
  qtyDeltaPct: number | null;
}

export interface TopComboStat {
  comboId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  estimatedCost: number;
}

export interface TopProductStat {
  productId: string;
  name: string;
  quantitySold: number;
  directRevenue: number;
}

export interface PaymentMethodStat {
  paymentMethod: string;
  ordersCount: number;
  amount: number;
  sharePercent: number;
}

export function computeTopCombos(sales: SaleRecord[]): TopComboStat[] {
  const map = new Map<string, TopComboStat>();
  for (const s of sales) {
    if (!s.items || s.items.length === 0) continue;
    for (const item of s.items) {
      if (item.kind !== 'combo') continue;
      const key = item.refId || item.name;
      const cur = map.get(key) ?? {
        comboId: key,
        name: item.name,
        quantitySold: 0,
        revenue: 0,
        estimatedCost: 0,
      };
      cur.quantitySold += item.quantity;
      cur.revenue = roundCurrency(cur.revenue + item.lineTotal);
      cur.estimatedCost = roundCurrency(
        cur.estimatedCost + (item.estimatedUnitCost || 0) * item.quantity,
      );
      map.set(key, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.quantitySold !== a.quantitySold
      ? b.quantitySold - a.quantitySold
      : b.revenue - a.revenue,
  );
}

export function computeTopProducts(sales: SaleRecord[]): TopProductStat[] {
  const map = new Map<string, TopProductStat>();
  for (const s of sales) {
    if (!s.items || s.items.length === 0) {
      const key = 'legacy-xsalada';
      const cur = map.get(key) ?? {
        productId: key,
        name: 'X-Salada',
        quantitySold: 0,
        directRevenue: 0,
      };
      cur.quantitySold += s.quantity;
      cur.directRevenue = roundCurrency(cur.directRevenue + s.totalAmount);
      map.set(key, cur);
      continue;
    }

    for (const item of s.items) {
      if (item.components && item.components.length > 0) {
        for (const comp of item.components) {
          const key = comp.countsAsXSalada
            ? 'xsalada-group'
            : comp.productId || comp.productName.toLowerCase();
          const displayName = comp.countsAsXSalada
            ? comp.productName || 'X-Salada'
            : comp.productName;
          const cur = map.get(key) ?? {
            productId: key,
            name: displayName,
            quantitySold: 0,
            directRevenue: 0,
          };
          cur.quantitySold += comp.totalQuantity;
          if (item.kind === 'product' && item.components.length === 1) {
            cur.directRevenue = roundCurrency(cur.directRevenue + item.lineTotal);
          }
          map.set(key, cur);
        }
      } else {
        const key = item.refId || item.name;
        const cur = map.get(key) ?? {
          productId: key,
          name: item.name,
          quantitySold: 0,
          directRevenue: 0,
        };
        cur.quantitySold += item.quantity;
        if (item.kind === 'product') {
          cur.directRevenue = roundCurrency(cur.directRevenue + item.lineTotal);
        }
        map.set(key, cur);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.quantitySold !== a.quantitySold
      ? b.quantitySold - a.quantitySold
      : b.directRevenue - a.directRevenue,
  );
}

export function computePaymentMethodBreakdown(
  sales: SaleRecord[],
): PaymentMethodStat[] {
  const map = new Map<string, { ordersCount: number; amount: number }>();
  let totalAmount = 0;

  for (const s of sales) {
    const method = normalizePaymentMethod(s.paymentMethod);
    const cur = map.get(method) ?? { ordersCount: 0, amount: 0 };
    cur.ordersCount += 1;
    cur.amount = roundCurrency(cur.amount + s.totalAmount);
    map.set(method, cur);
    totalAmount = roundCurrency(totalAmount + s.totalAmount);
  }

  return Array.from(map.entries())
    .map(([paymentMethod, stats]) => ({
      paymentMethod,
      ordersCount: stats.ordersCount,
      amount: stats.amount,
      sharePercent:
        totalAmount > 0 ? roundCurrency((stats.amount / totalAmount) * 100) : 0,
    }))
    .sort((a, b) =>
      b.amount !== a.amount
        ? b.amount - a.amount
        : b.ordersCount - a.ordersCount,
    );
}

export interface ReportSummary {
  range: ReportDateRange;
  filteredSales: SaleRecord[];
  filteredExpenses: ExpenseRecord[];
  totalXSaladas: number;
  totalCombos: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  averageTicket: number;
  salesCount: number;
  bestDay: BestDaySummary | null;
  financialControl: FinancialControlSummary;
  expenseCategories: CategoryBreakdownItem[];
  topCombos: TopComboStat[];
  topProducts: TopProductStat[];
  paymentBreakdown: PaymentMethodStat[];
  channelBreakdown: ReportChannelBreakdown;
  comparison: PeriodComparison;
}

function computeDeltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return roundCurrency(((current - previous) / Math.abs(previous)) * 100);
}

export function computeReportSummary(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  preset: ReportPeriodPreset,
  referenceDate: string,
  customStart?: string,
  customEnd?: string,
): ReportSummary {
  const range = getReportDateRange(preset, referenceDate, customStart, customEnd);

  const filteredSales = sales
    .filter((s) => s.date >= range.start && s.date <= range.end)
    .sort((a, b) => (b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAtMs - a.createdAtMs));

  const filteredExpenses = expenses
    .filter((e) => e.date >= range.start && e.date <= range.end)
    .sort((a, b) => (b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAtMs - a.createdAtMs));

  const financialControl = computeFinancialControl(filteredSales, filteredExpenses);
  const totalXSaladas = filteredSales.reduce(
    (acc, s) => acc + getSaleXSaladaCount(s),
    0,
  );
  const totalCombos = filteredSales.reduce(
    (acc, s) => acc + getSaleCombosCount(s),
    0,
  );
  const averageTicket =
    filteredSales.length > 0
      ? roundCurrency(financialControl.totalRevenue / filteredSales.length)
      : 0;

  // Best sales day in range
  const byDay = new Map<string, { revenue: number; qty: number }>();
  for (const s of filteredSales) {
    const cur = byDay.get(s.date) ?? { revenue: 0, qty: 0 };
    cur.revenue = roundCurrency(cur.revenue + s.totalAmount);
    cur.qty += getSaleXSaladaCount(s);
    byDay.set(s.date, cur);
  }

  let bestDay: BestDaySummary | null = null;
  for (const [date, stats] of byDay.entries()) {
    if (
      !bestDay ||
      stats.revenue > bestDay.revenue ||
      (stats.revenue === bestDay.revenue && stats.qty > bestDay.qty)
    ) {
      bestDay = { date, revenue: stats.revenue, qty: stats.qty };
    }
  }

  // Previous period comparison
  const prevSales = sales.filter(
    (s) => s.date >= range.prevStart && s.date <= range.prevEnd,
  );
  const prevExpensesList = expenses.filter(
    (e) => e.date >= range.prevStart && e.date <= range.prevEnd,
  );
  const previousRevenue = roundCurrency(
    prevSales.reduce((acc, s) => acc + s.totalAmount, 0),
  );
  const previousExpenses = roundCurrency(
    prevExpensesList.reduce((acc, e) => acc + e.amount, 0),
  );
  const previousProfit = roundCurrency(previousRevenue - previousExpenses);
  const previousQty = prevSales.reduce((acc, s) => acc + getSaleXSaladaCount(s), 0);

  return {
    range,
    filteredSales,
    filteredExpenses,
    totalXSaladas,
    totalCombos,
    totalRevenue: financialControl.totalRevenue,
    totalExpenses: financialControl.totalExpenses,
    netProfit: financialControl.netResult,
    averageTicket,
    salesCount: filteredSales.length,
    bestDay,
    financialControl,
    expenseCategories: computeExpenseByCategory(filteredExpenses),
    topCombos: computeTopCombos(filteredSales),
    topProducts: computeTopProducts(filteredSales),
    paymentBreakdown: computePaymentMethodBreakdown(filteredSales),
    channelBreakdown: computeReportChannelBreakdown(filteredSales),
    comparison: {
      previousRevenue,
      previousExpenses,
      previousProfit,
      previousQty,
      revenueDeltaPct: computeDeltaPct(financialControl.totalRevenue, previousRevenue),
      expensesDeltaPct: computeDeltaPct(financialControl.totalExpenses, previousExpenses),
      profitDeltaPct: computeDeltaPct(financialControl.netResult, previousProfit),
      qtyDeltaPct: computeDeltaPct(totalXSaladas, previousQty),
    },
  };
}

export function isLikelyDuplicateSale(
  existingSales: SaleRecord[],
  candidate: SaleInput,
  nowMs: number = Date.now(),
  windowMs = 15000,
): boolean {
  const total =
    typeof candidate.totalAmount === 'number' &&
    Number.isFinite(candidate.totalAmount) &&
    candidate.totalAmount > 0
      ? roundCurrency(candidate.totalAmount)
      : candidate.items && candidate.items.length > 0
        ? roundCurrency(
            candidate.items.reduce((acc, item) => acc + item.lineTotal, 0) +
              Math.max(0, Number(candidate.deliveryFee || 0)),
          )
        : calculateSaleTotal(candidate.quantity, candidate.unitPrice);
  const candidateSig =
    candidate.items && candidate.items.length > 0
      ? candidate.items.map((i) => `${i.kind}:${i.refId}:${i.quantity}:${i.unitPrice}`).join('|')
      : `legacy:${candidate.quantity}:${candidate.unitPrice}`;
  const normalizedNote = candidate.note.trim().toLowerCase();
  const normalizedCustomerName = (candidate.customerName || '').trim().toLowerCase();
  return existingSales.some((s) => {
    if (Math.abs(nowMs - s.createdAtMs) > windowMs) return false;
    if (s.date !== candidate.date) return false;
    if (Math.abs(s.totalAmount - total) >= 0.01) return false;
    if (normalizePaymentMethod(s.paymentMethod) !== normalizePaymentMethod(candidate.paymentMethod)) {
      return false;
    }
    if (s.note.trim().toLowerCase() !== normalizedNote) return false;
    if ((s.customerName || '').trim().toLowerCase() !== normalizedCustomerName) {
      return false;
    }
    const existingSig =
      s.items && s.items.length > 0
        ? s.items.map((i) => `${i.kind}:${i.refId}:${i.quantity}:${i.unitPrice}`).join('|')
        : `legacy:${s.quantity}:${s.unitPrice}`;
    return existingSig === candidateSig;
  });
}

export function isLikelyDuplicateExpense(
  existingExpenses: ExpenseRecord[],
  candidate: ExpenseInput,
  nowMs: number = Date.now(),
  windowMs = 15000,
): boolean {
  const normalizedDesc = candidate.description.trim().toLowerCase();
  return existingExpenses.some(
    (e) =>
      Math.abs(nowMs - e.createdAtMs) <= windowMs &&
      e.date === candidate.date &&
      e.category === candidate.category &&
      e.paymentMethod === candidate.paymentMethod &&
      Math.abs(e.amount - roundCurrency(candidate.amount)) < 0.01 &&
      e.description.trim().toLowerCase() === normalizedDesc,
  );
}

export type FinancialHealthStatus =
  | 'sem_dados'
  | 'saudavel'
  | 'atencao'
  | 'critico';

export interface FinancialHealthSummary {
  status: FinancialHealthStatus;
  statusLabel: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  marginPercent: number;
  expenseRatioPercent: number;
  goalPercent: number | null;
  summaryText: string;
}

export function computeFinancialHealth(
  revenue: number,
  expenses: number,
  goal: number,
): FinancialHealthSummary {
  const rev = roundCurrency(Math.max(0, revenue));
  const exp = roundCurrency(Math.max(0, expenses));
  const netProfit = roundCurrency(rev - exp);

  if (rev === 0 && exp === 0) {
    return {
      status: 'sem_dados',
      statusLabel: 'Sem movimentação',
      revenue: 0,
      expenses: 0,
      netProfit: 0,
      marginPercent: 0,
      expenseRatioPercent: 0,
      goalPercent: goal > 0 ? 0 : null,
      summaryText: 'Registre vendas ou despesas para acompanhar a margem e saúde financeira.',
    };
  }

  const marginPercent =
    rev > 0 ? roundCurrency((netProfit / rev) * 100) : -100;
  const expenseRatioPercent =
    rev > 0 ? roundCurrency((exp / rev) * 100) : 100;
  const goalPercent =
    goal > 0 ? Math.min(999, roundCurrency((rev / goal) * 100)) : null;

  const marginLabel = marginPercent.toFixed(1).replace('.', ',');
  const expenseRatioLabel = expenseRatioPercent.toFixed(1).replace('.', ',');

  let status: FinancialHealthStatus = 'saudavel';
  let statusLabel = 'Saudável';
  let summaryText = `Sobra líquida de ${formatCurrencyBRL(Math.max(0, netProfit))} (${marginLabel}% de margem).`;

  if (netProfit < 0) {
    status = 'critico';
    statusLabel = 'No prejuízo';
    summaryText = `Despesas superam o faturamento em ${formatCurrencyBRL(Math.abs(netProfit))}.`;
  } else if (marginPercent < 15) {
    status = 'critico';
    statusLabel = 'Margem baixa';
    summaryText = `Margem de ${marginLabel}%: custos consomem ${expenseRatioLabel}% do faturamento.`;
  } else if (marginPercent < 35) {
    status = 'atencao';
    statusLabel = 'Atenção aos custos';
    summaryText = `Despesas consomem ${expenseRatioLabel}% da receita; margem de ${marginLabel}%.`;
  }

  return {
    status,
    statusLabel,
    revenue: rev,
    expenses: exp,
    netProfit,
    marginPercent,
    expenseRatioPercent,
    goalPercent,
    summaryText,
  };
}

