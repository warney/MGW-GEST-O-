import { useEffect, useState } from 'react';
import { CalendarClock, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';

interface Props {
  tenantId: string;
  tenantRole: string;
  subscriptionStatus: string;
  billingExempt: boolean;
}

interface BillingStatus {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelledAt: string | null;
  checkoutCreated: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return 'Não disponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não disponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

const LABELS: Record<string, string> = {
  trialing: 'Período de teste',
  pending: 'Aguardando pagamento',
  authorized: 'Ativa',
  active: 'Ativa',
  paused: 'Pagamento pendente / em carência',
  past_due: 'Pagamento em atraso',
  cancelled: 'Cancelada',
  expired: 'Expirada',
  suspended: 'Suspensa',
  exempt: 'Isenta',
  free: 'Gratuita',
};

export function SubscriptionManagementPanel({ tenantId, tenantRole, subscriptionStatus, billingExempt }: Props) {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadStatus() {
    const { data, error: invokeError } = await getSupabaseClient().functions.invoke('get-mp-subscription-status', { body: { tenantId } });
    if (invokeError) throw invokeError;
    setBilling(data as BillingStatus);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getSupabaseClient().functions.invoke('get-mp-subscription-status', { body: { tenantId } })
      .then(({ data, error: invokeError }) => {
        if (invokeError) throw invokeError;
        if (active) setBilling(data as BillingStatus);
      })
      .catch(() => { if (active) setError('Não foi possível carregar os dados de cobrança.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  async function cancelSubscription() {
    if (working || !window.confirm('Deseja cancelar a renovação da assinatura? O acesso continuará até o fim do período já pago, quando houver.')) return;
    setWorking(true); setError(null); setNotice(null);
    try {
      const { data, error: invokeError } = await getSupabaseClient().functions.invoke('cancel-mp-subscription', { body: { tenantId } });
      if (invokeError) throw invokeError;
      setNotice(data?.currentPeriodEnd
        ? `Renovação cancelada. Seu acesso permanece até ${formatDate(data.currentPeriodEnd)}.`
        : 'Assinatura cancelada.');
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cancelar a assinatura.');
    } finally { setWorking(false); }
  }

  const status = billing?.status || subscriptionStatus;
  const canCancel = tenantRole === 'owner' && !billingExempt && Boolean(billing?.checkoutCreated) && ['authorized', 'active', 'pending', 'paused', 'past_due'].includes(status);

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
        <CreditCard className="w-4 h-4 text-[#D4A000]" /> Assinatura e cobrança
      </div>
      {loading ? <p className="text-xs text-[#6B7280]">Carregando informações...</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#6B7280]">Status atual</span>
            <span className="text-xs font-semibold text-[#111827]">{billingExempt ? 'Conta fundadora isenta' : LABELS[status] || status}</span>
          </div>
          {status === 'trialing' && <div className="flex items-center justify-between gap-2 text-xs"><span className="text-[#6B7280]">Fim do teste grátis</span><span className="font-medium">{formatDate(billing?.trialEndsAt || null)}</span></div>}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[#6B7280] inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Acesso pago até</span>
            <span className="font-medium">{formatDate(billing?.currentPeriodEnd || null)}</span>
          </div>
          {status === 'paused' && <div className="flex items-center justify-between gap-2 text-xs"><span className="text-[#6B7280]">Fim da carência</span><span className="font-medium">{formatDate(billing?.graceUntil || null)}</span></div>}
          {status === 'cancelled' && <p className="text-xs text-[#6B7280]">Cancelamento registrado em {formatDate(billing?.cancelledAt || null)}. Os dados do estabelecimento permanecem preservados.</p>}
        </>
      )}
      {notice && <p role="status" className="text-xs text-green-700">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {billingExempt && <p className="text-xs text-[#6B7280] inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Esta conta não possui cobrança.</p>}
      {canCancel && <button type="button" onClick={() => void cancelSubscription()} disabled={working || loading} className="min-h-[40px] px-4 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold disabled:opacity-60 inline-flex items-center gap-2">
        {working && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Cancelar renovação
      </button>}
      {tenantRole !== 'owner' && <p className="text-xs text-[#6B7280]">Somente o proprietário pode gerenciar a assinatura.</p>}
    </section>
  );
}
