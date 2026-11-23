import { useMemo, useState } from 'react';
import {
  Banknote,
  Calendar,
  CreditCard,
  Download,
  FileSpreadsheet,
  Globe,
  Layers,
  Package,
  QrCode,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  type ExpenseRecord,
  normalizePaymentMethod,
  type ReportPeriodPreset,
  type SaleRecord,
  type ShopSettings,
} from '../types/finance';
import { exportReportToExcel, exportReportToPDF } from '../utils/exporters';
import {
  addDays,
  computeReportSummary,
  formatCurrencyBRL,
  formatDateBR,
  formatSaleItemsSummary,
  getLocalTodayDate,
  getSaleCombosCount,
  getSaleOrigin,
  getSaleXSaladaCount,
} from '../utils/finance';

interface ReportsViewProps {
  sales: SaleRecord[];
  expenses: ExpenseRecord[];
  settings: ShopSettings;
}

const PRESET_OPTIONS: Array<{ id: ReportPeriodPreset; label: string }> = [
  { id: 'today', label: 'Diário (Hoje)' },
  { id: 'yesterday', label: 'Ontem' },
  { id: 'last7', label: 'Semanal (7 dias)' },
  { id: 'last30', label: 'Últimos 30 dias' },
  { id: 'thisMonth', label: 'Mensal (Este mês)' },
  { id: 'lastMonth', label: 'Mês anterior' },
  { id: 'custom', label: 'Personalizado' },
];

