import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { EstablishmentRecord, PlatformAuditLogRecord } from '../types/admin';
import { formatCurrencyCents, formatDateTimeBr } from './rbac';

export function exportAuditLogsToExcel(logs: PlatformAuditLogRecord[]): void {
  const rows = logs.map((item) => ({
    Data: formatDateTimeBr(item.created_at),
    Administrador: item.admin_email,
    Papel: item.admin_role,
    Acao: item.action,
    Alvo: `${item.target_type}:${item.target_id}`,
    Motivo: item.reason,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoria_MGW');
  XLSX.writeFile(workbook, `mgw-admin-auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportAuditLogsToPdf(logs: PlatformAuditLogRecord[]): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text('MGW Admin — Relatório de Auditoria Administrativa', 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [['Data/Hora', 'Administrador', 'Papel', 'Ação', 'Alvo', 'Motivo']],
    body: logs.map((item) => [
      formatDateTimeBr(item.created_at),
      item.admin_email,
      item.admin_role,
      item.action,
      `${item.target_type} · ${item.target_id.slice(0, 16)}`,
      item.reason || '—',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [24, 28, 38] },
  });

  doc.save(`mgw-admin-auditoria-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportEstablishmentsToExcel(tenants: EstablishmentRecord[]): void {
  const rows = tenants.map((item) => ({
    Estabelecimento: item.name,
    Slug: item.slug,
    Status: item.status,
    Fundador: item.is_founder_account ? 'Sim' : 'Não',
    Isento: item.billing_exempt ? 'Sim' : 'Não',
    Plano: item.plan_code ?? '—',
    Assinatura: item.subscription_status ?? '—',
    ValorMensal: formatCurrencyCents(item.plan_amount_cents ?? 0),
    Proprietario: item.owner_email ?? '—',
    MembrosAtivos: item.active_members_count,
    ProdutosAtivos: item.products_count,
    VendasRegistradas: item.sales_count,
    PedidosOnline: item.online_orders_count,
    CriadoEm: formatDateTimeBr(item.created_at),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Estabelecimentos');
  XLSX.writeFile(
    workbook,
    `mgw-admin-estabelecimentos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
