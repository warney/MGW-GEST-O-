import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  buildLast7DaysSeries,
  buildMonthlyProfitEvolution,
  buildPeriodChartSeries,
  buildSaleInputFromOrder,
  calculateSaleTotal,
  computeDashboardMetrics,
  computeExpenseByCategory,
  computeFinancialControl,
  computeFinancialHealth,
  computePaymentMethodBreakdown,
  computeReportSummary,
  computeTopCombos,
  computeTopProducts,
  formatSaleItemsSummary,
  getReportDateRange,
  getSaleCombosCount,
  getSaleXSaladaCount,
  isLikelyDuplicateExpense,
  isLikelyDuplicateSale,
} from './finance';
import {
  isAuthorizedAdminEmail,
  resolveWorkspaceForEmail,
  type ExpenseRecord,
  type SaleRecord,
} from '../types/finance';

const sampleSales: SaleRecord[] = [
  {
    id: 's1',
    ownerId: 'owner1',
    date: '2026-11-13',
    quantity: 5,
    unitPrice: 22,
    totalAmount: 110,
    paymentMethod: 'Pix',
    note: 'Balcão',
    createdAtMs: 1000,
    updatedAtMs: 1000,
  },
  {
    id: 's2',
    ownerId: 'owner1',
    date: '2026-11-13',
    quantity: 3,
    unitPrice: 22,
    totalAmount: 66,
    paymentMethod: 'Dinheiro',
    note: '',
    createdAtMs: 2000,
    updatedAtMs: 2000,
  },
  {
    id: 's3',
    ownerId: 'owner1',
    date: '2026-11-12',
    quantity: 10,
    unitPrice: 22,
    totalAmount: 220,
    paymentMethod: 'Cartão de débito',
    note: '',
    createdAtMs: 3000,
    updatedAtMs: 3000,
  },
  {
    id: 's4',
    ownerId: 'owner1',
    date: '2026-11-05',
    quantity: 4,
    unitPrice: 22,
    totalAmount: 88,
    paymentMethod: 'Crédito',
    note: '',
    createdAtMs: 4000,
    updatedAtMs: 4000,
  },
  {
    id: 's5',
    ownerId: 'owner1',
    date: '2026-10-20',
    quantity: 8,
    unitPrice: 20,
    totalAmount: 160,
    paymentMethod: 'Pix',
    note: 'Mês anterior',
    createdAtMs: 5000,
    updatedAtMs: 5000,
  },
];

const sampleExpenses: ExpenseRecord[] = [
  {
    id: 'e1',
    ownerId: 'owner1',
    description: 'Carne moída',
    amount: 75,
    category: 'Carnes e hambúrgueres',
    date: '2026-11-13',
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: 1000,
    updatedAtMs: 1000,
  },
  {
    id: 'e2',
    ownerId: 'owner1',
    description: 'Pães de hambúrguer',
    amount: 45,
    category: 'Pães',
    date: '2026-11-12',
    paymentMethod: 'Dinheiro',
    note: '',
    createdAtMs: 2000,
    updatedAtMs: 2000,
  },
  {
    id: 'e3',
    ownerId: 'owner1',
    description: 'Gás P13',
    amount: 110,
    category: 'Gás',
    date: '2026-10-15',
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: 3000,
    updatedAtMs: 3000,
  },
];

test('calculateSaleTotal multiplies cleanly and rejects non-positive inputs', () => {
  assert.equal(calculateSaleTotal(3, 22.5), 67.5);
  assert.equal(calculateSaleTotal(0, 22), 0);
  assert.equal(calculateSaleTotal(2, -10), 0);
});

test('computeDashboardMetrics calculates today and current month accurately without wiping prior month', () => {
  const metrics = computeDashboardMetrics(sampleSales, sampleExpenses, '2026-11-13');
  assert.equal(metrics.todayRevenue, 176);
  assert.equal(metrics.todayQty, 8);
  assert.equal(metrics.todayExpenses, 75);
  assert.equal(metrics.todayNetProfit, 101);

  assert.equal(metrics.monthRevenue, 484);
  assert.equal(metrics.monthQty, 22);
  assert.equal(metrics.monthExpenses, 120);
  assert.equal(metrics.monthNetProfit, 364);
});