function DeltaText({
  delta,
  inverse = false,
}: {
  delta: number | null;
  inverse?: boolean;
}) {
  if (delta === null) {
    return (
      <span className="text-xs text-[#6B7280]">
        Sem base anterior para comparar
      </span>
    );
  }
  const positiveGood = inverse ? delta <= 0 : delta >= 0;
  const sign = delta > 0 ? '+' : '';
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono tabular-nums ${
        positiveGood ? 'text-[#22C55E]' : 'text-[#EF4444]'
      }`}
    >
      {delta >= 0 ? (
        <TrendingUp className="w-3.5 h-3.5" />
      ) : (
        <TrendingDown className="w-3.5 h-3.5" />
      )}
      {sign}
      {delta.toFixed(1)}% vs período anterior
    </span>
  );
}

export function ReportsView({ sales, expenses, settings }: ReportsViewProps) {
  const today = getLocalTodayDate();
  const [preset, setPreset] = useState<ReportPeriodPreset>('thisMonth');
  const [customStart, setCustomStart] = useState(addDays(today, -6));
  const [customEnd, setCustomEnd] = useState(today);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      computeReportSummary(
        sales,
        expenses,
        preset,
        today,
        customStart,
        customEnd,
      ),
    [sales, expenses, preset, today, customStart, customEnd],
  );

  function handleExportPDF() {
    exportReportToPDF(summary, settings.establishmentName);
    setExportMessage('Relatório PDF gerado e baixado.');
    setTimeout(() => setExportMessage(null), 4000);
  }

  function handleExportExcel() {
    exportReportToExcel(summary, settings.establishmentName);
    setExportMessage('Planilha Excel (.xlsx) gerada e baixada.');
    setTimeout(() => setExportMessage(null), 4000);
  }

  return (
    <div className="space-y-6">
      {/* Period Filters & Exports */}
      <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#111827]">
              Relatórios por Período
            </h2>
            <p className="text-xs text-[#6B7280] font-mono tabular-nums mt-0.5">
              Intervalo ativo: {formatDateBR(summary.range.start)} até{' '}
              {formatDateBR(summary.range.end)} · Comparando com{' '}
              {formatDateBR(summary.range.prevStart)} até{' '}
              {formatDateBR(summary.range.prevEnd)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportPDF}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E5E7EB] hover:border-[#EAB308]/50 bg-[#F1F3F5] text-xs font-semibold text-[#111827] inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-[#EAB308]" />
              Exportar PDF
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Excel
            </button>
          </div>
        </div>

        {exportMessage && (
          <div
            role="status"
            className="px-3.5 py-2.5 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs text-[#86EFAC]"
          >
            {exportMessage}
          </div>
        )}

        <div
          role="group"
          aria-label="Selecionar período do relatório"
          className="flex flex-wrap gap-2"
        >
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPreset(opt.id)}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold transition-colors duration-100 whitespace-nowrap shrink-0 cursor-pointer ${
                preset === opt.id
                  ? 'bg-[#EAB308] text-[#F9FAFB]'
                  : 'bg-[#F9FAFB] border border-[#E5E7EB] text-[#4B5563] hover:border-[#374151]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div>
              <label
                htmlFor="report-custom-start"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Data inicial
              </label>
              <input
                id="report-custom-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="report-custom-end"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Data final
              </label>
              <input
                id="report-custom-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono"
              />
            </div>
          </div>
        )}
      </section>

      {/* Main Report KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
          <p className="text-xs text-[#6B7280]">Faturamento total</p>
          <p
            data-testid="report-revenue"
            className="text-2xl font-bold text-[#EAB308] font-mono tabular-nums"
          >
            {formatCurrencyBRL(summary.totalRevenue)}
          </p>
          <DeltaText delta={summary.comparison.revenueDeltaPct} />
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
          <p className="text-xs text-[#6B7280]">Despesas totais</p>
          <p
            data-testid="report-expenses"
            className="text-2xl font-bold text-[#F87171] font-mono tabular-nums"
          >
            {formatCurrencyBRL(summary.totalExpenses)}
          </p>
          <DeltaText delta={summary.comparison.expensesDeltaPct} inverse />
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
          <p className="text-xs text-[#6B7280]">Lucro líquido estimado</p>
          <p
            data-testid="report-profit"
            className={`text-2xl font-bold font-mono tabular-nums ${
              summary.netProfit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
            }`}
          >
            {formatCurrencyBRL(summary.netProfit)}
          </p>
          <DeltaText delta={summary.comparison.profitDeltaPct} />
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
          <p className="text-xs text-[#6B7280]">X-Saladas vendidos</p>
          <p
            data-testid="report-qty"
            className="text-2xl font-bold text-[#111827] font-mono tabular-nums"
          >
            {summary.totalXSaladas} un
          </p>
          <DeltaText delta={summary.comparison.qtyDeltaPct} />
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
          <p className="text-xs text-[#6B7280]">Combos vendidos</p>
          <p
            data-testid="report-combos"
            className="text-2xl font-bold text-[#EAB308] font-mono tabular-nums"
          >
            {summary.totalCombos} un
          </p>
          <span className="text-xs text-[#6B7280] font-mono tabular-nums">
            Unidades de combos no período
          </span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
          <p className="text-xs text-[#6B7280]">Ticket médio por pedido</p>
          <p
            data-testid="report-ticket"
            className="text-2xl font-bold text-[#111827] font-mono tabular-nums"
          >
            {formatCurrencyBRL(summary.averageTicket)}
          </p>
          <span className="text-xs text-[#6B7280] font-mono tabular-nums">
            Baseado em {summary.salesCount} pedido{summary.salesCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between text-xs text-[#6B7280]">
            <span>Melhor dia de vendas</span>
            <Calendar className="w-4 h-4 text-[#EAB308]" />
          </div>
          {summary.bestDay ? (
            <>
              <p
                data-testid="report-best-day"
                className="text-xl font-bold text-[#111827] font-mono tabular-nums"
              >
                {formatDateBR(summary.bestDay.date)}
              </p>
              <p className="text-xs text-[#EAB308] font-mono tabular-nums">
                {formatCurrencyBRL(summary.bestDay.revenue)} · {summary.bestDay.qty} X-Salada{summary.bestDay.qty === 1 ? '' : 's'}
              </p>
            </>
          ) : (
            <p className="text-sm text-[#6B7280] pt-1">Sem vendas no período</p>
          )}
        </div>
      </section>

      {/* Combos, Produtos e Formas de Pagamento Mais Utilizadas */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Combos mais vendidos */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3">
            <Layers className="w-4 h-4 text-[#EAB308]" />
            <h3 className="text-sm font-bold text-[#111827]">
              Combos mais vendidos
            </h3>
          </div>
          {summary.topCombos.length === 0 ? (
            <p className="text-xs text-[#6B7280]">
              Nenhum combo vendido neste período.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {summary.topCombos.map((c, idx) => (
                <div
                  key={c.comboId}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827] truncate">
                      #{idx + 1} · {c.name}
                    </p>
                    <p className="text-[#6B7280] font-mono tabular-nums">
                      {c.quantitySold} unidade{c.quantitySold === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="font-bold text-[#EAB308] font-mono tabular-nums shrink-0">
                    {formatCurrencyBRL(c.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Produtos mais vendidos */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3">
            <Package className="w-4 h-4 text-[#22C55E]" />
            <h3 className="text-sm font-bold text-[#111827]">
              Produtos mais vendidos
            </h3>
          </div>
          {summary.topProducts.length === 0 ? (
            <p className="text-xs text-[#6B7280]">
              Nenhum produto vendido neste período.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {summary.topProducts.map((p, idx) => (
                <div
                  key={p.productId}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827] truncate">
                      #{idx + 1} · {p.name}
                    </p>
                    <p className="text-[#6B7280]">
                      Inclui combos e individuais
                    </p>
                  </div>
                  <span className="font-bold text-[#111827] font-mono tabular-nums shrink-0">
                    {p.quantitySold} un
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formas de pagamento mais utilizadas */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3">
            <CreditCard className="w-4 h-4 text-[#38BDF8]" />
            <h3 className="text-sm font-bold text-[#111827]">
              Formas de pagamento mais utilizadas
            </h3>
          </div>
          {summary.paymentBreakdown.length === 0 ? (
            <p className="text-xs text-[#6B7280]">
              Nenhuma venda registrada neste período.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {summary.paymentBreakdown.map((pm) => (
                <div
                  key={pm.paymentMethod}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827] truncate">
                      {pm.paymentMethod}
                    </p>
                    <p className="text-[#6B7280] font-mono tabular-nums">
                      {pm.ordersCount} pedido{pm.ordersCount === 1 ? '' : 's'} ·{' '}
                      {pm.sharePercent.toFixed(1).replace('.', ',')}%
                    </p>
                  </div>
                  <span className="font-bold text-[#EAB308] font-mono tabular-nums shrink-0">
                    {formatCurrencyBRL(pm.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Controle Financeiro do Período */}
      <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
        <div className="border-b border-[#E5E7EB] pb-3">
          <h3 className="text-sm font-bold text-[#111827]">
            Controle Financeiro do Período ({summary.range.label})
          </h3>
          <p className="text-xs text-[#6B7280] mt-0.5 font-mono tabular-nums">
            Faturamento ({formatCurrencyBRL(summary.totalRevenue)}) − Despesas (
            {formatCurrencyBRL(summary.totalExpenses)}) = Resultado líquido (
            {formatCurrencyBRL(summary.netProfit)})
          </p>
        </div>

        <div
          className={`grid grid-cols-1 ${
            summary.financialControl.otherReceived > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
          } divide-y sm:divide-y-0 sm:divide-x divide-[#E5E7EB]`}
        >
          <div className="py-2 sm:pr-4 flex items-center gap-3">
            <Banknote className="w-5 h-5 text-[#22C55E] shrink-0" />
            <div>
              <p className="text-xs text-[#6B7280]">Dinheiro recebido</p>
              <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                {formatCurrencyBRL(summary.financialControl.cashReceived)}
              </p>
            </div>
          </div>

          <div className="py-2 sm:px-4 flex items-center gap-3">
            <QrCode className="w-5 h-5 text-[#38BDF8] shrink-0" />
            <div>
              <p className="text-xs text-[#6B7280]">Pix recebido</p>
              <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                {formatCurrencyBRL(summary.financialControl.pixReceived)}
              </p>
            </div>
          </div>

          <div className="py-2 sm:px-4 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-[#EAB308] shrink-0" />
            <div>
              <p className="text-xs text-[#6B7280]">Cartão recebido</p>
              <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                {formatCurrencyBRL(summary.financialControl.cardReceived)}
              </p>
              <p className="text-[11px] text-[#6B7280] font-mono tabular-nums">
                Débito {formatCurrencyBRL(summary.financialControl.debitReceived)} · Crédito{' '}
                {formatCurrencyBRL(summary.financialControl.creditReceived)}
              </p>
            </div>
          </div>

          {summary.financialControl.otherReceived > 0 && (
            <div className="py-2 sm:pl-4 flex items-center gap-3">
              <QrCode className="w-5 h-5 text-[#4B5563] shrink-0" />
              <div>
                <p className="text-xs text-[#6B7280]">Outros</p>
                <p className="text-base font-bold text-[#111827] font-mono tabular-nums">
                  {formatCurrencyBRL(summary.financialControl.otherReceived)}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Origem das Vendas (Manual vs Cardápio Online) */}
      <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-3">
          <Globe className="w-4 h-4 text-[#EAB308]" />
          <h3 className="text-sm font-bold text-[#111827]">
            Origem das Vendas (Manual vs Cardápio Online)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#4B5563]">Vendas Manuais</span>
              <span className="font-mono tabular-nums text-[#6B7280]">
                {(summary.totalRevenue > 0
                  ? (summary.channelBreakdown.manualRevenue / summary.totalRevenue) * 100
                  : 0
                )
                  .toFixed(1)
                  .replace('.', ',')}
                % do faturamento
              </span>
            </div>
            <p className="text-xl font-bold text-[#111827] font-mono tabular-nums">
              {formatCurrencyBRL(summary.channelBreakdown.manualRevenue)}
            </p>
            <p className="text-xs text-[#6B7280] font-mono tabular-nums">
              {summary.channelBreakdown.manualCount} pedido
              {summary.channelBreakdown.manualCount === 1 ? '' : 's'} ·{' '}
              {summary.channelBreakdown.manualXSaladas} X-Salada
              {summary.channelBreakdown.manualXSaladas === 1 ? '' : 's'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#F9FAFB]/70 border border-[#E5E7EB] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#EAB308]">Cardápio Online</span>
              <span className="font-mono tabular-nums text-[#6B7280]">
                {(summary.totalRevenue > 0
                  ? (summary.channelBreakdown.onlineRevenue / summary.totalRevenue) * 100
                  : 0
                )
                  .toFixed(1)
                  .replace('.', ',')}
                % do faturamento
              </span>
            </div>
            <p className="text-xl font-bold text-[#EAB308] font-mono tabular-nums">
              {formatCurrencyBRL(summary.channelBreakdown.onlineRevenue)}
            </p>
            <p className="text-xs text-[#6B7280] font-mono tabular-nums">
              {summary.channelBreakdown.onlineCount} pedido
              {summary.channelBreakdown.onlineCount === 1 ? '' : 's'} ·{' '}
              {summary.channelBreakdown.onlineXSaladas} X-Salada
              {summary.channelBreakdown.onlineXSaladas === 1 ? '' : 's'}
              {summary.channelBreakdown.onlineDeliveryFees > 0
                ? ` · Taxas de entrega ${formatCurrencyBRL(summary.channelBreakdown.onlineDeliveryFees)}`
                : ''}
            </p>
          </div>
        </div>
      </section>

      {/* Period Transactions Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#111827]">
              Vendas no período
            </h3>
            <span className="text-xs text-[#6B7280] font-mono tabular-nums">
              {summary.filteredSales.length}
            </span>
          </div>

          {summary.filteredSales.length === 0 ? (
            <p className="p-6 text-xs text-[#6B7280] text-center">
              Nenhuma venda registrada neste intervalo.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
              {summary.filteredSales.map((s) => {
                const xCount = getSaleXSaladaCount(s);
                const cCount = getSaleCombosCount(s);
                const pm = normalizePaymentMethod(s.paymentMethod);
                const origin = getSaleOrigin(s);
                return (
                  <div
                    key={s.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#111827] truncate">
                        {formatSaleItemsSummary(s)} · {pm} ·{' '}
                        <span
                          className={
                            origin === 'online' ? 'text-[#EAB308]' : 'text-[#6B7280]'
                          }
                        >
                          {origin === 'online' ? 'Cardápio Online' : 'Manual'}
                        </span>
                      </p>
                      <p className="text-[#6B7280] truncate font-mono tabular-nums">
                        {formatDateBR(s.date)} · {xCount} X-Salada{xCount === 1 ? '' : 's'}
                        {cCount > 0 ? ` · ${cCount} combo${cCount === 1 ? '' : 's'}` : ''}
                        {s.note ? ` · ${s.note}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-[#EAB308] font-mono tabular-nums shrink-0">
                      {formatCurrencyBRL(s.totalAmount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#111827]">
              Despesas no período
            </h3>
            <span className="text-xs text-[#6B7280] font-mono tabular-nums">
              {summary.filteredExpenses.length}
            </span>
          </div>

          {summary.filteredExpenses.length === 0 ? (
            <p className="p-6 text-xs text-[#6B7280] text-center">
              Nenhuma despesa registrada neste intervalo.
            </p>
          ) : (
            <div className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
              {summary.filteredExpenses.map((e) => (
                <div
                  key={e.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111827] truncate">
                      {e.description}
                    </p>
                    <p className="text-[#6B7280] truncate">
                      {e.category} · {normalizePaymentMethod(e.paymentMethod)} ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateBR(e.date)}
                      </span>
                    </p>
                  </div>
                  <span className="font-bold text-[#F87171] font-mono tabular-nums shrink-0">
                    − {formatCurrencyBRL(e.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
