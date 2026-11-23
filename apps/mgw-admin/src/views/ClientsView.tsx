import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import { PendingIntegrationBanner } from '../components/PendingIntegrationBanner';
import { ReasonConfirmModal } from '../components/ReasonConfirmModal';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  fetchClients,
  isPendingMigrationError,
  setMemberActiveStatus,
} from '../services/adminApi';
import {
  buildClientRegistrationHistory,
  filterAndSortClients,
  resolveClientAccountStatus,
  type ClientAccountFilter,
  type ClientRoleFilter,
  type ClientSortOption,
} from '../services/directoryFilters';
import { canMutateTenantsOrPlans, formatDateTimeBr } from '../services/rbac';
import type { ClientMembershipSummary, ClientRecord, PlatformRole } from '../types/admin';

interface ClientsViewProps {
  role: PlatformRole;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
}

const PAGE_SIZE = 50;

export function ClientsView({
  role,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
}: ClientsViewProps) {
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<ClientAccountFilter>('all');
  const [roleFilter, setRoleFilter] = useState<ClientRoleFilter>('all');
  const [sortBy, setSortBy] = useState<ClientSortOption>('newest');
  const [page, setPage] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    membership: ClientMembershipSummary;
    nextActive: boolean;
  } | null>(null);

  const loadClients = async (query = search, targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchClients(query, PAGE_SIZE, targetPage * PAGE_SIZE);
      setClients(res.items);
      setTotal(res.total);
      setSelectedClient((prev) => {
        if (!prev) return res.items[0] ?? null;
        return res.items.find((c) => c.user_id === prev.user_id) ?? (res.items[0] ?? null);
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClients(search, page);
  }, [refreshTrigger, page]);

  const visibleClients = useMemo(
    () => filterAndSortClients(clients, { accountFilter, roleFilter, sortBy }),
    [clients, accountFilter, roleFilter, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canMutate = canMutateTenantsOrPlans(role);

  if (error && isPendingMigrationError(error)) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clientes &amp; Contas Auth</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestão de usuários, vínculos multi-tenant e situação de conta.
          </p>
        </div>
        <PendingIntegrationBanner
          moduleName="Gestão de Clientes"
          requiredRpc="admin_list_clients()"
          detail={error instanceof Error ? error.message : String(error)}
          onRetry={() => void loadClients(search, page)}
        />
      </div>
    );
  }

  const selectedAccountStatus = selectedClient
    ? resolveClientAccountStatus(selectedClient)
    : null;
  const selectedHistory = selectedClient
    ? buildClientRegistrationHistory(selectedClient)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clientes &amp; Contas Auth</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Usuários cadastrados no Supabase Auth com vínculos multi-tenant ({total} contas totais ·{' '}
            {visibleClients.length} visíveis nesta página).
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            void loadClients(search, 0);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou e-mail..."
              className="w-60 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-100 cursor-pointer"
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-slate-400">Situação:</label>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value as ClientAccountFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          >
            <option value="all">Todas as contas</option>
            <option value="verified">E-mail verificado</option>
            <option value="unconfirmed">E-mail não confirmado</option>
            <option value="has_suspended">Com vínculo/loja suspensa</option>
            <option value="platform_admin">Admins da plataforma</option>
          </select>

          <label className="text-slate-400 ml-2">Vínculo:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as ClientRoleFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          >
            <option value="all">Todos os papéis</option>
            <option value="owner">Proprietários (owner)</option>
            <option value="team">Equipe (admin/manager/staff)</option>
            <option value="no_tenant">Sem estabelecimento</option>
          </select>

          <label className="text-slate-400 ml-2">Ordenar:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ClientSortOption)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          >
            <option value="newest">Cadastro mais recente</option>
            <option value="last_sign_in">Último acesso</option>
            <option value="alpha">Ordem alfabética</option>
          </select>
        </div>

        {(accountFilter !== 'all' || roleFilter !== 'all' || search.trim() !== '') && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setAccountFilter('all');
              setRoleFilter('all');
              setSortBy('newest');
              setPage(0);
              void loadClients('', 0);
            }}
            className="text-xs text-[#F5B731] hover:underline cursor-pointer"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {Boolean(error) && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Table Column */}
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : visibleClients.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum cliente encontrado para a busca ou filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                    <th className="px-4 py-2.5 font-medium text-right">Lojas</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cadastro</th>
                    <th className="px-4 py-2.5 font-medium text-right">Último Login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleClients.map((client) => {
                    const isSelected = selectedClient?.user_id === client.user_id;
                    const accountStatus = resolveClientAccountStatus(client);
                    return (
                      <tr
                        key={client.user_id}
                        onClick={() => setSelectedClient(client)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F5B731]/8' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900 flex items-center gap-1.5">
                            <span>{client.full_name || 'Sem nome cadastrado'}</span>
                            {client.is_platform_admin && (
                              <ShieldCheck className="h-3.5 w-3.5 text-[#F5B731]" aria-label="Admin" />
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">{client.email}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusIndicator
                            status={accountStatus.status}
                            labelOverride={accountStatus.label}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-200 tabular-nums">
                          {client.memberships.length}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-400 tabular-nums">
                          {formatDateTimeBr(client.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-400 tabular-nums">
                          {formatDateTimeBr(client.last_sign_in_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
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

        {/* Client Detail + Registration History + Linked Establishments */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 h-fit space-y-5">
          {!selectedClient ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Selecione um cliente na lista ao lado para visualizar detalhes, situação da conta,
              histórico de cadastro e estabelecimentos vinculados.
            </div>
          ) : (
            <>
              <div className="pb-3 border-b border-slate-200 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {selectedClient.full_name || selectedClient.email}
                  </h2>
                  {selectedAccountStatus && (
                    <StatusIndicator
                      status={selectedAccountStatus.status}
                      labelOverride={selectedAccountStatus.label}
                    />
                  )}
                </div>
                <p className="text-xs font-mono text-slate-400 break-all">
                  {selectedClient.email}
                </p>
                <p className="text-[11px] font-mono text-slate-500 break-all">
                  ID: {selectedClient.user_id}
                </p>
              </div>

              {/* Registration & Access History */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#F5B731]" />
                  <span>Histórico de Cadastro &amp; Conta</span>
                </h3>
                <div className="space-y-2 border-l border-slate-200 pl-3 ml-1.5">
                  {selectedHistory.map((item) => (
                    <div key={item.id} className="text-xs space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200">{item.label}</span>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {formatDateTimeBr(item.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Establishments */}
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-300">
                  Estabelecimentos vinculados ({selectedClient.memberships.length})
                </h3>

                {selectedClient.memberships.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhum estabelecimento vinculado em <code className="font-mono">tenant_members</code>.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedClient.memberships.map((m) => (
                      <div
                        key={m.memberId}
                        className="rounded-lg border border-slate-200 bg-white p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 truncate">
                              {m.tenantName}
                              {selectedClient.default_tenant_id === m.tenantId && (
                                <span className="ml-1.5 font-mono text-[10px] text-[#F5B731]">
                                  · Padrão
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 truncate">
                              {m.tenantSlug} · papel: {m.role}
                            </p>
                          </div>
                          <StatusIndicator
                            status={m.memberActive ? 'active' : 'suspended'}
                            labelOverride={m.memberActive ? 'Ativo' : 'Suspenso'}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-200">
                          <span>Loja: {m.tenantStatus}</span>
                          <span>
                            Plano: <code className="font-mono">{m.planCode ?? '—'}</code> (
                            {m.subscriptionStatus ?? '—'})
                          </span>
                        </div>

                        {canMutate && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingAction({
                                membership: m,
                                nextActive: !m.memberActive,
                              })
                            }
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            {m.memberActive ? (
                              <>
                                <UserX className="h-3.5 w-3.5 text-rose-700" />
                                <span>Suspender vínculo</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                                <span>Reativar vínculo</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ReasonConfirmModal
        open={Boolean(pendingAction)}
        title={
          pendingAction?.nextActive
            ? 'Reativar vínculo do cliente'
            : 'Suspender vínculo do cliente'
        }
        description={
          pendingAction
            ? `Confirma alterar o vínculo em "${pendingAction.membership.tenantName}" (${pendingAction.membership.role}) para ${pendingAction.nextActive ? 'ativo' : 'suspenso'}?`
            : ''
        }
        confirmLabel={pendingAction?.nextActive ? 'Reativar vínculo' : 'Suspender vínculo'}
        tone={pendingAction?.nextActive ? 'accent' : 'danger'}
        mfaVerified={mfaVerified}
        onRequestMfa={onRequestMfa}
        onClose={() => setPendingAction(null)}
        onConfirm={async (reason) => {
          if (!pendingAction) return;
          await setMemberActiveStatus(
            pendingAction.membership.memberId,
            pendingAction.nextActive,
            reason,
          );
          await loadClients(search, page);
        }}
      />
    </div>
  );
}
