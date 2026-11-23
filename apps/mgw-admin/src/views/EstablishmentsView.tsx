import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Globe,
  PauseCircle,
  PlayCircle,
  Search,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { PendingIntegrationBanner } from '../components/PendingIntegrationBanner';
import { ReasonConfirmModal } from '../components/ReasonConfirmModal';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  fetchEstablishmentMembers,
  fetchEstablishments,
  isPendingMigrationError,
  setEstablishmentStatus,
  setMemberActiveStatus,
  type EstablishmentMemberDetail,
} from '../services/adminApi';
import {
  filterEstablishments,
  type EstablishmentMenuFilter,
  type EstablishmentOnboardingFilter,
  type EstablishmentSubscriptionFilter,
} from '../services/directoryFilters';
import { exportEstablishmentsToExcel } from '../services/exportReports';
import { canMutateTenantsOrPlans, formatCurrencyCents, formatDateBr, formatDateTimeBr } from '../services/rbac';
import type { EstablishmentRecord, PlatformRole } from '../types/admin';

interface EstablishmentsViewProps {
  role: PlatformRole;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
}

const PAGE_SIZE = 50;

export function EstablishmentsView({
  role,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
}: EstablishmentsViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subscriptionFilter, setSubscriptionFilter] =
    useState<EstablishmentSubscriptionFilter>('all');
  const [menuFilter, setMenuFilter] = useState<EstablishmentMenuFilter>('all');
  const [onboardingFilter, setOnboardingFilter] =
    useState<EstablishmentOnboardingFilter>('all');
  const [page, setPage] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [items, setItems] = useState<EstablishmentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedTenant, setSelectedTenant] = useState<EstablishmentRecord | null>(null);

  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<EstablishmentMemberDetail[]>([]);
  const [membersTruncated, setMembersTruncated] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);

  const [pendingStatusAction, setPendingStatusAction] = useState<{
    tenant: EstablishmentRecord;
    nextStatus: 'active' | 'suspended' | 'archived';
  } | null>(null);

  const [pendingMemberAction, setPendingMemberAction] = useState<{
    member: EstablishmentMemberDetail;
    nextActive: boolean;
  } | null>(null);

  const loadData = async (q = search, s = statusFilter, targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEstablishments(q, s, PAGE_SIZE, targetPage * PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
      setSelectedTenant((prev) => {
        if (!prev) return res.items[0] ?? null;
        return res.items.find((t) => t.id === prev.id) ?? (res.items[0] ?? null);
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(search, statusFilter, page);
  }, [refreshTrigger, statusFilter, page]);

  useEffect(() => {
    if (!selectedTenant) {
      setMembers([]);
      setMembersTruncated(false);
      return;
    }

    let active = true;
    setMembersLoading(true);
    setMembersError(null);
    fetchEstablishmentMembers(selectedTenant.id)
      .then((res) => {
        if (!active) return;
        setMembers(res.members);
        setMembersTruncated(res.truncated);
      })
      .catch((err) => {
        if (!active) return;
        setMembersError(err instanceof Error ? err.message : 'Erro ao consultar membros.');
      })
      .finally(() => {
        if (active) setMembersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedTenant?.id, refreshTrigger]);

  const visibleItems = useMemo(
    () =>
      filterEstablishments(items, {
        subscriptionFilter,
        menuFilter,
        onboardingFilter,
      }),
    [items, subscriptionFilter, menuFilter, onboardingFilter],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canMutate = canMutateTenantsOrPlans(role);

  if (error && isPendingMigrationError(error)) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Estabelecimentos (Tenants)</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Controle multi-tenant, proprietários, situação operacional e cardápio digital.
          </p>
        </div>
        <PendingIntegrationBanner
          moduleName="Gestão de Estabelecimentos"
          requiredRpc="admin_list_establishments()"
          detail={error instanceof Error ? error.message : String(error)}
          onRetry={() => void loadData(search, statusFilter, page)}
        />
      </div>
    );
  }

  const handleCopyMenuSlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`/?menu=${slug}`);
      setCopiedSlug(true);
      setTimeout(() => setCopiedSlug(false), 1800);
    } catch {
      setCopiedSlug(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Estabelecimentos (Tenants)</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Controle multi-tenant de lojas, equipe, operação e cardápio digital ({total} registros
            totais · {visibleItems.length} visíveis).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              void loadData(search, statusFilter, 0);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, slug ou e-mail..."
                className="w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              Buscar
            </button>
          </form>

          <button
            type="button"
            onClick={() => exportEstablishmentsToExcel(visibleItems)}
            disabled={visibleItems.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativos' },
              { id: 'suspended', label: 'Suspensos' },
              { id: 'archived', label: 'Arquivados' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPage(0);
                  setStatusFilter(tab.id);
                }}
                className={`rounded px-2.5 py-1 font-medium cursor-pointer whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-[#F5B731] text-slate-900'
                    : 'text-slate-300 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={subscriptionFilter}
            onChange={(e) =>
              setSubscriptionFilter(e.target.value as EstablishmentSubscriptionFilter)
            }
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          >
            <option value="all">Assinatura: Todas</option>
            <option value="trialing">Em Trial</option>
            <option value="paid">Pagantes Ativas</option>
            <option value="exempt">Fundadores / Isentas</option>
            <option value="past_due">Pendente / Carência</option>
            <option value="blocked">Bloqueadas / Canceladas</option>
          </select>

          <select
            value={menuFilter}
            onChange={(e) => setMenuFilter(e.target.value as EstablishmentMenuFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          >
            <option value="all">Cardápio: Todos</option>
            <option value="published">Cardápio Publicado</option>
            <option value="unpublished">Cardápio Oculto</option>
          </select>

          <select
            value={onboardingFilter}
            onChange={(e) => setOnboardingFilter(e.target.value as EstablishmentOnboardingFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          >
            <option value="all">Onboarding: Todos</option>
            <option value="completed">Concluído</option>
            <option value="pending">Pendente</option>
          </select>
        </div>

        {(statusFilter !== 'all' ||
          subscriptionFilter !== 'all' ||
          menuFilter !== 'all' ||
          onboardingFilter !== 'all' ||
          search.trim() !== '') && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setSubscriptionFilter('all');
              setMenuFilter('all');
              setOnboardingFilter('all');
              setPage(0);
              void loadData('', 'all', 0);
            }}
            className="text-xs text-[#F5B731] hover:underline cursor-pointer"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {Boolean(error) && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-200">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Table Column */}
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum estabelecimento corresponde aos filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Estabelecimento</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Assinatura</th>
                    <th className="px-4 py-2.5 font-medium">Cardápio</th>
                    <th className="px-4 py-2.5 font-medium text-right">Equipe</th>
                    <th className="px-4 py-2.5 font-medium text-right">Vendas</th>
                    <th className="px-4 py-2.5 font-medium text-right">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleItems.map((tenant) => {
                    const isSelected = selectedTenant?.id === tenant.id;
                    return (
                      <tr
                        key={tenant.id}
                        onClick={() => setSelectedTenant(tenant)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F5B731]/8' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {tenant.name}
                            {tenant.is_founder_account && (
                              <span className="ml-2 font-mono text-[11px] text-[#F5B731]">
                                · Fundador
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">
                            {tenant.slug} · {tenant.owner_email || 'Sem owner_email'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusIndicator status={tenant.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <StatusIndicator status={tenant.subscription_status} />
                            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                              {formatCurrencyCents(tenant.plan_amount_cents)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusIndicator
                            status={tenant.digital_menu_active ? 'active' : 'ignored'}
                            labelOverride={tenant.digital_menu_active ? 'Publicado' : 'Oculto'}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200 tabular-nums">
                          {tenant.active_members_count}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200 tabular-nums">
                          {tenant.sales_count}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400 tabular-nums">
                          {formatDateBr(tenant.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono tabular-nums">
                Página {page + 1} de {totalPages} · {total} registros
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <span>Próxima</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Establishment Detail Inspector */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 h-fit space-y-5">
          {!selectedTenant ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Selecione um estabelecimento na tabela para inspecionar dados cadastrais, membros,
              operação e cardápio digital.
            </div>
          ) : (
            <>
              {/* Header & Protected Actions */}
              <div className="pb-3 border-b border-slate-200 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-[#F5B731] shrink-0" />
                      <span className="truncate">{selectedTenant.name}</span>
                    </h2>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5 break-all">
                      {selectedTenant.slug} · {selectedTenant.id}
                    </p>
                  </div>
                  <StatusIndicator status={selectedTenant.status} />
                </div>

                {canMutate && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {selectedTenant.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingStatusAction({
                            tenant: selectedTenant,
                            nextStatus: 'suspended',
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/15 cursor-pointer"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        <span>Suspender loja</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingStatusAction({
                            tenant: selectedTenant,
                            nextStatus: 'active',
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/15 cursor-pointer"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        <span>Reativar loja</span>
                      </button>
                    )}

                    {!selectedTenant.is_founder_account &&
                      selectedTenant.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingStatusAction({
                              tenant: selectedTenant,
                              nextStatus: 'archived',
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-slate-100 cursor-pointer"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span>Arquivar</span>
                        </button>
                      )}
                  </div>
                )}
              </div>

              {/* Dados do Estabelecimento & Situacao Operacional */}
              <div className="space-y-2 text-xs">
                <h3 className="font-semibold text-slate-300">Dados &amp; Situação Operacional</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">E-mail proprietário</span>
                    <span className="font-mono text-slate-200 truncate">
                      {selectedTenant.owner_email || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Fuso horário</span>
                    <span className="font-mono text-slate-200">
                      {selectedTenant.timezone || 'America/Manaus'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Onboarding</span>
                    <StatusIndicator
                      status={selectedTenant.onboarding_completed ? 'active' : 'pending'}
                      labelOverride={
                        selectedTenant.onboarding_completed ? 'Concluído' : 'Pendente'
                      }
                    />
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Plano / Assinatura</span>
                    <span className="font-mono text-slate-200 tabular-nums">
                      {selectedTenant.plan_code ?? '—'} ·{' '}
                      {formatCurrencyCents(selectedTenant.plan_amount_cents)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Status assinatura</span>
                    <StatusIndicator status={selectedTenant.subscription_status} />
                  </div>
                  {selectedTenant.trial_ends_at && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Fim do trial</span>
                      <span className="font-mono text-amber-300 tabular-nums">
                        {formatDateTimeBr(selectedTenant.trial_ends_at)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Produtos / Vendas / Pedidos</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {selectedTenant.products_count} / {selectedTenant.sales_count} /{' '}
                      {selectedTenant.online_orders_count}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Última venda</span>
                    <span className="font-mono text-slate-300 tabular-nums">
                      {formatDateTimeBr(selectedTenant.last_sale_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Criado em</span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {formatDateTimeBr(selectedTenant.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cardapio Digital */}
              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-sky-400" />
                    <span>Cardápio Digital</span>
                  </h3>
                  <StatusIndicator
                    status={selectedTenant.digital_menu_active ? 'active' : 'ignored'}
                    labelOverride={selectedTenant.digital_menu_active ? 'Publicado' : 'Oculto'}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono text-slate-300 truncate">
                    {selectedTenant.digital_menu_slug
                      ? `/?menu=${selectedTenant.digital_menu_slug}`
                      : 'Slug não configurado'}
                  </code>
                  {selectedTenant.digital_menu_slug && (
                    <button
                      type="button"
                      onClick={() => void handleCopyMenuSlug(selectedTenant.digital_menu_slug!)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-100 shrink-0 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      <span>{copiedSlug ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Proprietario e Membros */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-[#F5B731]" />
                    <span>
                      Proprietário &amp; Membros ({selectedTenant.active_members_count} ativos)
                    </span>
                  </h3>
                </div>

                {membersLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 rounded bg-slate-100 animate-pulse" />
                    <div className="h-10 rounded bg-slate-100 animate-pulse" />
                  </div>
                ) : membersError ? (
                  <p className="text-[11px] text-amber-300">{membersError}</p>
                ) : members.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Nenhum membro vinculado localizado para este tenant.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.memberId}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {member.fullName || member.email}
                              {member.isFounder && (
                                <span className="ml-1.5 font-mono text-[10px] text-[#F5B731]">
                                  · Fundador
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 truncate">
                              {member.email} · {member.role}
                            </p>
                          </div>
                          <StatusIndicator
                            status={member.memberActive ? 'active' : 'suspended'}
                            labelOverride={member.memberActive ? 'Ativo' : 'Suspenso'}
                          />
                        </div>

                        {canMutate && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingMemberAction({
                                member,
                                nextActive: !member.memberActive,
                              })
                            }
                            className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-slate-100 cursor-pointer"
                          >
                            {member.memberActive ? (
                              <>
                                <UserX className="h-3 w-3 text-rose-400" />
                                <span>Suspender membro</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3 w-3 text-emerald-400" />
                                <span>Reativar membro</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ))}

                    {membersTruncated && (
                      <p className="text-[11px] text-amber-300">
                        Listagem limitada aos primeiros 200 clientes; RPC dedicado de membros por
                        tenant pendente para bases maiores.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirm Tenant Status Mutation */}
      <ReasonConfirmModal
        open={Boolean(pendingStatusAction)}
        title={
          pendingStatusAction?.nextStatus === 'suspended'
            ? 'Suspender estabelecimento'
            : pendingStatusAction?.nextStatus === 'archived'
              ? 'Arquivar estabelecimento'
              : 'Reativar estabelecimento'
        }
        description={
          pendingStatusAction
            ? `Confirma alterar o status de "${pendingStatusAction.tenant.name}" para "${pendingStatusAction.nextStatus}"? Esta ação exige MFA AAL2 e grava auditoria.`
            : ''
        }
        confirmLabel={
          pendingStatusAction?.nextStatus === 'suspended'
            ? 'Suspender loja'
            : pendingStatusAction?.nextStatus === 'archived'
              ? 'Arquivar loja'
              : 'Reativar loja'
        }
        tone={pendingStatusAction?.nextStatus === 'active' ? 'accent' : 'danger'}
        mfaVerified={mfaVerified}
        onRequestMfa={onRequestMfa}
        onClose={() => setPendingStatusAction(null)}
        onConfirm={async (reason) => {
          if (!pendingStatusAction) return;
          await setEstablishmentStatus(
            pendingStatusAction.tenant.id,
            pendingStatusAction.nextStatus,
            reason,
          );
          await loadData(search, statusFilter, page);
        }}
      />

      {/* Confirm Member Status Mutation */}
      <ReasonConfirmModal
        open={Boolean(pendingMemberAction)}
        title={
          pendingMemberAction?.nextActive
            ? 'Reativar membro no estabelecimento'
            : 'Suspender membro no estabelecimento'
        }
        description={
          pendingMemberAction
            ? `Confirma ${pendingMemberAction.nextActive ? 'reativar' : 'suspender'} "${pendingMemberAction.member.email}" (${pendingMemberAction.member.role})?`
            : ''
        }
        confirmLabel={pendingMemberAction?.nextActive ? 'Reativar membro' : 'Suspender membro'}
        tone={pendingMemberAction?.nextActive ? 'accent' : 'danger'}
        mfaVerified={mfaVerified}
        onRequestMfa={onRequestMfa}
        onClose={() => setPendingMemberAction(null)}
        onConfirm={async (reason) => {
          if (!pendingMemberAction) return;
          await setMemberActiveStatus(
            pendingMemberAction.member.memberId,
            pendingMemberAction.nextActive,
            reason,
          );
          if (selectedTenant) {
            const refreshed = await fetchEstablishmentMembers(selectedTenant.id);
            setMembers(refreshed.members);
          }
          await loadData(search, statusFilter, page);
        }}
      />
    </div>
  );
}
