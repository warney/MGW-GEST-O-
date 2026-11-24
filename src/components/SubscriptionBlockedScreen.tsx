import { useEffect, useState } from 'react';
import { Building2, Clock, CreditCard, Lock, LogOut, ShieldAlert } from 'lucide-react';
import type { TenantBillingBlockReason, TenantContext } from '../types/finance';

interface SubscriptionBlockedScreenProps {
  accountEmail: string;
  tenant: TenantContext;
  tenants: TenantContext[];
  onSelectTenant: (tenantId: string) => void;
  onLogout: () => Promise<void>;
  onSubscribe: (tenantId: string) => Promise<void>;
}

function getBlockCopy(reason: TenantBillingBlockReason | null | undefined): {
  title: string;
  description: string;
  badge: string;
} {
  switch (reason) {
    case 'trial_expired':
      return {
        badge: 'Teste grátis encerrado',
        title: 'Seu período de teste de 3 dias terminou',
        description:
          'O acesso gratuito inicial de 3 dias chegou ao fim. Ative o plano mensal do MGW Gestão para liberar imediatamente o painel administrativo e o cardápio digital.',
      };
    case 'grace_expired':
      return {
        badge: 'Carência vencida',
        title: 'Prazo de regularização encerrado',
        description:
          'O período de tolerância de 3 dias após a pendência de pagamento foi concluído. Regularize sua assinatura para retomar a operação completa.',
      };
    case 'cancelled_ended':
      return {
        badge: 'Assinatura encerrada',
        title: 'Ciclo da assinatura cancelada concluído',
        description:
          'O acesso permaneceu ativo até o fim do período já pago e agora foi encerrado. Reative sua assinatura para continuar operando no MGW Gestão.',
      };
    case 'retention_active':
      return {
        badge: 'Conta em retenção',
        title: 'Estabelecimento em período de retenção',
        description:
          'Seus dados históricos estão preservados com segurança durante o período de retenção, mas o painel e o cardápio digital permanecem bloqueados até a reativação.',
      };
    case 'tenant_suspended':
      return {
        badge: 'Estabelecimento suspenso',
        title: 'Acesso temporariamente suspenso',
        description:
          'Este estabelecimento está temporariamente suspenso. Entre em contato com o suporte administrativo para verificar o motivo e regularizar o acesso.',
      };
    case 'subscription_missing':
    case 'billing_pending':
    default:
      return {
        badge: 'Assinatura pendente',
        title: 'Ativação da assinatura necessária',
        description:
          'Este estabelecimento não possui uma assinatura ativa ou período de teste válido no momento. Ative o plano mensal do MGW Gestão para liberar o acesso.',
      };
  }
}

