import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Edit3, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { ReasonConfirmModal } from '../components/ReasonConfirmModal';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  fetchPlansAndSubscriptions,
  manageSubscription,
  updatePlan,
} from '../services/adminApi';
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
}

export function PlansSubscriptionsView({
  role,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
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
  const [expiryEditor, setExpiryEditor] = useState<{
    sub: AdminSubscriptionRecord;
    mode: 'extend' | 'set' | 'expire';
    duration: string;
    unit: 'days' | 'months' | 'years';
    expiresAt: string;
    reason: string;
  } | null>(null);
  const [savingExpiry, setSavingExpiry] = useState(false);

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
      setError('Informe um valor válido em reais.');
      return;
    }
    setSavingPlan(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Erro ao atualizar plano.');
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Planos &amp; Assinaturas</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Catálogo oficial MGW Gestão (R$ 49,90/mês, trial de 3 dias, isenção fundadora e retenção de 6 meses).
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700">
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
                <code className="text-[11px] font-mono text-[#F5B731]">{plan.code}</code>
                <StatusIndicator
                  status={plan.active ? 'active' : 'suspended'}
                  labelOverride={plan.active ? 'Ativo' : 'Desativado'}
                />
              </div>
              <h2 className="text-sm font-semibold text-slate-900">{plan.name}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{plan.description}</p>
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
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-100 cursor-pointer"
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
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Assinaturas por Estabelecimento ({subscriptions.length})
            </h2>
            <p className="text-xs text-slate-400">
              Extensão de trial, isenção administrativa e controle de retenção.
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
              <option value="active">Ativos</option>
              <option value="authorized">Autorizados</option>
              <option value="exempt">Isentos</option>
              <option value="pending">Pendentes</option>
              <option value="past_due">Em atraso</option>
              <option value="suspended">Suspensos</option>
              <option value="cancelled">Cancelados</option>
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
                className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Filtrar
              </button>
            </form>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhuma assinatura encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 border-b border-slate-200">
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
                      <p className="font-medium text-slate-900">
                        {sub.tenant_name}
                        {sub.is_founder_account && (
                          <span className="ml-1.5 font-mono text-[11px] text-[#F5B731]">· Fundador</span>
                        )}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">{sub.tenant_slug}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-200 tabular-nums">
                      {sub.plan_code} · {formatCurrencyCents(sub.plan_amount_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={sub.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">
                      {sub.status === 'trialing'
                        ? `Trial até ${formatDateBr(sub.trial_ends_at)}`
                        : `Fim ${formatDateBr(sub.current_period_end)}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">
                      {sub.retention_status === 'active_retention'
                        ? `Até ${formatDateBr(sub.retention_ends_at)}`
                        : sub.retention_status}
                    </td>
                    {canEditSubs && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setExpiryEditor({
                              sub,
                              mode: 'extend',
                              duration: '1',
                              unit: 'days',
                              expiresAt: '',
                              reason: '',
                            })}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-500/10 cursor-pointer whitespace-nowrap"
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
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              <ShieldCheck className="h-3 w-3 text-emerald-700" />
                              <span>Isentar</span>
                            </button>
                          )}

                          {sub.status !== 'active' && !sub.is_founder_account && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingSubAction({
                                  sub,
                                  action: 'activate_manual',
                                  title: 'Ativar assinatura manualmente (30d)',
                                  description: `Ativar "${sub.tenant_name}" no plano R$ 49,90 por 30 dias.`,
                                  tone: 'accent',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-500/15 cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Ativar 30d</span>
                            </button>
                          )}

                          {!sub.is_founder_account && !['expired', 'suspended', 'exempt'].includes(sub.status) && (
                            <button
                              type="button"
                              onClick={() => setExpiryEditor({
                                sub,
                                mode: 'expire',
                                duration: '1',
                                unit: 'days',
                                expiresAt: '',
                                reason: '',
                              })}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-500/10 cursor-pointer whitespace-nowrap"
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
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-500/15 cursor-pointer whitespace-nowrap"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Editar Plano <code className="font-mono text-[#F5B731]">{editingPlan.code}</code>
              </h2>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!mfaVerified && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 flex items-center justify-between gap-2">
                <span>Requer MFA AAL2 ativo.</span>
                <button
                  type="button"
                  onClick={onRequestMfa}
                  className="rounded-lg border border-amber-400/40 px-2 py-1 text-[11px] font-semibold cursor-pointer"
                >
                  Validar MFA
                </button>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Nome do Plano</label>
                <input
                  type="text"
                  value={planForm.name}
                  onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={planForm.amountReais}
                    onChange={(e) => setPlanForm((f) => ({ ...f, amountReais: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Máx. Membros</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={planForm.maxMembers}
                    onChange={(e) => setPlanForm((f) => ({ ...f, maxMembers: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={planForm.active}
                  onChange={(e) => setPlanForm((f) => ({ ...f, active: e.target.checked }))}
                />
                <span>Plano ativo para uso comercial</span>
              </label>
              <div>
                <label className="block text-slate-300 mb-1">Motivo da alteração (obrigatório)</label>
                <input
                  type="text"
                  value={planForm.reason}
                  onChange={(e) => setPlanForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex.: Ajuste de limite de usuários..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPlan || !mfaVerified || planForm.reason.trim().length < 3}
                onClick={handleSavePlan}
                className="rounded bg-[#F5B731] px-4 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50 cursor-pointer"
              >
                {savingPlan ? 'Salvando...' : 'Salvar plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {expiryEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div><h2 className="text-sm font-bold text-slate-900">Alterar validade</h2><p className="mt-1 text-xs text-slate-500">{expiryEditor.sub.tenant_name}</p></div>
              <button type="button" onClick={() => setExpiryEditor(null)} className="rounded p-1 text-slate-400 hover:text-slate-900" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            {!mfaVerified && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 flex items-center justify-between gap-2"><span>Esta alteração exige MFA AAL2.</span><button type="button" onClick={onRequestMfa} className="rounded-lg border border-amber-400/40 px-2 py-1 text-[11px] font-semibold cursor-pointer">Validar MFA</button></div>}
            <div className="space-y-3 text-xs">
              <div><label className="block text-slate-600 mb-1">Como definir o vencimento?</label>
                <select value={expiryEditor.mode} onChange={(e) => setExpiryEditor((f) => f ? { ...f, mode: e.target.value as 'extend' | 'set' | 'expire' } : f)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900">
                  <option value="extend">Somar prazo ao vencimento atual</option><option value="set">Definir uma data específica</option><option value="expire">Marcar como expirado agora</option>
                </select>
              </div>
              {expiryEditor.mode === 'extend' ? <div><label className="block text-slate-600 mb-1">Prazo adicional</label><div className="grid grid-cols-2 gap-2">
                <input type="number" min="1" max="3650" value={expiryEditor.duration} onChange={(e) => setExpiryEditor((f) => f ? { ...f, duration: e.target.value } : f)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900" />
                <select value={expiryEditor.unit} onChange={(e) => setExpiryEditor((f) => f ? { ...f, unit: e.target.value as 'days' | 'months' | 'years' } : f)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"><option value="days">Dias</option><option value="months">Meses</option><option value="years">Anos</option></select>
              </div><p className="mt-1 text-[11px] text-slate-500">O prazo será somado ao vencimento atual; se já venceu, começa a contar de hoje.</p></div>
              : expiryEditor.mode === 'set' ? <div><label className="block text-slate-600 mb-1">Nova data e horário de vencimento</label><input type="datetime-local" value={expiryEditor.expiresAt} onChange={(e) => setExpiryEditor((f) => f ? { ...f, expiresAt: e.target.value } : f)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900" /></div>
              : <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700">O acesso será encerrado imediatamente. O status será marcado como expirado e a retenção de 6 meses será iniciada.</p>}
              <div><label className="block text-slate-600 mb-1">Motivo administrativo (obrigatório)</label><textarea rows={2} value={expiryEditor.reason} onChange={(e) => setExpiryEditor((f) => f ? { ...f, reason: e.target.value } : f)} placeholder="Ex.: Cortesia concedida ao cliente..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setExpiryEditor(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">Cancelar</button>
              <button type="button" disabled={savingExpiry || !mfaVerified || expiryEditor.reason.trim().length < 3 || (expiryEditor.mode === 'extend' ? !(Number(expiryEditor.duration) > 0) : expiryEditor.mode === 'set' && !expiryEditor.expiresAt)}
                onClick={async () => { if (!expiryEditor) return; setSavingExpiry(true); setError(null); try {
                  await manageSubscriptionExpiry({ tenantId: expiryEditor.sub.tenant_id, mode: expiryEditor.mode, duration: expiryEditor.mode === 'extend' ? Number(expiryEditor.duration) : undefined, unit: expiryEditor.unit, expiresAt: expiryEditor.mode === 'set' ? new Date(expiryEditor.expiresAt).toISOString() : undefined, reason: expiryEditor.reason.trim() });
                  setExpiryEditor(null); await loadData();
                } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar a validade.'); } finally { setSavingExpiry(false); } }}
                className="rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50">{savingExpiry ? 'Salvando...' : expiryEditor.mode === 'expire' ? 'Marcar como expirado' : 'Salvar validade'}</button>
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