test('computeFinancialControl separates Dinheiro, Pix, and Cartão (Débito + Crédito) and calculates net result', () => {
  const ctrl = computeFinancialControl(sampleSales, sampleExpenses);
  assert.equal(ctrl.totalRevenue, 644);
  assert.equal(ctrl.totalExpenses, 230);
  assert.equal(ctrl.netResult, 414);
  assert.equal(ctrl.cashReceived, 66);
  assert.equal(ctrl.pixReceived, 270);
  assert.equal(ctrl.debitReceived, 220);
  assert.equal(ctrl.creditReceived, 88);
  assert.equal(ctrl.cardReceived, 308);
});

test('computeReportSummary respects date presets, average ticket, best day, and previous period comparison', () => {
  const thisMonth = computeReportSummary(
    sampleSales,
    sampleExpenses,
    'thisMonth',
    '2026-11-13',
  );
  assert.equal(thisMonth.totalXSaladas, 22);
  assert.equal(thisMonth.totalRevenue, 484);
  assert.equal(thisMonth.totalExpenses, 120);
  assert.equal(thisMonth.netProfit, 364);
  assert.equal(thisMonth.averageTicket, 121); // 484 / 4 sales
  assert.deepEqual(thisMonth.bestDay, {
    date: '2026-11-12',
    revenue: 220,
    qty: 10,
  });
  assert.equal(thisMonth.comparison.previousRevenue, 160);
  assert.equal(thisMonth.comparison.previousExpenses, 110);
  assert.equal(thisMonth.comparison.previousProfit, 50);
  assert.equal(thisMonth.comparison.revenueDeltaPct, 202.5);

  const emptyCustom = computeReportSummary(
    sampleSales,
    sampleExpenses,
    'custom',
    '2026-11-13',
    '2026-01-01',
    '2026-01-05',
  );
  assert.equal(emptyCustom.totalRevenue, 0);
  assert.equal(emptyCustom.averageTicket, 0);
  assert.equal(emptyCustom.bestDay, null);
});

test('getReportDateRange builds exact bounds for yesterday, last7, lastMonth, and swapped custom dates', () => {
  const yest = getReportDateRange('yesterday', '2026-11-13');
  assert.equal(yest.start, '2026-11-12');
  assert.equal(yest.end, '2026-11-12');

  const last7 = getReportDateRange('last7', '2026-11-13');
  assert.equal(last7.start, '2026-11-07');
  assert.equal(last7.end, '2026-11-13');
  assert.equal(last7.prevStart, '2026-10-31');
  assert.equal(last7.prevEnd, '2026-11-06');

  const lastMonth = getReportDateRange('lastMonth', '2026-11-13');
  assert.equal(lastMonth.start, '2026-10-01');
  assert.equal(lastMonth.end, '2026-10-31');

  const customSwapped = getReportDateRange('custom', '2026-11-13', '2026-11-10', '2026-11-01');
  assert.equal(customSwapped.start, '2026-11-01');
  assert.equal(customSwapped.end, '2026-11-10');
});

test('chart builders and category breakdown aggregate accurately', () => {
  const last7 = buildLast7DaysSeries(sampleSales, sampleExpenses, '2026-11-13');
  assert.equal(last7.length, 7);
  assert.equal(last7[6].key, '2026-11-13');
  assert.equal(last7[6].revenue, 176);
  assert.equal(last7[6].expenses, 75);
  assert.equal(last7[6].profit, 101);
  assert.equal(last7[6].qty, 8);

  const monthly = buildMonthlyProfitEvolution(sampleSales, sampleExpenses, '2026-11-13', 2);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].key, '2026-10');
  assert.equal(monthly[0].profit, 50);
  assert.equal(monthly[1].key, '2026-11');
  assert.equal(monthly[1].profit, 364);

  const weekly = buildPeriodChartSeries(sampleSales, sampleExpenses, 'weekly', '2026-11-13');
  assert.equal(weekly.length, 8);

  const cats = computeExpenseByCategory(sampleExpenses);
  assert.equal(cats[0].category, 'Gás');
  assert.equal(cats[0].amount, 110);
});

