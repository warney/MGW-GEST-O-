import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  LifeBuoy,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { PendingIntegrationBanner } from '../components/PendingIntegrationBanner';
import { StatusIndicator } from '../components/StatusIndicator';
import { isPendingMigrationError } from '../services/adminApi';
import { formatCurrencyCents, formatDateBr } from '../services/rbac';
import type { AdminModuleId, PlatformOverview } from '../types/admin';

interface DashboardViewProps {
  data: PlatformOverview | null;
  loading: boolean;
  error: unknown;
  onNavigate: (moduleId: AdminModuleId) => void;
  onRetry: () => void;
}

export function DashboardView({
  data,
  loading,
  error,
  onNavigate,
  onRetry,
}: DashboardViewProps) {
  if (error) {
    if (isPendingMigrationError(error)) {
      return (
        <PendingIntegrationBanner
          moduleName="Visão Geral da Plataforma"
          requiredRpc="admin_get_platform_overview()"
          detail={error instanceof Error ? error.message : String(error)}
          onRetry={onRetry}
        />
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-5 text-sm text-rose-200 space-y-3">
        <p className="font-semibold">Não foi possível carregar os indicadores da plataforma</p>
        <p className="text-xs text-rose-300">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-rose-400/40 px-3 py-1.5 text-xs font-medium hover:bg-rose-500/20 cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-28 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const archivedTenants = Math.max(
    0,
    data.totalTenants - data.activeTenants - data.suspendedTenants,
  );
  const latestMonth = data.monthlySeries[data.monthlySeries.length - 1] ?? null;
  const previousMonth =
    data.monthlySeries.length >= 2 ? data.monthlySeries[data.monthlySeries.length - 2] : null;
  const newTenantsThisMonth = latestMonth?.new_tenants ?? 0;
  const newTenantsPrevMonth = previousMonth?.new_tenants ?? 0;

  const maxTenantsBar = Math.max(1, ...data.monthlySeries.map((m) => m.new_tenants));
  const maxPaidBar = Math.max(1, ...data.monthlySeries.map((m) => m.new_paid));
  const maxSalesBar = Math.max(1, ...data.monthlySeries.map((m) => m.sales_count));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Visão Geral da Plataforma</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Indicadores consolidados em tempo real do PostgreSQL Supabase (MGW Gestão &amp; Cardápio Digital).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500 tabular-nums">
          <span>
            Vendas 30d: <strong className="text-slate-900">{data.salesCount30d}</strong>
          </span>
          <span>·</span>
          <span>
            Pedidos online 30d: <strong className="text-slate-900">{data.onlineOrdersCount30d}</strong>
          </span>
        </div>
      </div>

      {/* Primary KPI Grid (5 real categories requested in Fase 4.3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('clients')}
          className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Clientes Cadastrados</span>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{data.totalClients}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Contas reais no Supabase Auth
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('establishments')}
          className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Estabelecimentos</span>
            <Building2 className="h-4 w-4 text-[#F5B731]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{data.totalTenants}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.activeTenants} ativos · {data.suspendedTenants} suspensos
            {archivedTenants > 0 ? ` · ${archivedTenants} arq.` : ''}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('plans')}
          className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Assinaturas &amp; Trials</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-mono">
            {formatCurrencyCents(data.mrrCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.paidActive} pagas · {data.trialActive} em trial · {data.founderTenants} fund.
          </p>
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Novos Cadastros (Mês)</span>
            <UserPlus className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{newTenantsThisMonth}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {latestMonth ? `${latestMonth.label} · mês anterior: ${newTenantsPrevMonth}` : 'Sem histórico mensal'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('support')}
          className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Operacional &amp; Alertas</span>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {data.salesCount30d + data.onlineOrdersCount30d}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.openTicketsCount} chamados · {data.webhookFailedCount} falhas webhook
          </p>
        </button>
      </div>

      {/* Pending Integration Alert */}
      {(data.webhookFailedCount > 0 || data.pendingPaymentsCount > 0 || data.approvedPaymentsCents === 0) && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <AlertTriangle className="h-4 w-4 text-[#F5B731] shrink-0 mt-0.5" />
            <span>
              Cobrança automática Mercado Pago pendente de ativação no backend. Recebimentos aprovados
              registrados: <strong className="font-mono text-slate-900">{formatCurrencyCents(data.approvedPaymentsCents)}</strong>{' '}
              ({data.pendingPaymentsCount} pendentes · {data.failedPaymentsCount} recusas).
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver Financeiro
          </button>
        </div>
      )}

      {/* Monthly Evolution + Subscriptions & Operational Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Evolução Mensal (Últimos 6 Meses)</h2>
              <p className="text-xs text-slate-500">
                Novos estabelecimentos, assinaturas pagas ativadas e volume operacional de vendas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#F5B731]" /> Novos Tenants
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-400" /> Novas Pagas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-sky-400" /> Vendas
              </span>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-3 items-end h-44 pt-2">
            {data.monthlySeries.map((point) => {
              const tenantPct = Math.max(8, Math.round((point.new_tenants / maxTenantsBar) * 100));
              const paidPct = Math.max(8, Math.round((point.new_paid / maxPaidBar) * 100));
              const salesPct = Math.max(8, Math.round((point.sales_count / maxSalesBar) * 100));
              return (
                <div key={point.month_key} className="flex flex-col items-center gap-2 h-full justify-end">
                  <div className="flex items-end gap-1 w-full justify-center h-32">
                    <div
                      className="w-3 rounded-t bg-[#F5B731]/85 transition-all"
                      style={{ height: `${point.new_tenants === 0 ? 4 : tenantPct}%` }}
                      title={`${point.label}: ${point.new_tenants} novos estabelecimentos`}
                    />
                    <div
                      className="w-3 rounded-t bg-emerald-400/80 transition-all"
                      style={{ height: `${point.new_paid === 0 ? 4 : paidPct}%` }}
                      title={`${point.label}: ${point.new_paid} assinaturas pagas`}
                    />
                    <div
                      className="w-3 rounded-t bg-sky-400/75 transition-all"
                      style={{ height: `${point.sales_count === 0 ? 4 : salesPct}%` }}
                      title={`${point.label}: ${point.sales_count} vendas`}
                    />
                  </div>
                  <p className="text-[11px] font-mono text-slate-500">{point.label}</p>
                </div>
              );
            })}
          </div>

          {/* Exact numeric table for monthly figures */}
          <div className="overflow-x-auto border-t border-slate-200 pt-3">
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1.5 font-medium">Mês</th>
                  <th className="py-1.5 font-medium text-right">Novos Tenants</th>
                  <th className="py-1.5 font-medium text-right">Novas Pagas</th>
                  <th className="py-1.5 font-medium text-right">Vendas Registradas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {data.monthlySeries.map((point) => (
                  <tr key={point.month_key}>
                    <td className="py-1.5 text-slate-600">{point.label}</td>
                    <td className="py-1.5 text-right text-[#F5B731]">{point.new_tenants}</td>
                    <td className="py-1.5 text-right text-emerald-400">{point.new_paid}</td>
                    <td className="py-1.5 text-right text-sky-400">{point.sales_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Breakdown: Subscriptions + Operational Indicators */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Assinaturas &amp; Testes</h2>
                <CreditCard className="h-4 w-4 text-slate-500" />
              </div>
              <div className="pt-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Pagantes Ativos (R$ 49,90)</span>
                  <span className="font-mono text-slate-900 tabular-nums">{data.paidActive}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Em Período de Teste (3 dias)</span>
                  <span className="font-mono text-amber-400 tabular-nums">{data.trialActive}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Fundadores / Isentos</span>
                  <span className="font-mono text-[#F5B731] tabular-nums">{data.founderTenants}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Carência / Atraso</span>
                  <span className="font-mono text-amber-300 tabular-nums">{data.pastDue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Cancelados / Expirados / Suspensos</span>
                  <span className="font-mono text-rose-400 tabular-nums">{data.cancelledOrExpired}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-600">Retenção Ativa (6 meses)</span>
                  <span className="font-mono text-slate-700 tabular-nums">{data.retentionActive}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('plans')}
              className="mt-4 w-full rounded-md border border-slate-200 bg-[#0B0D11] py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Gerenciar Planos e Assinaturas
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Indicadores Operacionais</h2>
              <LifeBuoy className="h-4 w-4 text-slate-500" />
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Vendas registradas (30 dias)</span>
                <span className="font-mono text-slate-900 tabular-nums">{data.salesCount30d}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Pedidos cardápio online (30 dias)</span>
                <span className="font-mono text-slate-900 tabular-nums">{data.onlineOrdersCount30d}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Chamados de suporte abertos</span>
                <span className="font-mono text-amber-400 tabular-nums">{data.openTicketsCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Webhooks com falha</span>
                <span className="font-mono text-rose-400 tabular-nums">{data.webhookFailedCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Establishments */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Novos Estabelecimentos Recentes</h2>
            <p className="text-xs text-slate-500">Últimos tenants provisionados na plataforma</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('establishments')}
            className="text-xs font-medium text-[#F5B731] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Gerenciar todos
          </button>
        </div>

        {data.recentTenants.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum estabelecimento registrado até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Estabelecimento</th>
                  <th className="px-4 py-2.5 font-medium">Slug</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Plano / Assinatura</th>
                  <th className="px-4 py-2.5 font-medium">Onboarding</th>
                  <th className="px-4 py-2.5 font-medium text-right">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {tenant.name}
                      {tenant.is_founder && (
                        <span className="ml-2 text-[11px] font-mono text-[#F5B731]">· Fundador</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{tenant.slug}</td>
                    <td className="px-4 py-2.5">
                      <StatusIndicator status={tenant.status} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <span className="font-mono">{tenant.plan_code ?? '—'}</span>
                      <span className="text-slate-500"> · </span>
                      <StatusIndicator status={tenant.subscription_status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusIndicator
                        status={tenant.onboarding_completed ? 'active' : 'pending'}
                        labelOverride={tenant.onboarding_completed ? 'Concluído' : 'Pendente'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                      {formatDateBr(tenant.created_at)}
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
