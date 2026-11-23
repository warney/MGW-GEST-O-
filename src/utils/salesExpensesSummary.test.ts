import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExpensesView } from '../components/ExpensesView.tsx';
import { SalesView } from '../components/SalesView.tsx';
import type { ExpenseCategory, ExpenseRecord, SaleRecord } from '../types/finance.ts';
import { addDays, getLocalTodayDate } from './finance.ts';
import {
  buildExpensesCsvContent,
  buildSalesCsvContent,
  computeExpensesViewSummary,
  computeSalesViewSummary,
  paginateList,
} from './salesExpensesSummary.ts';

function makeSale(
  id: string,
  date: string,
  totalAmount: number,
  overrides: Partial<SaleRecord> = {},
): SaleRecord {
  const unitPrice = totalAmount;
  return {
    id,
    ownerId: 'user-1',
    date,
    quantity: 1,
    unitPrice,
    totalAmount,
    paymentMethod: 'Pix',
    note: '',
    saleOrigin: 'manual',
    createdAtMs: new Date(`${date}T12:00:00`).getTime(),
    updatedAtMs: new Date(`${date}T12:00:00`).getTime(),
    ...overrides,
  };
}

function makeExpense(
  id: string,
  date: string,
  amount: number,
  category: ExpenseCategory,
  description: string,
  overrides: Partial<ExpenseRecord> = {},
): ExpenseRecord {
  return {
    id,
    ownerId: 'user-1',
    date,
    amount,
    category,
    description,
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: new Date(`${date}T12:00:00`).getTime(),
    updatedAtMs: new Date(`${date}T12:00:00`).getTime(),
    ...overrides,
  };
}

test('computeSalesViewSummary calculates KPIs, period comparisons, daily series and payment breakdown faithfully', () => {
  const refDate = '2026-11-23';
  const prevPeriodDate = addDays(refDate, -35);

  const sales: SaleRecord[] = [
    makeSale('s1', refDate, 100, { paymentMethod: 'Pix', quantity: 2, unitPrice: 50 }),
    makeSale('s2', addDays(refDate, -2), 150, {
      paymentMethod: 'Cartão de crédito',
      quantity: 3,
      unitPrice: 50,
      saleOrigin: 'online',
    }),
    makeSale('s3', addDays(refDate, -10), 50, { paymentMethod: 'Dinheiro', quantity: 1, unitPrice: 50 }),
    makeSale('s-prev', prevPeriodDate, 200, { paymentMethod: 'Pix', quantity: 4, unitPrice: 50 }),
  ];

  const last30 = computeSalesViewSummary(sales, 'last30', refDate);
  assert.equal(last30.salesCount, 3);
  assert.equal(last30.totalRevenue, 300);
  assert.equal(last30.averageTicket, 100);
  assert.equal(last30.revenueDeltaPct, 50); // 300 vs 200
  assert.equal(last30.salesCountDeltaPct, 200); // 3 vs 1
  assert.equal(last30.dailySeries.length, 30);
  assert.equal(last30.paymentBreakdown.length, 3);

  const todayOnly = computeSalesViewSummary(sales, 'today', refDate);
  assert.equal(todayOnly.salesCount, 1);
  assert.equal(todayOnly.totalRevenue, 100);
  assert.equal(todayOnly.revenueDeltaPct, null); // yesterday has 0 sales -> null instead of fabricated 100%

  const thisMonth = computeSalesViewSummary(sales, 'thisMonth', refDate);
  assert.equal(thisMonth.salesCount, 3);
  assert.equal(thisMonth.totalRevenue, 300);

  const allHistory = computeSalesViewSummary(sales, 'all', refDate);
  assert.equal(allHistory.salesCount, 4);
  assert.equal(allHistory.totalRevenue, 500);
  assert.equal(allHistory.revenueDeltaPct, null);

  const customRange = computeSalesViewSummary(
    sales,
    'custom',
    refDate,
    addDays(refDate, -3),
    refDate,
  );
  assert.equal(customRange.salesCount, 2);
  assert.equal(customRange.totalRevenue, 250);
  assert.equal(customRange.dailySeries.length, 4);
});

