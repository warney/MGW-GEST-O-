import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { MgwPartnerCommissionRecord } from './adminApi';
import type {
  AdminSubscriptionRecord,
  EstablishmentRecord,
  PlatformAuditLogRecord,
  PlatformPaymentRecord,
} from '../types/admin';
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
    headStyles: { fillColor: [32, 39, 51] },
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

export function exportSubscriptionsToExcel(subscriptions: AdminSubscriptionRecord[]): void {
  const rows = subscriptions.map((sub) => ({
    Estabelecimento: sub.tenant_name,
    Slug: sub.tenant_slug,
    StatusLoja: sub.tenant_status,
    Fundador: sub.is_founder_account ? 'Sim' : 'Não',
    Isento: sub.billing_exempt ? 'Sim' : 'Não',
    Plano: sub.plan_code,
    Valor: formatCurrencyCents(sub.plan_amount_cents),
    StatusAssinatura: sub.status,
    FimTrial: sub.trial_ends_at ? formatDateTimeBr(sub.trial_ends_at) : '—',
    FimPeriodo: sub.current_period_end ? formatDateTimeBr(sub.current_period_end) : '—',
    Retencao: sub.retention_status,
    FimRetencao: sub.retention_ends_at ? formatDateTimeBr(sub.retention_ends_at) : '—',
    AtualizadoEm: formatDateTimeBr(sub.updated_at),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Assinaturas');
  XLSX.writeFile(
    workbook,
    `mgw-admin-assinaturas-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function exportPaymentsToExcel(payments: PlatformPaymentRecord[]): void {
  const rows = payments.map((pay) => ({
    Estabelecimento: pay.tenant_name,
    Slug: pay.tenant_slug,
    Provedor: pay.provider,
    Transacao: pay.mp_payment_id || pay.id,
    Metodo: pay.payment_method || '—',
    Pagador: pay.payer_email || '—',
    Status: pay.status,
    Valor: formatCurrencyCents(pay.amount_cents),
    PagoEm: pay.paid_at ? formatDateTimeBr(pay.paid_at) : '—',
    CriadoEm: formatDateTimeBr(pay.created_at),
    MotivoFalha: pay.failure_reason || '—',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagamentos');
  XLSX.writeFile(
    workbook,
    `mgw-admin-pagamentos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function exportPartnerCommissionsToExcel(commissions: MgwPartnerCommissionRecord[]): void {
  const rows = commissions.map((c) => ({
    Parceiro: c.partner_name,
    Email: c.partner_email,
    Codigo: c.referral_code,
    Status: c.status,
    ValorBase: formatCurrencyCents(c.base_amount_cents),
    Percentual: `${c.commission_percent}%`,
    Comissao: formatCurrencyCents(c.amount_cents),
    CriadaEm: formatDateTimeBr(c.created_at),
    PagaEm: c.paid_at ? formatDateTimeBr(c.paid_at) : '—',
    ReferenciaPix: c.payment_reference || '—',
    Observacao: c.payment_note || '—',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Comissoes_Parceiros');
  XLSX.writeFile(
    workbook,
    `mgw-admin-comissoes-parceiros-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