export function SubscriptionBlockedScreen({
  accountEmail,
  tenant,
  tenants,
  onSelectTenant,
  onLogout,
  onSubscribe,
}: SubscriptionBlockedScreenProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('billing') !== 'return') return;
    let active = true;
    let attempts = 0;
    setCheckingPayment(true);
    const check = async () => {
      attempts += 1;
      try {
        const { data, error } = await (await import('../lib/supabase')).getSupabaseClient().functions.invoke('get-mp-subscription-status', { body: { tenantId: tenant.tenantId } });
        if (error) throw error;
        if (!active) return;
        if (data?.status === 'authorized' || data?.status === 'active') {
          setPaymentConfirmed(true);
          window.history.replaceState({}, '', window.location.pathname);
          window.location.reload();
          return;
        }
        if (attempts >= 12) setCheckingPayment(false);
      } catch {
        if (active && attempts >= 12) setCheckingPayment(false);
      }
    };
    void check();
    const timer = window.setInterval(() => { if (attempts < 12) void check(); else window.clearInterval(timer); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [tenant.tenantId]);

  async function handleSubscribe() {
    if (submitting) return;
    setSubmitting(true);
    setBillingError(null);
    try { await onSubscribe(tenant.tenantId); }
    catch (error) { setBillingError(error instanceof Error ? error.message : 'Não foi possível iniciar a contratação.'); }
    finally { setSubmitting(false); }
  }
  const copy = getBlockCopy(tenant.accessBlockReason);
  const hasMultipleTenants = tenants.length > 1;

  async function handleLogoutClick() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] flex flex-col items-center justify-center p-4 sm:p-6">
      <main
        data-testid="subscription-blocked-screen"
        className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#EAB308]/15 border border-[#EAB308]/30 flex items-center justify-center text-[#EAB308] font-display font-bold text-lg">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MGW Gestão</h1>
              <p className="text-xs text-[#6B7280] truncate max-w-[220px] sm:max-w-[280px]">
                {tenant.name}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#FCA5A5] text-[11px] font-semibold whitespace-nowrap">
            {copy.badge}
          </span>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#111827]">
            <ShieldAlert className="w-4 h-4 text-[#EAB308] shrink-0" />
            <h2>{copy.title}</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#4B5563] leading-relaxed">
            {copy.description}
          </p>
        </div>

        <div className="rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/5 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#EAB308]">
              <CreditCard className="w-4 h-4" />
              Plano único MGW Gestão
            </span>
            <span className="text-sm font-bold font-mono text-[#111827]">
              R$ 49,90/mês
            </span>
          </div>
          <p className="text-xs text-[#4B5563] leading-relaxed">
            Inclui controle financeiro completo, catálogo de produtos e combos, cardápio digital e gestão de pedidos online.
          </p>
        </div>

        <div className="space-y-2 text-xs text-[#6B7280]">
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-[#22C55E] shrink-0 mt-0.5" />
            <p>
              Todos os seus registros (vendas, despesas, produtos, combos e configurações) permanecem preservados na sua conta.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-[#EAB308] shrink-0 mt-0.5" />
            <p>Contrate com segurança pelo checkout do Mercado Pago. Sua sessão permanece autenticada como <span className="text-[#4B5563] font-medium break-all">{accountEmail}</span>.</p>
          </div>
        </div>

        {checkingPayment && <p role="status" className="text-xs text-[#EAB308]">Estamos confirmando seu pagamento com o Mercado Pago. Esta tela será atualizada automaticamente.</p>}
        {paymentConfirmed && <p role="status" className="text-xs text-green-600">Pagamento confirmado. Atualizando seu acesso...</p>}
        {billingError && <p role="alert" className="text-xs text-red-600">{billingError}</p>}
        {tenant.role === 'owner' && !tenant.billingExempt && (
          <button type="button" onClick={() => void handleSubscribe()} disabled={submitting || checkingPayment} className="w-full min-h-[48px] rounded-xl bg-[#EAB308] hover:bg-[#FACC15] text-[#111827] font-bold text-sm disabled:opacity-60">
            {submitting ? 'Preparando checkout...' : checkingPayment ? 'Confirmando pagamento...' : 'Assinar agora — R$ 49,90/mês'}
          </button>
        )}

        {hasMultipleTenants && (
          <div className="pt-2 border-t border-[#E5E7EB]">
            <label
              htmlFor="blocked-tenant-select"
              className="flex items-center gap-1.5 text-xs font-medium text-[#4B5563] mb-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-[#EAB308]" />
              Alternar para outro estabelecimento vinculado
            </label>
            <select
              id="blocked-tenant-select"
              value={tenant.tenantId}
              onChange={(e) => onSelectTenant(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-xs text-[#111827]"
            >
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name} {t.accessAllowed === false ? '(bloqueado)' : '(ativo)'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pt-4 border-t border-[#E5E7EB] flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleLogoutClick()}
            disabled={signingOut}
            className="min-h-[42px] px-4 rounded-xl border border-[#E5E7EB] hover:border-[#374151] text-xs font-semibold text-[#4B5563] hover:text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" />
            {signingOut ? 'Saindo...' : 'Sair da conta'}
          </button>
        </div>
      </main>
    </div>
  );
}