test('computeExpensesViewSummary calculates total, active-month monthly average, categories count and latest 4 items', () => {
  const refDate = '2026-11-23';
  const expenses: ExpenseRecord[] = [
    makeExpense('e1', '2026-11-23', 320, 'Ingredientes', 'Mercado', { createdAtMs: 500 }),
    makeExpense('e2', '2026-11-22', 180, 'Energia', 'Energia Elétrica', { createdAtMs: 400 }),
    makeExpense('e3', '2026-11-20', 120, 'Embalagens', 'Embalagens Delivery', { createdAtMs: 300 }),
    makeExpense('e4', '2026-11-18', 240, 'Carnes e hambúrgueres', 'Açougue Central', { createdAtMs: 200 }),
    makeExpense('e5', '2026-11-15', 140, 'Bebidas', 'Distribuidora', { createdAtMs: 100 }),
    makeExpense('e6', '2026-10-10', 500, 'Ingredientes', 'Compra Outubro', { createdAtMs: 50 }),
  ];

  const last30 = computeExpensesViewSummary(expenses, 'last30', refDate);
  assert.equal(last30.totalExpenses, 1000);
  assert.equal(last30.previousTotalExpenses, 500); // 2026-10-10 falls within previous 30d (2026-09-25..2026-10-24)
  assert.equal(last30.expensesDeltaPct, 100);
  assert.equal(last30.activeMonthsCount, 2); // 2026-11 (1000) and 2026-10 (500)
  assert.equal(last30.monthlyAverage, 750); // 1500 / 2
  assert.equal(last30.categoriesUsedCount, 5);
  assert.equal(last30.latestExpenses.length, 4);
  assert.equal(last30.latestExpenses[0].id, 'e1');
  assert.equal(last30.latestExpenses[3].id, 'e4');
  assert.equal(last30.vsMonthlyAveragePct, 33.33); // (1000 - 750) / 750 * 100
});

test('CSV exporters and pagination format domain fields accurately', () => {
  const salesCsv = buildSalesCsvContent([
    makeSale('s1', '2026-11-23', 68.5, {
      paymentMethod: 'Pix',
      saleOrigin: 'online',
      note: 'Pedido #1046',
    }),
  ]);
  assert.match(salesCsv, /^﻿Data;Itens;/);
  assert.match(salesCsv, /23\/11\/2026/);
  assert.match(salesCsv, /Cardápio Online/);
  assert.match(salesCsv, /68,50/);

  const expensesCsv = buildExpensesCsvContent([
    makeExpense('e1', '2026-11-23', 320, 'Ingredientes', 'Mercado'),
  ]);
  assert.match(expensesCsv, /^﻿Data;Descricao;Categoria;/);
  assert.match(expensesCsv, /Mercado/);
  assert.match(expensesCsv, /320,00/);

  const page2 = paginateList([1, 2, 3, 4, 5], 2, 3);
  assert.deepEqual(page2.items, [4, 5]);
  assert.equal(page2.safePage, 2);
  assert.equal(page2.totalPages, 2);
});

