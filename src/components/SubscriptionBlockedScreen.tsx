import { useState } from 'react';
import { Building2, Clock, CreditCard, Lock, LogOut, ShieldAlert } from 'lucide-react';
import type { TenantBillingBlockReason, TenantContext } from '../types/finance';

interface SubscriptionBlockedScreenProps {
  accountEmail: string;
  tenant: TenantContext;
  tenants: TenantContext[];
  onSelectTenant: (tenantId: string) => void;
  onLogout: () => Promise<void>;
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
}: SubscriptionBlockedScreenProps) {
  const [signingOut, setSigningOut] = useState(false);
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
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col items-center justify-center p-4 sm:p-6">
      <main
        data-testid="subscription-blocked-screen"
        className="w-full max-w-lg bg-[#12151C] border border-[#232834] rounded-2xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731] font-display font-bold text-lg">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MGW Gestão</h1>
              <p className="text-xs text-[#9CA3AF] truncate max-w-[220px] sm:max-w-[280px]">
                {tenant.name}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#FCA5A5] text-[11px] font-semibold whitespace-nowrap">
            {copy.badge}
          </span>
        </div>

        <div className="rounded-xl border border-[#232834] bg-[#0B0D11] p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#F3F4F6]">
            <ShieldAlert className="w-4 h-4 text-[#F5B731] shrink-0" />
            <h2>{copy.title}</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#D1D5DB] leading-relaxed">
            {copy.description}
          </p>
        </div>

        <div className="rounded-xl border border-[#F5B731]/30 bg-[#F5B731]/5 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B731]">
              <CreditCard className="w-4 h-4" />
              Plano único MGW Gestão
            </span>
            <span className="text-sm font-bold font-mono text-[#F3F4F6]">
              R$ 49,90/mês
            </span>
          </div>
          <p className="text-xs text-[#D1D5DB] leading-relaxed">
            Inclui controle financeiro completo, catálogo de produtos e combos, cardápio digital e gestão de pedidos online.
          </p>
        </div>

        <div className="space-y-2 text-xs text-[#9CA3AF]">
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-[#22C55E] shrink-0 mt-0.5" />
            <p>
              Todos os seus registros (vendas, despesas, produtos, combos e configurações) permanecem preservados na sua conta.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-[#F5B731] shrink-0 mt-0.5" />
            <p>
              A contratação direta pelo sistema estará disponível após a ativação do módulo de pagamentos. Sua sessão permanece autenticada como{' '}
              <span className="text-[#D1D5DB] font-medium break-all">{accountEmail}</span>.
            </p>
          </div>
        </div>

        {hasMultipleTenants && (
          <div className="pt-2 border-t border-[#232834]">
            <label
              htmlFor="blocked-tenant-select"
              className="flex items-center gap-1.5 text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-[#F5B731]" />
              Alternar para outro estabelecimento vinculado
            </label>
            <select
              id="blocked-tenant-select"
              value={tenant.tenantId}
              onChange={(e) => onSelectTenant(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-xs text-[#F3F4F6]"
            >
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name} {t.accessAllowed === false ? '(bloqueado)' : '(ativo)'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pt-4 border-t border-[#232834] flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleLogoutClick()}
            disabled={signingOut}
            className="min-h-[42px] px-4 rounded-xl border border-[#232834] hover:border-[#374151] text-xs font-semibold text-[#D1D5DB] hover:text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" />
            {signingOut ? 'Saindo...' : 'Sair da conta'}
          </button>
        </div>
      </main>
    </div>
  );
}
