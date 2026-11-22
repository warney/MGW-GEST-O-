import { useEffect, useState } from 'react';
import { AlertCircle, DollarSign, Info, Receipt, TrendingUp } from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import { fetchFinanceSummary, fetchPayments } from '../services/adminApi';
import { formatCurrencyCents, formatDateTimeBr } from '../services/rbac';
import type { FinanceSummary, PlatformPaymentRecord } from '../types/admin';

interface FinanceViewProps {
  refreshTrigger: number;
}

export function FinanceView({ refreshTrigger }: FinanceViewProps) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [payments, setPayments] = useState<PlatformPaymentRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFinance = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, payRes] = await Promise.all([
        fetchFinanceSummary(),
        fetchPayments(statusFilter, 100),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Financeiro da Plataforma</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Receita recorrente contratada (MRR/ARR) e histórico de cobranças registradas em{' '}
          <code className="font-mono">platform_payments</code>.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-100 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-200">
            Integração automática com Mercado Pago pendente de ativação
          </p>
          <p className="text-amber-200/85 mt-0.5">
            Os cálculos de MRR e ARR refletem as assinaturas ativas reais na tabela{' '}
            <code className="font-mono">subscriptions</code>. O processamento automático de faturas e
            webhooks financeiros será populado quando o módulo Mercado Pago for habilitado.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-lg border border-[#222733] bg-[#12151C] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>MRR Recorrente</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
              {formatCurrencyCents(summary.mrrCents)}
            </p>
            <p className="mt-1 text-xs text-slate-400 tabular-nums">
              {summary.payingTenants} pagantes · {summary.trialTenants} em trial · {summary.exemptTenants} isentos
            </p>
          </div>

          <div className="rounded-lg border border-[#222733] bg-[#12151C] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>ARR Projetado</span>
              <TrendingUp className="h-4 w-4 text-[#F5B731]" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
              {formatCurrencyCents(summary.arrCents)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Projeção anualizada sobre MRR ativo</p>
          </div>

          <div className="rounded-lg border border-[#222733] bg-[#12151C] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Recebido no Mês</span>
              <Receipt className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
              {formatCurrencyCents(summary.approvedMonthCents)}
            </p>
            <p className="mt-1 text-xs text-slate-400 tabular-nums">
              Total acumulado: {formatCurrencyCents(summary.approvedTotalCents)}
            </p>
          </div>

          <div className="rounded-lg border border-[#222733] bg-[#12151C] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Pendentes / Recusados</span>
              <AlertCircle className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
              {formatCurrencyCents(summary.pendingCents)}
            </p>
            <p className="mt-1 text-xs text-slate-400 tabular-nums">
              {summary.rejectedCount} cobranças recusadas registradas
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#222733] bg-[#12151C] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#222733] flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Histórico de Pagamentos</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-[#2A3040] bg-[#0B0D11] px-2.5 py-1.5 text-xs text-white"
          >
            <option value="all">Todos</option>
            <option value="approved">Aprovados</option>
            <option value="pending">Pendentes</option>
            <option value="rejected">Recusados</option>
            <option value="refunded">Estornados</option>
          </select>
        </div>

        {loading ? (
          <div className="p-6 space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-[#181C26] animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhum pagamento registrado em <code className="font-mono">platform_payments</code> até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1218] text-slate-400 border-b border-[#222733]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Estabelecimento</th>
                  <th className="px-4 py-2.5 font-medium">Provedor / ID</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                  <th className="px-4 py-2.5 font-medium text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D222E]">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-[#161A23]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-white">{pay.tenant_name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{pay.payer_email || '—'}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-300">
                      {pay.provider} · {pay.mp_payment_id || pay.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusIndicator status={pay.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-white tabular-nums">
                      {formatCurrencyCents(pay.amount_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400 tabular-nums">
                      {formatDateTimeBr(pay.paid_at || pay.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