test('SalesView renders loading, empty, error and populated SaaS layout with charts and actions', () => {
  const baseProps = {
    sales: [] as SaleRecord[],
    canCreateSales: true,
    canEditSales: true,
    canDeleteSales: true,
    onOpenNewSale: () => {},
    onEditSale: () => {},
    onDeleteSale: async () => {},
  };

  const loadingHtml = renderToStaticMarkup(
    createElement(SalesView, { ...baseProps, isLoading: true }),
  );
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Carregando Vendas/);

  const emptyHtml = renderToStaticMarkup(createElement(SalesView, baseProps));
  assert.match(emptyHtml, /Acompanhe.*suas vendas/);
  assert.match(emptyHtml, /Total de Vendas/);
  assert.match(emptyHtml, /Ticket Médio/);
  assert.match(emptyHtml, /Pedidos/);
  assert.match(emptyHtml, /Nenhuma venda registrada no período selecionado\./);
  assert.match(emptyHtml, /Nova Venda/);

  const errorHtml = renderToStaticMarkup(
    createElement(SalesView, {
      ...baseProps,
      errorMessage: 'Erro ao sincronizar vendas',
      onRetry: () => {},
    }),
  );
  assert.match(errorHtml, /Erro ao sincronizar vendas/);
  assert.match(errorHtml, /Tentar novamente/);

  const today = getLocalTodayDate();
  const populatedHtml = renderToStaticMarkup(
    createElement(SalesView, {
      ...baseProps,
      sales: [
        makeSale('s1', today, 120, { paymentMethod: 'Pix', quantity: 2, unitPrice: 60 }),
        makeSale('s2', addDays(today, -1), 80, {
          paymentMethod: 'Dinheiro',
          saleOrigin: 'online',
        }),
      ],
    }),
  );
  assert.match(populatedHtml, /Vendas por Dia/);
  assert.match(populatedHtml, /Formas de Pagamento/);
  assert.match(populatedHtml, /Gráfico de vendas por dia/);
  assert.match(populatedHtml, /Gráfico circular de formas de pagamento/);
  assert.match(populatedHtml, /Exportar CSV/);
  assert.match(populatedHtml, /Visualizar detalhes da venda/);
  assert.match(populatedHtml, /Editar venda/);
  assert.match(populatedHtml, /Excluir venda/);
});

test('ExpensesView renders loading, empty, error and populated SaaS layout with charts, latest list and actions', () => {
  const baseProps = {
    expenses: [] as ExpenseRecord[],
    canCreateExpenses: true,
    canEditExpenses: true,
    canDeleteExpenses: true,
    onOpenNewExpense: () => {},
    onEditExpense: () => {},
    onDeleteExpense: async () => {},
  };

  const loadingHtml = renderToStaticMarkup(
    createElement(ExpensesView, { ...baseProps, isLoading: true }),
  );
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /Carregando Despesas/);

  const emptyHtml = renderToStaticMarkup(createElement(ExpensesView, baseProps));
  assert.match(emptyHtml, /Controle.*seus gastos/);
  assert.match(emptyHtml, /Total de Despesas/);
  assert.match(emptyHtml, /Média Mensal/);
  assert.match(emptyHtml, /Categorias/);
  assert.match(emptyHtml, /Nenhuma despesa registrada no período selecionado\./);
  assert.match(emptyHtml, /Nova Despesa/);

  const errorHtml = renderToStaticMarkup(
    createElement(ExpensesView, {
      ...baseProps,
      errorMessage: 'Erro ao sincronizar despesas',
      onRetry: () => {},
    }),
  );
  assert.match(errorHtml, /Erro ao sincronizar despesas/);
  assert.match(errorHtml, /Tentar novamente/);

  const today = getLocalTodayDate();
  const populatedHtml = renderToStaticMarkup(
    createElement(ExpensesView, {
      ...baseProps,
      expenses: [
        makeExpense('e1', today, 320, 'Ingredientes', 'Mercado'),
        makeExpense('e2', addDays(today, -1), 180, 'Energia', 'Energia Elétrica'),
      ],
    }),
  );
  assert.match(populatedHtml, /Despesas por Categoria/);
  assert.match(populatedHtml, /Últimas Despesas/);
  assert.match(populatedHtml, /Ver todas/);
  assert.match(populatedHtml, /Gráfico circular de despesas por categoria/);
  assert.match(populatedHtml, /Mercado/);
  assert.match(populatedHtml, /Energia Elétrica/);
  assert.match(populatedHtml, /Exportar CSV/);
  assert.match(populatedHtml, /Editar despesa Mercado/);
  assert.match(populatedHtml, /Excluir despesa Mercado/);
});
