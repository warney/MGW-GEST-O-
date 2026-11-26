import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  DollarSign,
  Download,
  Info,
  Plus,
  Receipt,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  fetchEstablishments,
  fetchFinanceSummary,
  fetchPayments,
  recordManualPayment,
} from '../services/adminApi';
import { exportPaymentsToExcel } from '../services/exportReports';
import {
  canManageSubscriptions,
  formatCurrencyCents,
  formatDateTimeBr,
} from '../services/rbac';
import type {
  EstablishmentRecord,
  FinanceSummary,
  PlatformPaymentRecord,
  PlatformRole,
} from '../types/admin';

interface FinanceViewProps {
  role: PlatformRole;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
  onInspectEstablishment?: (tenantId: string) => void;
}

export function FinanceView({
  role,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
  onInspectEstablishment,
}: FinanceViewProps) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [payments, setPayments] = useState<PlatformPaymentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [tenants, setTenants] = useState<EstablishmentRecord[]>([]);
  const [manualForm, setManualForm] = useState({
    tenantId: '',
    amountReais: '49.90',
    paymentMethod: 'pix',
    payerEmail: '',
    status: 'approved' as 'approved' | 'pending' | 'refunded',
    reason: '',
  });
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const canRecordManual = canManageSubscriptions(role);

  const loadFinance = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, payRes] = await Promise.all([
        fetchFinanceSummary(),
        fetchPayments(statusFilter, 150),
      ]);
      setSummary(sumRes);
      setPayments(payRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFinance();
  }, [refreshTrigger, statusFilter]);

  const visiblePayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (pay) =>
        pay.tenant_name.toLowerCase().includes(q) ||
        pay.tenant_slug.toLowerCase().includes(q) ||
        (pay.payer_email || '').toLowerCase().includes(q) ||
        (pay.mp_payment_id || '').toLowerCase().includes(q) ||
        pay.provider.toLowerCase().includes(q),
    );
  }, [payments, search]);

  const openManualModal = () => {
    setManualError(null);
    setManualOpen(true);
    if (tenants.length === 0) {
      fetchEstablishments('', 'all', 200, 0)
        .then((res) => setTenants(res.items))
        .catch(() => {
          /* lista opcional até carregar */
        });
    }
  };

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaVerified) {
      onRequestMfa();
      return;
    }
    const cents = Math.round(Number(manualForm.amountReais.replace(',', '.')) * 100);
    if (!manualForm.tenantId) {
      setManualError('Selecione o estabelecimento do lançamento.');
      return;
    }
    if (!Number.isFinite(cents) || cents < 100) {
      setManualError('Informe um valor válido de pelo menos R$ 1,00.');
      return;
    }
    setSavingManual(true);
    setManualError(null);
    try {
      await recordManualPayment({
        tenantId: manualForm.tenantId,
        amountCents: cents,
        paymentMethod: manualForm.paymentMethod,
        payerEmail: manualForm.payerEmail,
        status: manualForm.status,
        reason: manualForm.reason.trim(),
      });
      setManualOpen(false);
      setManualForm({
        tenantId: '',
        amountReais: '49.90',
        paymentMethod: 'pix',
        payerEmail: '',
        status: 'approved',
        reason: '',
      });
      await loadFinance();
    } catch (err) {
      setManualError(
        err instanceof Error ? err.message : 'Não foi possível registrar o recebimento.',
      );
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Financeiro da Plataforma</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Receita recorrente contratada (MRR/ARR) e histórico de cobranças registradas em{' '}
            <code className="font-mono">platform_payments</code>.
          </p>
        </div>

        {canRecordManual && (
          <button
            type="button"
            onClick={openManualModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5B731] px-3.5 py-2 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] cursor-pointer whitespace-nowrap self-start"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Registrar recebimento manual</span>
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-900 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-900">
            Integração automática com Mercado Pago pendente de ativação
          </p>
          <p className="text-amber-800 mt-0.5">
            Os cálculos de MRR e ARR refletem as assinaturas ativas reais na tabela{' '}
            <code className="font-mono">subscriptions</code>. Enquanto os webhooks do Mercado Pago
            não estão ativos, recebimentos via Pix ou transferência podem ser lançados manualmente
            com auditoria e MFA.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>MRR Recorrente</span>
              <DollarSign className="h-4 w-4 text-emerald-700" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {formatCurrencyCents(summary.mrrCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {summary.payingTenants} pagantes · {summary.trialTenants} em trial ·{' '}
              {summary.exemptTenants} isentos
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>ARR Projetado</span>
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {formatCurrencyCents(summary.arrCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Projeção anualizada sobre MRR ativo</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Recebido no Mês</span>
              <Receipt className="h-4 w-4 text-sky-700" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {formatCurrencyCents(summary.approvedMonthCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Total acumulado: {formatCurrencyCents(summary.approvedTotalCents)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Pendentes / Recusados</span>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {formatCurrencyCents(summary.pendingCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {summary.rejectedCount} cobranças recusadas registradas
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Histórico de Pagamentos ({visiblePayments.length})
            </h2>
            <p className="text-xs text-slate-500">
              Lançamentos automáticos e ajustes manuais auditados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Loja, e-mail ou transação..."
                className="w-52 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              <option value="all">Todos</option>
              <option value="approved">Aprovados</option>
              <option value="pending">Pendentes</option>
              <option value="rejected">Recusados</option>
              <option value="refunded">Estornados</option>
            </select>

            <button
              type="button"
              disabled={visiblePayments.length === 0}
              onClick={() => exportPaymentsToExcel(visiblePayments)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : visiblePayments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum pagamento encontrado para o filtro atual em{' '}
            <code className="font-mono">platform_payments</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Estabelecimento</th>
                  <th className="px-4 py-2.5 font-medium">Provedor / ID</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                  <th className="px-4 py-2.5 font-medium text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiblePayments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      {onInspectEstablishment ? (
                        <button
                          type="button"
                          onClick={() => onInspectEstablishment(pay.tenant_id)}
                          className="font-medium text-slate-900 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer text-left"
                        >
                          <span>{pay.tenant_name}</span>
                          <ArrowUpRight className="h-3 w-3 text-slate-400" />
                        </button>
                      ) : (
                        <p className="font-medium text-slate-900">{pay.tenant_name}</p>
                      )}
                      <p className="font-mono text-[11px] text-slate-500">
                        {pay.payer_email || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">
                      {pay.provider}
                      {pay.payment_method ? ` (${pay.payment_method})` : ''} ·{' '}
                      {pay.mp_payment_id || pay.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusIndicator status={pay.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900 tabular-nums">
                      {formatCurrencyCents(pay.amount_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                      {formatDateTimeBr(pay.paid_at || pay.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manualOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Registrar Recebimento Manual</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Lançamento auditado em <code className="font-mono">platform_payments</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="rounded p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!mfaVerified && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
                <span>Requer MFA AAL2 ativo.</span>
                <button
                  type="button"
                  onClick={onRequestMfa}
                  className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                >
                  Validar MFA
                </button>
              </div>
            )}

            {manualError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {manualError}
              </div>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Estabelecimento</label>
                <select
                  required
                  value={manualForm.tenantId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = tenants.find((t) => t.id === id);
                    setManualForm((f) => ({
                      ...f,
                      tenantId: id,
                      payerEmail: found?.owner_email || f.payerEmail,
                      amountReais:
                        found?.plan_amount_cents && found.plan_amount_cents > 0
                          ? (found.plan_amount_cents / 100).toFixed(2)
                          : f.amountReais,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900"
                >
                  <option value="">Selecione a loja...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    required
                    value={manualForm.amountReais}
                    onChange={(e) => setManualForm((f) => ({ ...f, amountReais: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Forma</label>
                  <select
                    value={manualForm.paymentMethod}
                    onChange={(e) =>
                      setManualForm((f) => ({ ...f, paymentMethod: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900"
                  >
                    <option value="pix">Pix Direto</option>
                    <option value="transferencia">Transferência</option>
                    <option value="boleto">Boleto</option>
                    <option value="ajuste">Ajuste Administrativo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={manualForm.status}
                    onChange={(e) =>
                      setManualForm((f) => ({
                        ...f,
                        status: e.target.value as 'approved' | 'pending' | 'refunded',
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900"
                  >
                    <option value="approved">Aprovado (Recebido)</option>
                    <option value="pending">Pendente</option>
                    <option value="refunded">Estornado</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">E-mail pagador</label>
                  <input
                    type="email"
                    value={manualForm.payerEmail}
                    onChange={(e) => setManualForm((f) => ({ ...f, payerEmail: e.target.value }))}
                    placeholder="cliente@loja.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Comprovante / Motivo (obrigatório na auditoria)
                </label>
                <textarea
                  rows={2}
                  required
                  minLength={3}
                  value={manualForm.reason}
                  onChange={(e) => setManualForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex.: Pix mensalidade novembro confirmado no extrato..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual || !mfaVerified || manualForm.reason.trim().length < 3}
                  className="rounded-lg bg-[#F5B731] px-4 py-1.5 font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
                >
                  {savingManual ? 'Salvando...' : 'Registrar lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
