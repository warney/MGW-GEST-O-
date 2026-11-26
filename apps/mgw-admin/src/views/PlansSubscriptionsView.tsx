import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Download,
  Edit3,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react';
import { ReasonConfirmModal } from '../components/ReasonConfirmModal';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  fetchPlansAndSubscriptions,
  manageSubscription,
  manageSubscriptionExpiry,
  updatePlan,
} from '../services/adminApi';
import { exportSubscriptionsToExcel } from '../services/exportReports';
import {
  canManageSubscriptions,
  canMutateTenantsOrPlans,
  formatCurrencyCents,
  formatDateBr,
} from '../services/rbac';
import type { AdminSubscriptionRecord, PlanRecord, PlatformRole } from '../types/admin';

interface PlansSubscriptionsViewProps {
  role: PlatformRole;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
  onInspectEstablishment?: (tenantId: string) => void;
}

export function PlansSubscriptionsView({
  role,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
  onInspectEstablishment,
}: PlansSubscriptionsViewProps) {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPlan, setEditingPlan] = useState<PlanRecord | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    amountReais: '49.90',
    maxMembers: '15',
    active: true,
    reason: '',
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [planModalError, setPlanModalError] = useState<string | null>(null);
  const [expiryEditor, setExpiryEditor] = useState<{
    sub: AdminSubscriptionRecord;
    mode: 'extend' | 'set' | 'expire';
    duration: string;
    unit: 'days' | 'months' | 'years';
    expiresAt: string;
    reason: string;
  } | null>(null);
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [expiryModalError, setExpiryModalError] = useState<string | null>(null);

  const [pendingSubAction, setPendingSubAction] = useState<{
    sub: AdminSubscriptionRecord;
    action:
      | 'extend_trial'
      | 'grant_exempt'
      | 'revoke_exempt'
      | 'activate_manual'
      | 'suspend_nonpayment'
      | 'reactivate_tenant';
    days?: number;
    title: string;
    description: string;
    tone: 'warning' | 'danger' | 'accent';
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPlansAndSubscriptions(statusFilter, search);
      setPlans(res.plans);
      setSubscriptions(res.subscriptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar planos e assinaturas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [refreshTrigger, statusFilter]);

  const canEditPlans = canMutateTenantsOrPlans(role);
  const canEditSubs = canManageSubscriptions(role);

  const openPlanEditor = (plan: PlanRecord) => {
    setPlanModalError(null);
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description,
      amountReais: (plan.amount_cents / 100).toFixed(2),
      maxMembers: String(plan.max_members),
      active: plan.active,
      reason: '',
    });
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    const cents = Math.round(Number(planForm.amountReais.replace(',', '.')) * 100);
    const maxMembers = Number(planForm.maxMembers);
    if (!Number.isFinite(cents) || cents < 0) {
      setPlanModalError('Informe um valor válido em reais.');
      return;
    }
    setSavingPlan(true);
    setPlanModalError(null);
    try {
      await updatePlan({
        code: editingPlan.code,
        name: planForm.name,
        description: planForm.description,
        amountCents: cents,
        maxMembers: Number.isFinite(maxMembers) ? maxMembers : editingPlan.max_members,
        active: planForm.active,
        reason: planForm.reason,
      });
      setEditingPlan(null);
      await loadData();
    } catch (err) {
      setPlanModalError(err instanceof Error ? err.message : 'Erro ao atualizar plano.');
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Planos &amp; Assinaturas</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Catálogo oficial MGW Gestão. O preço vigente é definido exclusivamente neste painel.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Plans Catalog */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.code}
            className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-3"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <code className="text-[11px] font-mono font-semibold text-amber-700">{plan.code}</code>
                <StatusIndicator
                  status={plan.active ? 'active' : 'suspended'}
                  labelOverride={plan.active ? 'Ativo' : 'Desativado'}
                />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">{plan.name}</h2>
              <p className="text-xs text-slate-600 leading-relaxed">{plan.description}</p>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-base font-bold font-mono text-slate-900 tabular-nums">
                  {formatCurrencyCents(plan.amount_cents)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  Até {plan.max_members} membros · {plan.billing_interval}
                </p>
              </div>
              {canEditPlans && (
                <button
                  type="button"
                  onClick={() => openPlanEditor(plan)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>Editar</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Subscriptions Management */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Assinaturas por Estabelecimento ({subscriptions.length})
            </h2>
            <p className="text-xs text-slate-500">
              Extensão de trial, controle de validade, isenção administrativa e reativação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            >
              <option value="all">Todos os status</option>
              <option value="trialing">Em Trial</option>
              <option value="authorized">Autorizados (Ativos)</option>
              <option value="exempt">Isentos</option>
              <option value="pending">Pendentes</option>
              <option value="past_due">Em atraso</option>
              <option value="suspended">Suspensos</option>
              <option value="cancelled">Cancelados</option>
              <option value="expired">Expirados</option>
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadData();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar loja..."
                className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Filtrar
              </button>
            </form>

            <button
              type="button"
              disabled={subscriptions.length === 0}
              onClick={() => exportSubscriptionsToExcel(subscriptions)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
          <span>
            Pagas:{' '}
            <strong className="text-emerald-700">
              {subscriptions.filter((s) => ['authorized', 'active'].includes(s.status) && !s.billing_exempt).length}
            </strong>
          </span>
          <span>
            Trial:{' '}
            <strong className="text-amber-700">
              {subscriptions.filter((s) => s.status === 'trialing').length}
            </strong>
          </span>
          <span>
            Isentas:{' '}
            <strong className="text-slate-900">
              {subscriptions.filter((s) => s.billing_exempt || s.status === 'exempt').length}
            </strong>
          </span>
          <span>
            Atraso/Suspensas:{' '}
            <strong className="text-rose-700">
              {subscriptions.filter((s) => ['past_due', 'suspended', 'expired', 'cancelled'].includes(s.status)).length}
            </strong>
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhuma assinatura encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Estabelecimento</th>
                  <th className="px-4 py-2.5 font-medium">Plano</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Trial / Vigência</th>
                  <th className="px-4 py-2.5 font-medium">Retenção</th>
                  {canEditSubs && <th className="px-4 py-2.5 font-medium text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {onInspectEstablishment ? (
                          <button
                            type="button"
                            onClick={() => onInspectEstablishment(sub.tenant_id)}
                            className="font-medium text-slate-900 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer text-left"
                          >
                            <span>{sub.tenant_name}</span>
                            <ArrowUpRight className="h-3 w-3 text-slate-400" />
                          </button>
                        ) : (
                          <p className="font-medium text-slate-900">{sub.tenant_name}</p>
                        )}
                        {sub.is_founder_account && (
                          <span className="font-mono text-[11px] font-semibold text-amber-700">
                            · Fundador
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-slate-500">{sub.tenant_slug}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 tabular-nums">
                      {sub.plan_code} · {formatCurrencyCents(sub.plan_amount_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={sub.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 tabular-nums">
                      {sub.status === 'trialing'
                        ? `Trial até ${formatDateBr(sub.trial_ends_at)}`
                        : `Fim ${formatDateBr(sub.current_period_end)}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 tabular-nums">
                      {sub.retention_status === 'active_retention'
                        ? `Até ${formatDateBr(sub.retention_ends_at)}`
                        : sub.retention_status}
                    </td>
                    {canEditSubs && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setExpiryModalError(null);
                              setExpiryEditor({
                                sub,
                                mode: 'extend',
                                duration: '1',
                                unit: 'days',
                                expiresAt: '',
                                reason: '',
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                          >
                            <CalendarClock className="h-3 w-3" />
                            <span>Alterar validade</span>
                          </button>

                          {!sub.billing_exempt && canEditPlans && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingSubAction({
                                  sub,
                                  action: 'grant_exempt',
                                  title: 'Conceder isenção administrativa',
                                  description: `Marcar "${sub.tenant_name}" como isento de cobrança recorrente.`,
                                  tone: 'warning',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              <ShieldCheck className="h-3 w-3 text-emerald-700" />
                              <span>Isentar</span>
                            </button>
                          )}

                          {sub.billing_exempt && !sub.is_founder_account && canEditPlans && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingSubAction({
                                  sub,
                                  action: 'revoke_exempt',
                                  title: 'Revogar isenção administrativa',
                                  description: `Remover isenção de "${sub.tenant_name}" e retornar à cobrança padrão.`,
                                  tone: 'warning',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              <ShieldOff className="h-3 w-3 text-amber-700" />
                              <span>Revogar isenção</span>
                            </button>
                          )}

                          {sub.status === 'suspended' && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingSubAction({
                                  sub,
                                  action: 'reactivate_tenant',
                                  title: 'Reativar assinatura e loja',
                                  description: `Reativar "${sub.tenant_name}" caso a assinatura possua cobertura vigente.`,
                                  tone: 'accent',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100 cursor-pointer whitespace-nowrap"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reativar</span>
                            </button>
                          )}

                          {!['active', 'authorized'].includes(sub.status) && !sub.is_founder_account && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingSubAction({
                                  sub,
                                  action: 'activate_manual',
                                  title: 'Ativar assinatura manualmente (30d)',
                                  description: `Ativar "${sub.tenant_name}" no valor vigente de ${formatCurrencyCents(sub.plan_amount_cents)} por 30 dias.`,
                                  tone: 'accent',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Ativar 30d</span>
                            </button>
                          )}

                          {!sub.is_founder_account && !['expired', 'suspended', 'exempt'].includes(sub.status) && (
                            <button
                              type="button"
                              onClick={() => {
                                setExpiryModalError(null);
                                setExpiryEditor({
                                  sub,
                                  mode: 'expire',
                                  duration: '1',
                                  unit: 'days',
                                  expiresAt: '',
                                  reason: '',
                                });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              <span>Expirar</span>
                            </button>
                          )}

                          {!sub.is_founder_account && sub.status !== 'suspended' && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingSubAction({
                                  sub,
                                  action: 'suspend_nonpayment',
                                  title: 'Suspender por inadimplência',
                                  description: `Suspender "${sub.tenant_name}" e iniciar retenção oficial de 6 meses.`,
                                  tone: 'danger',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              <span>Suspender</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Editar Plano <code className="font-mono text-amber-700">{editingPlan.code}</code>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPlanModalError(null);
                  setEditingPlan(null);
                }}
                className="rounded p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar edição do plano"
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

            {planModalError && (
              <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                {planModalError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nome do Plano</label>
                <input
                  type="text"
                  value={planForm.name}
                  onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={planForm.amountReais}
                    onChange={(e) => setPlanForm((f) => ({ ...f, amountReais: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Máx. Membros</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={planForm.maxMembers}
                    onChange={(e) => setPlanForm((f) => ({ ...f, maxMembers: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={planForm.active}
                  onChange={(e) => setPlanForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <span>Plano ativo para uso comercial</span>
              </label>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Motivo da alteração (obrigatório)</label>
                <input
                  type="text"
                  value={planForm.reason}
                  onChange={(e) => setPlanForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex.: Ajuste de limite de usuários..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPlanModalError(null);
                  setEditingPlan(null);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPlan || !mfaVerified || planForm.reason.trim().length < 3}
                onClick={handleSavePlan}
                className="rounded-lg bg-[#F5B731] px-4 py-1.5 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
              >
                {savingPlan ? 'Salvando...' : 'Salvar plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {expiryEditor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Alterar validade</h2>
                <p className="mt-1 text-xs text-slate-500">{expiryEditor.sub.tenant_name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExpiryModalError(null);
                  setExpiryEditor(null);
                }}
                className="rounded p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {!mfaVerified && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
                <span>Esta alteração exige MFA AAL2.</span>
                <button
                  type="button"
                  onClick={onRequestMfa}
                  className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                >
                  Validar MFA
                </button>
              </div>
            )}
            {expiryModalError && (
              <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                {expiryModalError}
              </div>
            )}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Como definir o vencimento?</label>
                <select
                  value={expiryEditor.mode}
                  onChange={(e) =>
                    setExpiryEditor((f) =>
                      f ? { ...f, mode: e.target.value as 'extend' | 'set' | 'expire' } : f,
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  <option value="extend">Somar prazo ao vencimento atual</option>
                  <option value="set">Definir uma data específica</option>
                  <option value="expire">Marcar como expirado agora</option>
                </select>
              </div>
              {expiryEditor.mode === 'extend' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Prazo adicional</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={expiryEditor.duration}
                      onChange={(e) =>
                        setExpiryEditor((f) => (f ? { ...f, duration: e.target.value } : f))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    />
                    <select
                      value={expiryEditor.unit}
                      onChange={(e) =>
                        setExpiryEditor((f) =>
                          f ? { ...f, unit: e.target.value as 'days' | 'months' | 'years' } : f,
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    >
                      <option value="days">Dias</option>
                      <option value="months">Meses</option>
                      <option value="years">Anos</option>
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    O prazo será somado ao vencimento atual; se já venceu, começa a contar de hoje.
                  </p>
                </div>
              ) : expiryEditor.mode === 'set' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Nova data e horário de vencimento
                  </label>
                  <input
                    type="datetime-local"
                    value={expiryEditor.expiresAt}
                    onChange={(e) =>
                      setExpiryEditor((f) => (f ? { ...f, expiresAt: e.target.value } : f))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                  O acesso será encerrado imediatamente. O status será marcado como expirado e a retenção de 6 meses será iniciada.
                </p>
              )}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Motivo administrativo (obrigatório)
                </label>
                <textarea
                  rows={2}
                  value={expiryEditor.reason}
                  onChange={(e) =>
                    setExpiryEditor((f) => (f ? { ...f, reason: e.target.value } : f))
                  }
                  placeholder="Ex.: Cortesia concedida ao cliente..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setExpiryModalError(null);
                  setExpiryEditor(null);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  savingExpiry ||
                  !mfaVerified ||
                  expiryEditor.reason.trim().length < 3 ||
                  (expiryEditor.mode === 'extend'
                    ? !(Number(expiryEditor.duration) > 0)
                    : expiryEditor.mode === 'set' && !expiryEditor.expiresAt)
                }
                onClick={async () => {
                  if (!expiryEditor) return;
                  setSavingExpiry(true);
                  setExpiryModalError(null);
                  try {
                    await manageSubscriptionExpiry({
                      tenantId: expiryEditor.sub.tenant_id,
                      mode: expiryEditor.mode,
                      duration:
                        expiryEditor.mode === 'extend' ? Number(expiryEditor.duration) : undefined,
                      unit: expiryEditor.unit,
                      expiresAt:
                        expiryEditor.mode === 'set'
                          ? new Date(expiryEditor.expiresAt).toISOString()
                          : undefined,
                      reason: expiryEditor.reason.trim(),
                    });
                    setExpiryEditor(null);
                    await loadData();
                  } catch (err) {
                    setExpiryModalError(
                      err instanceof Error ? err.message : 'Não foi possível alterar a validade.',
                    );
                  } finally {
                    setSavingExpiry(false);
                  }
                }}
                className="rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
              >
                {savingExpiry
                  ? 'Salvando...'
                  : expiryEditor.mode === 'expire'
                    ? 'Marcar como expirado'
                    : 'Salvar validade'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReasonConfirmModal
        open={Boolean(pendingSubAction)}
        title={pendingSubAction?.title ?? ''}
        description={pendingSubAction?.description ?? ''}
        confirmLabel="Confirmar alteração"
        tone={pendingSubAction?.tone ?? 'warning'}
        mfaVerified={mfaVerified}
        onRequestMfa={onRequestMfa}
        onClose={() => setPendingSubAction(null)}
        onConfirm={async (reason) => {
          if (!pendingSubAction) return;
          await manageSubscription({
            tenantId: pendingSubAction.sub.tenant_id,
            action: pendingSubAction.action,
            days: pendingSubAction.days,
            reason,
          });
          await loadData();
        }}
      />
    </div>
  );
}