test('duplicate submission guards detect rapid identical entries', () => {
  assert.equal(
    isLikelyDuplicateSale(
      sampleSales,
      {
        date: '2026-11-13',
        quantity: 5,
        unitPrice: 22,
        paymentMethod: 'Pix',
        note: 'balcão',
      },
      12000,
    ),
    true,
  );

  assert.equal(
    isLikelyDuplicateSale(
      sampleSales,
      {
        date: '2026-11-13',
        quantity: 5,
        unitPrice: 22,
        paymentMethod: 'Pix',
        note: 'balcão',
      },
      25000,
    ),
    false,
  );

  assert.equal(
    isLikelyDuplicateExpense(
      sampleExpenses,
      {
        description: '  Carne moída ',
        amount: 75,
        category: 'Carnes e hambúrgueres',
        date: '2026-11-13',
        paymentMethod: 'Pix',
        note: '',
      },
      5000,
    ),
    true,
  );
});

test('addDays handles month boundaries properly', () => {
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('isAuthorizedAdminEmail and resolveWorkspaceForEmail keep MGW admins together and isolate gf3163666@gmail.com', () => {
  assert.equal(isAuthorizedAdminEmail('warney.fernandes22@gmail.com'), true);
  assert.equal(isAuthorizedAdminEmail('FERNANDES38MK@GMAIL.COM'), true);
  assert.equal(isAuthorizedAdminEmail('  fernandes38mk@gmail.com '), true);
  assert.equal(isAuthorizedAdminEmail('gf3163666@gmail.com'), true);
  assert.equal(isAuthorizedAdminEmail('outro@gmail.com'), false);
  assert.equal(isAuthorizedAdminEmail(null), false);

  assert.equal(resolveWorkspaceForEmail('warney.fernandes22@gmail.com')?.id, 'mgw_lanches');
  assert.equal(resolveWorkspaceForEmail('fernandes38mk@gmail.com')?.id, 'mgw_lanches');
  assert.equal(resolveWorkspaceForEmail('GF3163666@GMAIL.COM')?.id, 'gf_lanches');
  assert.equal(resolveWorkspaceForEmail('gf3163666@gmail.com')?.isSeparateAccount, true);
  assert.equal(resolveWorkspaceForEmail('outro@gmail.com'), null);
});

test('computeFinancialHealth classifies empty, healthy, attention, and deficit periods accurately', () => {
  const empty = computeFinancialHealth(0, 0, 800);
  assert.equal(empty.status, 'sem_dados');
  assert.equal(empty.goalPercent, 0);

  const healthy = computeFinancialHealth(1000, 350, 800);
  assert.equal(healthy.status, 'saudavel');
  assert.equal(healthy.marginPercent, 65);
  assert.equal(healthy.expenseRatioPercent, 35);
  assert.equal(healthy.goalPercent, 125);

  const attention = computeFinancialHealth(1000, 750, 1000);
  assert.equal(attention.status, 'atencao');
  assert.equal(attention.marginPercent, 25);

  const loss = computeFinancialHealth(500, 620, 1000);
  assert.equal(loss.status, 'critico');
  assert.equal(loss.netProfit, -120);
});

test('buildSaleInputFromOrder calculates 2 Combo 1 + 1 Combo 4 + 3 X-Saladas = 9 X-Saladas and 3 combos in 1 order', () => {
  const orderInput = buildSaleInputFromOrder(
    [
      {
        kind: 'combo',
        refId: 'combo-1',
        name: 'Combo 1',
        quantity: 2,
        unitPrice: 25,
        estimatedUnitCost: 12,
        components: [
          { productId: 'p-x', productName: 'X-Salada', quantityPerUnit: 1, countsAsXSalada: true },
          { productId: 'p-r250', productName: 'Refri 250 ml', quantityPerUnit: 1, countsAsXSalada: false },
        ],
      },
      {
        kind: 'combo',
        refId: 'combo-4',
        name: 'Combo 4',
        quantity: 1,
        unitPrice: 68,
        estimatedUnitCost: 34,
        components: [
          { productId: 'p-x', productName: 'X-Salada', quantityPerUnit: 4, countsAsXSalada: true },
          { productId: 'p-r15', productName: 'Refri 1,5 L', quantityPerUnit: 1, countsAsXSalada: false },
        ],
      },
      {
        kind: 'product',
        refId: 'p-x',
        name: 'X-Salada',
        quantity: 3,
        unitPrice: 18,
        estimatedUnitCost: 0,
        components: [
          { productId: 'p-x', productName: 'X-Salada', quantityPerUnit: 1, countsAsXSalada: true },
        ],
      },
    ],
    '2026-11-14',
    'Pix',
    'Pedido balcão',
  );

  assert.equal(orderInput.xSaladaCount, 9);
  assert.equal(orderInput.combosCount, 3);
  assert.equal(orderInput.saleMode, 'mixed');
  assert.equal(orderInput.items?.length, 3);
  const total = orderInput.items!.reduce((acc, i) => acc + i.lineTotal, 0);
  assert.equal(total, 2 * 25 + 68 + 3 * 18); // 172

  const savedSale: SaleRecord = {
    id: 'sale-mixed-1',
    ownerId: 'owner1',
    date: orderInput.date,
    quantity: orderInput.quantity,
    unitPrice: orderInput.unitPrice,
    totalAmount: total,
    paymentMethod: orderInput.paymentMethod,
    note: orderInput.note,
    saleMode: orderInput.saleMode,
    xSaladaCount: orderInput.xSaladaCount,
    combosCount: orderInput.combosCount,
    items: orderInput.items,
    createdAtMs: 5000,
    updatedAtMs: 5000,
  };

  assert.equal(getSaleXSaladaCount(savedSale), 9);
  assert.equal(getSaleCombosCount(savedSale), 3);
  assert.equal(formatSaleItemsSummary(savedSale), '2x Combo 1, 1x Combo 4, 3x X-Salada');

  const dash = computeDashboardMetrics([savedSale], [], '2026-11-14');
  assert.equal(dash.todayQty, 9);
  assert.equal(dash.todayCombos, 3);
  assert.equal(dash.todaySalesCount, 1);
  assert.equal(dash.todayRevenue, 172);
  assert.equal(dash.todayAverageTicket, 172);

  const topCombos = computeTopCombos([savedSale]);
  assert.equal(topCombos.length, 2);
  assert.equal(topCombos[0].name, 'Combo 1');
  assert.equal(topCombos[0].quantitySold, 2);
  assert.equal(topCombos[0].revenue, 50);

  const topProducts = computeTopProducts([savedSale]);
  assert.equal(topProducts[0].name, 'X-Salada');
  assert.equal(topProducts[0].quantitySold, 9);

  const payments = computePaymentMethodBreakdown([
    savedSale,
    { ...savedSale, id: 's-outros', paymentMethod: 'Outros', totalAmount: 28 },
  ]);
  assert.equal(payments[0].paymentMethod, 'Pix');
  assert.equal(payments[1].paymentMethod, 'Outros');
});

test('beverage-only order counts 0 X-Saladas while legacy sales without snapshot keep quantity', () => {
  const drinkOnlyInput = buildSaleInputFromOrder(
    [
      {
        kind: 'product',
        refId: 'p-r250',
        name: 'Refri 250 ml',
        quantity: 2,
        unitPrice: 6,
        estimatedUnitCost: 0,
        components: [
          { productId: 'p-r250', productName: 'Refri 250 ml', quantityPerUnit: 1, countsAsXSalada: false },
        ],
      },
    ],
    '2026-11-14',
    'Dinheiro',
    '',
  );

  assert.equal(drinkOnlyInput.xSaladaCount, 0);
  assert.equal(drinkOnlyInput.combosCount, 0);
  assert.equal(drinkOnlyInput.quantity, 2);

  const drinkSale: SaleRecord = {
    id: 'sale-drink',
    ownerId: 'owner1',
    date: drinkOnlyInput.date,
    quantity: drinkOnlyInput.quantity,
    unitPrice: drinkOnlyInput.unitPrice,
    totalAmount: 12,
    paymentMethod: 'Dinheiro',
    note: '',
    saleMode: drinkOnlyInput.saleMode,
    xSaladaCount: drinkOnlyInput.xSaladaCount,
    combosCount: drinkOnlyInput.combosCount,
    items: drinkOnlyInput.items,
    createdAtMs: 6000,
    updatedAtMs: 6000,
  };

  assert.equal(getSaleXSaladaCount(drinkSale), 0);
  assert.equal(getSaleXSaladaCount(sampleSales[0]), sampleSales[0].quantity);
});
