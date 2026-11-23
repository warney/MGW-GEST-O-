import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardView } from '../components/DashboardView.tsx';
import {
  DEFAULT_SHOP_SETTINGS,
  type ExpenseRecord,
  type SaleRecord,
  type ShopSettings,
} from '../types/finance.ts';
import {
  computeDashboardHeroMetrics,
  formatDeltaPercentBR,
  getUserGreetingFirstName,
} from './dashboardSummary.ts';
import { getLocalTodayDate } from './finance.ts';

const baseSettings: ShopSettings = {
  ownerId: 'owner-1',
  ...DEFAULT_SHOP_SETTINGS,
  establishmentName: 'Lanchonete Teste',
  dailyGoal: 500,
  monthlyGoal: 12000,
};

function makeSale(id: string, date: string, totalAmount: number): SaleRecord {
  const ts = Date.parse(`${date}T12:00:00Z`);
  return {
    id,
    ownerId: 'owner-1',
    date,
    quantity: 1,
    unitPrice: totalAmount,
    totalAmount,
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: ts,
    updatedAtMs: ts,
  };
}

function makeExpense(id: string, date: string, amount: number): ExpenseRecord {
  const ts = Date.parse(`${date}T12:00:00Z`);
  return {
    id,
    ownerId: 'owner-1',
    description: 'Insumos',
    amount,
    category: 'Ingredientes',
    date,
    paymentMethod: 'Pix',
    note: '',
    createdAtMs: ts,
    updatedAtMs: ts,
  };
}

test('getUserGreetingFirstName extracts first name cleanly and returns null when empty', () => {
  assert.equal(getUserGreetingFirstName('warney.fernandes22@gmail.com'), 'Warney');
  assert.equal(getUserGreetingFirstName('gabriel@mgw.com'), 'Gabriel');
  assert.equal(getUserGreetingFirstName(''), null);
  assert.equal(getUserGreetingFirstName(null), null);
});

test('computeDashboardHeroMetrics computes real period KPIs, deltas, 7-day bars, and financial health without fake data', () => {
  const sales: SaleRecord[] = [
    makeSale('s1', '2026-11-20', 400),
    makeSale('s2', '2026-11-20', 200),
    makeSale('s3', '2026-11-18', 400),
    makeSale('s4', '2026-11-10', 500),
  ];
  const expenses: ExpenseRecord[] = [
    makeExpense('e1', '2026-11-19', 200),
    makeExpense('e2', '2026-11-10', 250),
  ];

  const metrics = computeDashboardHeroMetrics(
    sales,
    expenses,
    baseSettings,
    'last7',
    '2026-11-20',
  );

  assert.equal(metrics.reportSummary.totalRevenue, 1000);
  assert.equal(metrics.reportSummary.totalExpenses, 200);
  assert.equal(metrics.reportSummary.netProfit, 800);
  assert.equal(metrics.salesCount, 3);
  assert.equal(metrics.previousSalesCount, 1);

  assert.equal(metrics.revenueDeltaPct, 100);
  assert.equal(metrics.expensesDeltaPct, -20);
  assert.equal(metrics.salesCountDeltaPct, 200);
  assert.equal(formatDeltaPercentBR(-20), '20,0%');

  assert.equal(metrics.last7Days.length, 7);
  assert.equal(metrics.last7Days[6].key, '2026-11-20');
  assert.equal(metrics.last7Days[6].revenue, 600);
  assert.equal(metrics.last7Days[5].revenue, 0);

  assert.equal(metrics.health.isAvailable, true);
  assert.equal(metrics.health.situationLabel, 'Ótima');
  assert.equal(metrics.health.centerPercent, 80);
});

test('computeDashboardHeroMetrics leaves unavailable states neutral when no prior data exists', () => {
  const empty = computeDashboardHeroMetrics(
    [],
    [],
    baseSettings,
    'last30',
    '2026-11-20',
  );

  assert.equal(empty.reportSummary.totalRevenue, 0);
  assert.equal(empty.salesCount, 0);
  assert.equal(empty.revenueDeltaPct, null);
  assert.equal(empty.expensesDeltaPct, null);
  assert.equal(empty.profitDeltaPct, null);
  assert.equal(empty.salesCountDeltaPct, null);
  assert.equal(empty.health.isAvailable, false);
  assert.equal(empty.health.situationLabel, 'Indisponível');
  assert.equal(empty.health.centerPercent, null);
});

test('DashboardView renders loading skeleton, empty/error states, and populated sections without fake data', () => {
  const loadingHtml = renderToStaticMarkup(
    createElement(DashboardView, {
      sales: [],
      expenses: [],
      settings: baseSettings,
      userEmail: 'warney.fernandes22@gmail.com',
      isLoading: true,
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
    }),
  );
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.doesNotMatch(loadingHtml, /hero-kpi-revenue/);

  const emptyHtml = renderToStaticMarkup(
    createElement(DashboardView, {
      sales: [],
      expenses: [],
      settings: baseSettings,
      userEmail: 'warney.fernandes22@gmail.com',
      errorMessage: 'Tempo limite excedido',
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
    }),
  );
  assert.match(emptyHtml, /Olá, Warney!/);
  assert.match(emptyHtml, /Tempo limite excedido/);
  assert.match(emptyHtml, /Ainda não há lançamentos registrados/);
  assert.match(emptyHtml, /Indisponível/);
  assert.doesNotMatch(emptyHtml, /72%/);

  const today = getLocalTodayDate();
  const populatedHtml = renderToStaticMarkup(
    createElement(DashboardView, {
      sales: [makeSale('today-1', today, 500)],
      expenses: [makeExpense('today-exp', today, 100)],
      settings: baseSettings,
      userEmail: 'warney.fernandes22@gmail.com',
      onOpenNewSale: () => {},
      onOpenNewExpense: () => {},
      onOpenOrders: () => {},
    }),
  );
  assert.match(populatedHtml, /Olá, Warney!/);
  assert.match(populatedHtml, /Faturamento dos Últimos 7 Dias/);
  assert.match(populatedHtml, /Saúde Financeira/);
  assert.match(populatedHtml, /80%/);
  assert.match(populatedHtml, /Ótima/);
  assert.match(populatedHtml, /Indicadores de Hoje/);
  assert.match(populatedHtml, /Acumulado do Mês Atual/);
  assert.match(populatedHtml, /Combos mais vendidos/);
  assert.match(populatedHtml, /Controle Financeiro do Mês/);
  assert.match(populatedHtml, /Cardápio Digital e Pedidos Online/);
});
