import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { normalizePaymentMethod } from '../types/finance';
import type { ReportSummary } from './finance';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatSaleItemsSummary,
  getSaleCombosCount,
  getSaleOrigin,
  getSaleXSaladaCount,
} from './finance';

export function exportReportToPDF(
  summary: ReportSummary,
  establishmentName: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(11, 13, 17);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(245, 183, 49);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('MGW GESTÃO', 14, 15);

  doc.setTextColor(243, 244, 246);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${establishmentName} — Relatório Financeiro (${summary.range.label})`,
    14,
    22,
  );
  doc.text(
    `Período: ${formatDateBR(summary.range.start)} até ${formatDateBR(summary.range.end)}`,
    14,
    27,
  );

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo Financeiro', 14, 42);

  autoTable(doc, {
    startY: 45,
    head: [['Indicador', 'Valor']],
    body: [
      ['Faturamento total', formatCurrencyBRL(summary.totalRevenue)],
      ['  · Vendas manuais (Balcão)', `${formatCurrencyBRL(summary.channelBreakdown.manualRevenue)} (${summary.channelBreakdown.manualCount} pedidos)`],
      ['  · Pedidos online (Cardápio Digital)', `${formatCurrencyBRL(summary.channelBreakdown.onlineRevenue)} (${summary.channelBreakdown.onlineCount} pedidos)`],
      ['Despesas totais', formatCurrencyBRL(summary.totalExpenses)],
      ['Resultado líquido estimado', formatCurrencyBRL(summary.netProfit)],
      ['X-Saladas vendidos', `${summary.totalXSaladas} un`],
      ['Combos vendidos', `${summary.totalCombos} un`],
      ['Total de pedidos registrados', `${summary.salesCount}`],
      ['Ticket médio por pedido', formatCurrencyBRL(summary.averageTicket)],
      [
        'Melhor dia de vendas',
        summary.bestDay
          ? `${formatDateBR(summary.bestDay.date)} (${formatCurrencyBRL(summary.bestDay.revenue)} · ${summary.bestDay.qty} un)`
          : 'Sem vendas no período',
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [24, 28, 36], textColor: [245, 183, 49] },
    styles: { fontSize: 9.5, cellPadding: 2.5 },
  });

  const getLastY = (fallback: number) =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? fallback;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Controle por Forma de Pagamento', 14, getLastY(100) + 10);

  autoTable(doc, {
    startY: getLastY(100) + 13,
    head: [['Forma de Pagamento', 'Pedidos', 'Valor Recebido']],
    body:
      summary.paymentBreakdown.length > 0
        ? summary.paymentBreakdown.map((pm) => [
            `${pm.paymentMethod} (${pm.sharePercent.toFixed(1).replace('.', ',')}%)`,
            String(pm.ordersCount),
            formatCurrencyBRL(pm.amount),
          ])
        : [['Sem movimentação no período', '0', formatCurrencyBRL(0)]],
    theme: 'grid',
    headStyles: { fillColor: [24, 28, 36], textColor: [245, 183, 49] },
    styles: { fontSize: 9.5, cellPadding: 2.5 },
  });

  if (summary.topCombos.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Combos Mais Vendidos', 14, getLastY(150) + 10);

    autoTable(doc, {
      startY: getLastY(150) + 13,
      head: [['Combo', 'Quantidade', 'Faturamento']],
      body: summary.topCombos.map((c) => [
        c.name,
        `${c.quantitySold} un`,
        formatCurrencyBRL(c.revenue),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [24, 28, 36], textColor: [245, 183, 49] },
      styles: { fontSize: 9, cellPadding: 2.2 },
    });
  }

  if (summary.topProducts.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Produtos Mais Vendidos', 14, getLastY(180) + 10);

    autoTable(doc, {
      startY: getLastY(180) + 13,
      head: [['Produto', 'Quantidade Total (Combos + Individuais)']],
      body: summary.topProducts.map((p) => [p.name, `${p.quantitySold} un`]),
      theme: 'striped',
      headStyles: { fillColor: [24, 28, 36], textColor: [245, 183, 49] },
      styles: { fontSize: 9, cellPadding: 2.2 },
    });
  }

  if (summary.filteredSales.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Vendas do Período', 14, getLastY(200) + 10);

    autoTable(doc, {
      startY: getLastY(200) + 13,
      head: [['Data', 'Origem', 'Itens', 'X-Saladas', 'Total', 'Pagamento', 'Observação']],
      body: summary.filteredSales.map((s) => [
        formatDateBR(s.date),
        getSaleOrigin(s) === 'online' ? 'Cardápio Online' : 'Manual',
        formatSaleItemsSummary(s),
        String(getSaleXSaladaCount(s)),
        formatCurrencyBRL(s.totalAmount),
        normalizePaymentMethod(s.paymentMethod),
        s.note || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [24, 28, 36], textColor: [245, 183, 49] },
      styles: { fontSize: 8.5, cellPadding: 2 },
    });
  }

  if (summary.filteredExpenses.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Despesas do Período', 14, getLastY(220) + 10);

    autoTable(doc, {
      startY: getLastY(220) + 13,
      head: [['Data', 'Descrição', 'Categoria', 'Pagamento', 'Valor']],
      body: summary.filteredExpenses.map((e) => [
        formatDateBR(e.date),
        e.description,
        e.category,
        normalizePaymentMethod(e.paymentMethod),
        formatCurrencyBRL(e.amount),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [24, 28, 36], textColor: [245, 183, 49] },
      styles: { fontSize: 8.5, cellPadding: 2 },
    });
  }

  doc.save(
    `mgw-gestao-relatorio-${summary.range.start}-a-${summary.range.end}.pdf`,
  );
}

export function exportReportToExcel(
  summary: ReportSummary,
  establishmentName: string,
): void {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { Campo: 'Estabelecimento', Valor: establishmentName },
    { Campo: 'Período', Valor: `${formatDateBR(summary.range.start)} a ${formatDateBR(summary.range.end)}` },
    { Campo: 'Faturamento total (R$)', Valor: summary.totalRevenue },
    { Campo: 'Vendas manuais (R$)', Valor: summary.channelBreakdown.manualRevenue },
    { Campo: 'Pedidos online (R$)', Valor: summary.channelBreakdown.onlineRevenue },
    { Campo: 'Despesas totais (R$)', Valor: summary.totalExpenses },
    { Campo: 'Resultado líquido estimado (R$)', Valor: summary.netProfit },
    { Campo: 'X-Saladas vendidos (un)', Valor: summary.totalXSaladas },
    { Campo: 'Combos vendidos (un)', Valor: summary.totalCombos },
    { Campo: 'Quantidade de pedidos', Valor: summary.salesCount },
    { Campo: 'Ticket médio (R$)', Valor: summary.averageTicket },
    {
      Campo: 'Melhor dia',
      Valor: summary.bestDay
        ? `${formatDateBR(summary.bestDay.date)} (${formatCurrencyBRL(summary.bestDay.revenue)})`
        : '—',
    },
    { Campo: 'Dinheiro recebido (R$)', Valor: summary.financialControl.cashReceived },
    { Campo: 'Pix recebido (R$)', Valor: summary.financialControl.pixReceived },
    { Campo: 'Cartão recebido total (R$)', Valor: summary.financialControl.cardReceived },
    { Campo: 'Cartão de débito (R$)', Valor: summary.financialControl.debitReceived },
    { Campo: 'Cartão de crédito (R$)', Valor: summary.financialControl.creditReceived },
    { Campo: 'Outros (R$)', Valor: summary.financialControl.otherReceived },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

  const salesRows = summary.filteredSales.map((s) => ({
    Data: formatDateBR(s.date),
    Origem: getSaleOrigin(s) === 'online' ? 'Cardápio Online' : 'Manual',
    Itens: formatSaleItemsSummary(s),
    X_Saladas: getSaleXSaladaCount(s),
    Combos: getSaleCombosCount(s),
    Valor_Total_RS: s.totalAmount,
    Forma_Pagamento: normalizePaymentMethod(s.paymentMethod),
    Observacao: s.note || '',
  }));
  const wsSales = XLSX.utils.json_to_sheet(
    salesRows.length > 0
      ? salesRows
      : [{ Data: 'Sem vendas no período', Origem: '', Itens: '', X_Saladas: 0, Combos: 0, Valor_Total_RS: 0, Forma_Pagamento: '', Observacao: '' }],
  );
  XLSX.utils.book_append_sheet(wb, wsSales, 'Vendas');

  const topComboRows = summary.topCombos.map((c) => ({
    Combo: c.name,
    Quantidade_Vendida: c.quantitySold,
    Faturamento_RS: c.revenue,
  }));
  const wsCombos = XLSX.utils.json_to_sheet(
    topComboRows.length > 0
      ? topComboRows
      : [{ Combo: 'Sem combos vendidos no período', Quantidade_Vendida: 0, Faturamento_RS: 0 }],
  );
  XLSX.utils.book_append_sheet(wb, wsCombos, 'Top_Combos');

  const topProdRows = summary.topProducts.map((p) => ({
    Produto: p.name,
    Quantidade_Total: p.quantitySold,
  }));
  const wsProducts = XLSX.utils.json_to_sheet(
    topProdRows.length > 0
      ? topProdRows
      : [{ Produto: 'Sem produtos vendidos no período', Quantidade_Total: 0 }],
  );
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Top_Produtos');

  const paymentRows = summary.paymentBreakdown.map((pm) => ({
    Forma_Pagamento: pm.paymentMethod,
    Pedidos: pm.ordersCount,
    Valor_RS: pm.amount,
    Participacao_Pct: pm.sharePercent,
  }));
  const wsPayments = XLSX.utils.json_to_sheet(
    paymentRows.length > 0
      ? paymentRows
      : [{ Forma_Pagamento: 'Sem vendas no período', Pedidos: 0, Valor_RS: 0, Participacao_Pct: 0 }],
  );
  XLSX.utils.book_append_sheet(wb, wsPayments, 'Pagamentos');

  const expenseRows = summary.filteredExpenses.map((e) => ({
    Data: formatDateBR(e.date),
    Descricao: e.description,
    Categoria: e.category,
    Valor_RS: e.amount,
    Forma_Pagamento: normalizePaymentMethod(e.paymentMethod),
    Observacao: e.note || '',
  }));
  const wsExpenses = XLSX.utils.json_to_sheet(
    expenseRows.length > 0
      ? expenseRows
      : [{ Data: 'Sem despesas no período', Descricao: '', Categoria: '', Valor_RS: 0, Forma_Pagamento: '', Observacao: '' }],
  );
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Despesas');

  const categoryRows = summary.expenseCategories.map((c) => ({
    Categoria: c.category,
    Total_RS: c.amount,
    Lancamentos: c.count,
    Participacao_Pct: c.sharePercent,
  }));
  const wsCategories = XLSX.utils.json_to_sheet(
    categoryRows.length > 0
      ? categoryRows
      : [{ Categoria: 'Sem despesas no período', Total_RS: 0, Lancamentos: 0, Participacao_Pct: 0 }],
  );
  XLSX.utils.book_append_sheet(wb, wsCategories, 'Categorias');

  XLSX.writeFile(
    wb,
    `mgw-gestao-relatorio-${summary.range.start}-a-${summary.range.end}.xlsx`,
  );
}
