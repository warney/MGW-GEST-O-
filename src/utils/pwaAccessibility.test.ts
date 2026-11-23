import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { ReportsView } from '../components/ReportsView';
import { Revenue7DaysChart, FinancialHealthDoughnutChart } from '../components/Charts';
import {
  SalesByDayAreaChart,
  InteractiveBreakdownDoughnutChart,
} from '../components/SalesExpensesCharts';
import type { ShopSettings } from '../types/finance';
import { computeFinancialHealth } from './finance';

const SAMPLE_SETTINGS: ShopSettings = {
  ownerId: 'owner_1',
  establishmentName: 'MGW Lanches Teste',
  xSaladaPrice: 22,
  dailyGoal: 800,
  monthlyGoal: 18000,
  startDate: '2026-01-01',
  timezone: 'America/Manaus',
};

test('OfflineIndicator renders high-contrast online header badge and skips floating banner while online', () => {
  const badgeHtml = renderToStaticMarkup(
    createElement(OfflineIndicator, { variant: 'badge' }),
  );
  assert.ok(badgeHtml.includes('Conectado à internet'));
  assert.ok(badgeHtml.includes('Online'));
  assert.ok(badgeHtml.includes('no-print'));

  const floatingHtml = renderToStaticMarkup(
    createElement(OfflineIndicator, { variant: 'floating' }),
  );
  assert.equal(floatingHtml, '');
});

test('PWAInstallButton renders accessible manual fallback in non-installable browsers with light and dark tones', () => {
  const hiddenByDefault = renderToStaticMarkup(
    createElement(PWAInstallButton, { appName: 'MGW Gestão' }),
  );
  assert.equal(hiddenByDefault, '');

  const lightFallback = renderToStaticMarkup(
    createElement(PWAInstallButton, {
      appName: 'MGW Gestão',
      showManualFallback: true,
      tone: 'light',
    }),
  );
  assert.ok(lightFallback.includes('Como instalar'));
  assert.ok(lightFallback.includes('bg-white'));

  const darkFallback = renderToStaticMarkup(
    createElement(PWAInstallButton, {
      appName: 'MGW Cardápio Digital',
      showManualFallback: true,
      tone: 'dark',
    }),
  );
  assert.ok(darkFallback.includes('Como instalar'));
  assert.ok(darkFallback.includes('bg-[#12151C]/90'));
});

test('ReportsView renders accessible print layout, aria-pressed presets, and compliant contrast classes', () => {
  const html = renderToStaticMarkup(
    createElement(ReportsView, {
      sales: [],
      expenses: [],
      settings: SAMPLE_SETTINGS,
    }),
  );

  assert.ok(html.includes('MGW Lanches Teste — Relatório Gerencial'));
  assert.ok(html.includes('Imprimir'));
  assert.ok(html.includes('Exportar PDF'));
  assert.ok(html.includes('Exportar Excel'));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes('mgw-print-avoid-break'));
  assert.ok(!html.includes('#EAB308'));
  assert.ok(!html.includes('#86EFAC'));
  assert.ok(!html.includes('#F87171'));
});

test('Charts and SalesExpensesCharts render keyboard-accessible interactive chart controls', () => {
  const revHtml = renderToStaticMarkup(
    createElement(Revenue7DaysChart, {
      data: [
        {
          key: '2026-11-23',
          label: 'Seg',
          qty: 3,
          revenue: 120,
          expenses: 20,
          profit: 100,
          weekdayLabel: 'Seg',
          shortDateLabel: '23/11',
          fullDateLabel: 'Seg, 23/11',
        },
      ],
    }),
  );
  assert.ok(revHtml.includes('tabindex="0"'));
  assert.ok(revHtml.includes('role="button"'));
  assert.ok(revHtml.includes('overflow-x-clip'));

  const sampleHealthSummary = computeFinancialHealth(1000, 280, 800);
  const healthHtml = renderToStaticMarkup(
    createElement(FinancialHealthDoughnutChart, {
      health: {
        summary: sampleHealthSummary,
        situationLabel: 'Ótima',
        status: sampleHealthSummary.status,
        centerPercent: 72,
        positiveArcPercent: 72,
        isAvailable: true,
        caption: 'últimos 30 dias',
      },
    }),
  );
  assert.ok(healthHtml.includes('tabindex="0"'));
  assert.ok(healthHtml.includes('role="button"'));

  const areaHtml = renderToStaticMarkup(
    createElement(SalesByDayAreaChart, {
      data: [
        {
          date: '2026-11-23',
          shortDate: '23/11',
          fullDateLabel: 'Seg, 23/11',
          weekdayShort: 'Seg',
          revenue: 250,
          ordersCount: 5,
          xSaladasCount: 3,
        },
      ],
    }),
  );
  assert.ok(areaHtml.includes('tabindex="0"'));
  assert.ok(areaHtml.includes('overflow-x-clip'));

  const doughnutHtml = renderToStaticMarkup(
    createElement(InteractiveBreakdownDoughnutChart, {
      segments: [
        {
          key: 'Pix',
          label: 'Pix',
          amount: 250,
          sharePercent: 100,
          count: 5,
          color: '#3478E5',
        },
      ],
      totalAmount: 250,
      emptyMessage: 'Sem dados',
      ariaLabel: 'Pagamentos',
    }),
  );
  assert.ok(doughnutHtml.includes('tabindex="0"'));
  assert.ok(doughnutHtml.includes('aria-pressed="false"'));
});
