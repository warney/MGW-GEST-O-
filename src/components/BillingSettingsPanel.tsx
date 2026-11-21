import { useState } from 'react';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { createMercadoPagoTestCheckout } from '../services/mercadoPago';

interface BillingSettingsPanelProps {
  tenantId: string;
  billingExempt: boolean;
}

export function BillingSettingsPanel({ tenantId, billingExempt }: BillingSettingsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = await createMercadoPagoTestCheckout(tenantId);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o checkout.');
      setLoading(false);
    }
  }

  if (billingExempt) return null;

  return (
    <section className="bg-[#12151C] border border-[#232834] rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-[#F5B731]/10 text-[#F5B731] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[#F3F4F6]">Plano MGW Gestão</h2>
          <p className="text-xs text-[#9CA3AF] mt-1">Assinatura mensal de R$ 49,90. Seu período de teste de 3 dias é controlado pelo MGW Gestão.</p>
        </div>
      </div>
      <div className="rounded-xl border border-[#232834] bg-[#0B0D11] p-4">
        <p className="text-2xl font-bold text-[#F5B731]">R$ 49,90 <span className="text-xs font-medium text-[#9CA3AF]">/ mês</span></p>
        <p className="text-[11px] text-[#9CA3AF] mt-1">Checkout em ambiente de testes do Mercado Pago. Nenhuma cobrança real será feita.</p>
      </div>
      {error && <p role="alert" className="text-xs text-[#FCA5A5]">{error}</p>}
      <button
        type="button"
        onClick={() => void handleCheckout()}
        disabled={loading}
        className="min-h-[44px] w-full sm:w-auto px-5 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando checkout...</> : <>Testar assinatura <ExternalLink className="w-4 h-4" /></>}
      </button>
    </section>
  );
}
