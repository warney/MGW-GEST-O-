import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
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
  onInspectEstablishment?: (tenantId: string) => void;
  onRetry: () => void;
}

type SeriesFilter = 'all' | 'tenants' | 'paid' | 'sales';

export function DashboardView({
  data,
  loading,
  error,
  onNavigate,
  onInspectEstablishment,
  onRetry,
}: DashboardViewProps) {
  const [seriesFilter, setSeriesFilter] = useState<SeriesFilter>('all');
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);

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
      <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-5 text-sm text-rose-700 space-y-3">
        <p className="font-semibold">Não foi possível carregar os indicadores da plataforma</p>
        <p className="text-xs text-rose-700">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-medium hover:bg-rose-500/20 cursor-pointer"
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
  const pendingOnboardingRecent = data.recentTenants.filter((t) => !t.onboarding_completed).length;

  const inspectedMonth =
    data.monthlySeries.find((m) => m.month_key === activeMonthKey) ?? latestMonth;

  const maxTenantsBar = Math.max(1, ...data.monthlySeries.map((m) => m.new_tenants));
  const maxPaidBar = Math.max(1, ...data.monthlySeries.map((m) => m.new_paid));
  const maxSalesBar = Math.max(1, ...data.monthlySeries.map((m) => m.sales_count));

  const attentionItems: {
    id: string;
    label: string;
    detail: string;
    countLabel: string;
    tone: 'danger' | 'warning' | 'neutral';
    moduleId: AdminModuleId;
  }[] = [
    {
      id: 'tickets',
      label: 'Chamados em aberto',
      detail: 'Aguardando atendimento ou acompanhamento da equipe',
      countLabel: String(data.openTicketsCount),
      tone: data.openTicketsCount > 0 ? 'warning' : 'neutral',
      moduleId: 'support',
    },
    {
      id: 'past_due',
      label: 'Assinaturas em carência / atraso',
      detail: 'Tenants próximos do bloqueio automático por cobrança',
      countLabel: String(data.pastDue),
      tone: data.pastDue > 0 ? 'warning' : 'neutral',
      moduleId: 'plans',
    },
    {
      id: 'webhooks',
      label: 'Webhooks com falha',
      detail: 'Eventos de cobrança que exigem inspeção técnica',
      countLabel: String(data.webhookFailedCount),
      tone: data.webhookFailedCount > 0 ? 'danger' : 'neutral',
      moduleId: 'monitoring',
    },
    {
      id: 'onboarding',
      label: 'Onboarding pendente (recentes)',
      detail: 'Novas lojas que ainda não concluíram configuração inicial',
      countLabel: String(pendingOnboardingRecent),
      tone: pendingOnboardingRecent > 0 ? 'warning' : 'neutral',
      moduleId: 'establishments',
    },
  ];

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
          <span aria-hidden="true">·</span>
          <span>
            Pedidos online 30d: <strong className="text-slate-900">{data.onlineOrdersCount30d}</strong>
          </span>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('clients')}
          className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Clientes Cadastrados</span>
            <Users className="h-4 w-4 text-sky-700" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{data.totalClients}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums flex items-center justify-between">
            <span>Contas reais no Supabase Auth</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-700 transition-colors" />
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('establishments')}
          className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Estabelecimentos</span>
            <Building2 className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{data.totalTenants}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums flex items-center justify-between">
            <span>
              {data.activeTenants} ativos · {data.suspendedTenants} suspensos
              {archivedTenants > 0 ? ` · ${archivedTenants} arq.` : ''}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-700 transition-colors" />
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('plans')}
          className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>MRR &amp; Assinaturas</span>
            <TrendingUp className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums font-mono">
            {formatCurrencyCents(data.mrrCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums flex items-center justify-between">
            <span>
              {data.paidActive} pagas · {data.trialActive} trial · {data.founderTenants} fund.
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-700 transition-colors" />
          </p>
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Novos Cadastros (Mês)</span>
            <UserPlus className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{newTenantsThisMonth}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {latestMonth ? `${latestMonth.label} · mês anterior: ${newTenantsPrevMonth}` : 'Sem histórico mensal'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('support')}
          className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Volume Operacional (30d)</span>
            <Activity className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {data.salesCount30d + data.onlineOrdersCount30d}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums flex items-center justify-between">
            <span>
              {data.openTicketsCount} chamados · {data.webhookFailedCount} falhas webhook
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-700 transition-colors" />
          </p>
        </button>
      </div>

      {/* Pending Integration Alert */}
      {(data.webhookFailedCount > 0 || data.pendingPaymentsCount > 0 || data.approvedPaymentsCents === 0) && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Cobrança automática Mercado Pago pendente de ativação no backend. Recebimentos aprovados
              registrados: <strong className="font-mono text-slate-900">{formatCurrencyCents(data.approvedPaymentsCents)}</strong>{' '}
              ({data.pendingPaymentsCount} pendentes · {data.failedPaymentsCount} recusas).
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver Financeiro
          </button>
        </div>
      )}

      {/* Monthly Evolution + Operational Attention Center */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Evolução Mensal (Últimos 6 Meses)</h2>
              <p className="text-xs text-slate-500">
                Novos estabelecimentos, assinaturas pagas ativadas e volume operacional de vendas
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-[11px] self-start">
              {[
                { id: 'all', label: 'Conjunto' },
                { id: 'tenants', label: 'Tenants' },
                { id: 'paid', label: 'Pagas' },
                { id: 'sales', label: 'Vendas' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSeriesFilter(tab.id as SeriesFilter)}
                  className={`rounded-md px-2.5 py-1 font-medium cursor-pointer whitespace-nowrap transition-colors ${
                    seriesFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Readout Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
              {(seriesFilter === 'all' || seriesFilter === 'tenants') && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-[#F5B731]" /> Novos Tenants
                </span>
              )}
              {(seriesFilter === 'all' || seriesFilter === 'paid') && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Novas Pagas
                </span>
              )}
              {(seriesFilter === 'all' || seriesFilter === 'sales') && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" /> Vendas
                </span>
              )}
            </div>

            {inspectedMonth && (
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-700 tabular-nums">
                <span className="font-semibold text-slate-900">{inspectedMonth.label}:</span>
                <span className="text-amber-700">{inspectedMonth.new_tenants} tenants</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700">{inspectedMonth.new_paid} pagas</span>
                <span aria-hidden="true">·</span>
                <span className="text-sky-700">{inspectedMonth.sales_count} vendas</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-6 gap-3 items-end h-44 pt-2">
            {data.monthlySeries.map((point) => {
              const tenantPct = Math.max(8, Math.round((point.new_tenants / maxTenantsBar) * 100));
              const paidPct = Math.max(8, Math.round((point.new_paid / maxPaidBar) * 100));
              const salesPct = Math.max(8, Math.round((point.sales_count / maxSalesBar) * 100));
              const isSelected = inspectedMonth?.month_key === point.month_key;
              return (
                <button
                  key={point.month_key}
                  type="button"
                  onMouseEnter={() => setActiveMonthKey(point.month_key)}
                  onFocus={() => setActiveMonthKey(point.month_key)}
                  onClick={() => setActiveMonthKey(point.month_key)}
                  className={`flex flex-col items-center gap-2 h-full justify-end rounded-lg p-1.5 transition-colors cursor-pointer ${
                    isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-end gap-1.5 w-full justify-center h-32">
                    {(seriesFilter === 'all' || seriesFilter === 'tenants') && (
                      <div
                        className={`${seriesFilter === 'tenants' ? 'w-5' : 'w-3'} rounded-t bg-[#F5B731] transition-all`}
                        style={{ height: `${point.new_tenants === 0 ? 4 : tenantPct}%` }}
                        title={`${point.label}: ${point.new_tenants} novos estabelecimentos`}
                      />
                    )}
                    {(seriesFilter === 'all' || seriesFilter === 'paid') && (
                      <div
                        className={`${seriesFilter === 'paid' ? 'w-5' : 'w-3'} rounded-t bg-emerald-500 transition-all`}
                        style={{ height: `${point.new_paid === 0 ? 4 : paidPct}%` }}
                        title={`${point.label}: ${point.new_paid} assinaturas pagas`}
                      />
                    )}
                    {(seriesFilter === 'all' || seriesFilter === 'sales') && (
                      <div
                        className={`${seriesFilter === 'sales' ? 'w-5' : 'w-3'} rounded-t bg-sky-500 transition-all`}
                        style={{ height: `${point.sales_count === 0 ? 4 : salesPct}%` }}
                        title={`${point.label}: ${point.sales_count} vendas`}
                      />
                    )}
                  </div>
                  <p className={`text-[11px] font-mono ${isSelected ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                    {point.label}
                  </p>
                </button>
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
                  <tr
                    key={point.month_key}
                    onMouseEnter={() => setActiveMonthKey(point.month_key)}
                    className={inspectedMonth?.month_key === point.month_key ? 'bg-amber-50/50' : ''}
                  >
                    <td className="py-1.5 text-slate-700 font-medium">{point.label}</td>
                    <td className="py-1.5 text-right font-semibold text-amber-700">{point.new_tenants}</td>
                    <td className="py-1.5 text-right text-emerald-700">{point.new_paid}</td>
                    <td className="py-1.5 text-right text-sky-700">{point.sales_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Breakdown: Subscriptions + Actionable Operational Attention */}
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
                  <span className="font-mono font-semibold text-amber-700 tabular-nums">{data.trialActive}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Fundadores / Isentos</span>
                  <span className="font-mono font-semibold text-amber-700 tabular-nums">{data.founderTenants}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Carência / Atraso</span>
                  <span className="font-mono text-amber-800 tabular-nums">{data.pastDue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Cancelados / Expirados / Suspensos</span>
                  <span className="font-mono text-rose-700 tabular-nums">{data.cancelledOrExpired}</span>
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
              className="mt-4 w-full rounded-lg border border-slate-200 bg-white py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Gerenciar Planos e Assinaturas
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Central de Atenção</h2>
              <LifeBuoy className="h-4 w-4 text-slate-500" />
            </div>
            <div className="divide-y divide-slate-100">
              {attentionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.moduleId)}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded-md px-1.5 -mx-1.5 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{item.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{item.detail}</p>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                      item.tone === 'danger'
                        ? 'text-rose-700'
                        : item.tone === 'warning'
                          ? 'text-amber-700'
                          : 'text-slate-600'
                    }`}
                  >
                    {item.countLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Establishments */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Novos Estabelecimentos Recentes</h2>
            <p className="text-xs text-slate-500">
              Últimos tenants provisionados na plataforma · clique em uma loja para inspecionar
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('establishments')}
            className="text-xs font-semibold text-amber-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
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
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
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
                  <tr
                    key={tenant.id}
                    onClick={() => {
                      if (onInspectEstablishment) {
                        onInspectEstablishment(tenant.id);
                      } else {
                        onNavigate('establishments');
                      }
                    }}
                    className="hover:bg-amber-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {tenant.name}
                      {tenant.is_founder && (
                        <span className="ml-2 text-[11px] font-mono font-semibold text-amber-700">· Fundador</span>
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
