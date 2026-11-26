import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Download,
  Handshake,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ReasonConfirmModal } from '../components/ReasonConfirmModal';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  fetchMgwPartnerCommissions,
  fetchMgwPartners,
  fetchMgwPartnerSettings,
  markMgwPartnerCommissionPaid,
  revealMgwPartnerPix,
  updateMgwPartnerProgram,
  updateMgwPartnerStatus,
  type MgwPartnerAdminRecord,
  type MgwPartnerCommissionRecord,
} from '../services/adminApi';
import { exportPartnerCommissionsToExcel } from '../services/exportReports';
import { formatDateBr } from '../services/rbac';
import type { PlatformRole } from '../types/admin';
import { PartnerProgramManagementView } from './PartnerProgramManagementView';

interface Props {
  role: PlatformRole;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
}

export function PartnersView({ role, mfaVerified, onRequestMfa, refreshTrigger }: Props) {
  const [partners, setPartners] = useState<MgwPartnerAdminRecord[]>([]);
  const [commissions, setCommissions] = useState<MgwPartnerCommissionRecord[]>([]);
  const [percent, setPercent] = useState('15');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [commissionFilter, setCommissionFilter] = useState<'available' | 'paid' | 'all'>('available');
  const [revealedPix, setRevealedPix] = useState<
    Record<string, { pix_key: string; pix_key_type: string; holder_name: string }>
  >({});
  const [pixLoading, setPixLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<MgwPartnerCommissionRecord | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState('');

  const [pendingPartnerStatus, setPendingPartnerStatus] = useState<{
    partner: MgwPartnerAdminRecord;
    nextStatus: 'active' | 'suspended' | 'blocked';
  } | null>(null);

  const canEdit = role === 'super_admin';
  const canView = role === 'super_admin' || role === 'finance';
  const money = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function load() {
    setBusy(true);
    setError('');
    try {
      const [p, s, c] = await Promise.all([
        fetchMgwPartners(),
        fetchMgwPartnerSettings(),
        canView ? fetchMgwPartnerCommissions(commissionFilter) : Promise.resolve([]),
      ]);
      setPartners(p);
      setPercent(String(s.commission_percent));
      setCommissions(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o programa de parceiros.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [refreshTrigger, commissionFilter, role]);

  async function saveSettings() {
    if (!canEdit) return;
    if (!mfaVerified) {
      onRequestMfa();
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const s = await updateMgwPartnerProgram({
        commissionPercent: Number(percent.replace(',', '.')),
        reason,
      });
      setPercent(String(s.commission_percent));
      setReason('');
      setMessage(
        'Percentual atualizado. A nova regra vale somente para conversões futuras.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar as regras.');
    } finally {
      setBusy(false);
    }
  }

  async function showPix(partnerId: string) {
    if (!canEdit) return;
    if (!mfaVerified) {
      onRequestMfa();
      return;
    }
    setPixLoading(partnerId);
    setError('');
    try {
      const details = await revealMgwPartnerPix(partnerId);
      setRevealedPix((current) => ({ ...current, [partnerId]: details }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar a chave Pix.');
    } finally {
      setPixLoading(null);
    }
  }

  async function confirmPayment() {
    if (!selected || !canEdit) return;
    if (!mfaVerified) {
      onRequestMfa();
      return;
    }
    if (paymentReference.trim().length < 8) {
      setPaymentModalError(
        'Informe o identificador da transferência Pix (mínimo 8 caracteres).',
      );
      return;
    }
    setSavingPayment(true);
    setPaymentModalError('');
    setMessage('');
    try {
      const result = await markMgwPartnerCommissionPaid({
        commissionId: selected.id,
        paymentReference: paymentReference.trim(),
        paymentNote: paymentNote.trim(),
      });
      setMessage(
        `Pagamento registrado: ${money(result.amount_cents)}. O saldo do parceiro foi atualizado.`,
      );
      setRevealedPix((current) => {
        const next = { ...current };
        delete next[selected.partner_id];
        return next;
      });
      setSelected(null);
      setPaymentReference('');
      setPaymentNote('');
      await load();
    } catch (e) {
      setPaymentModalError(
        e instanceof Error ? e.message : 'Falha ao registrar o pagamento.',
      );
    } finally {
      setSavingPayment(false);
    }
  }

  const visible = partners.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    const q = partnerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.referral_code.toLowerCase().includes(q)
    );
  });
  const pendingTotal = commissions
    .filter((c) => c.status === 'available')
    .reduce((n, c) => n + c.amount_cents, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-amber-700">Programa de parceiros</p>
          <h1 className="mt-0.5 text-xl font-bold text-slate-900">MGW Parceiros</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Indicações, comissões e pagamentos semanais individuais.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-800"
        >
          {message}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Parceiros cadastrados</span>
            <Handshake className="h-4 w-4 text-amber-700" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {partners.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Indicações convertidas</span>
            <Users className="h-4 w-4 text-sky-700" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {partners.reduce((n, p) => n + p.converted_count, 0)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Comissões a pagar</span>
            <Wallet className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {money(partners.reduce((n, p) => n + p.pending_cents, 0))}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Regras comerciais</h2>
          <p className="mt-1 text-xs text-slate-500">
            Uma única comissão por cliente indicado, no primeiro pagamento de assinatura aprovado. A
            porcentagem e o valor-base ficam registrados na conversão e não mudam retroativamente.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          <label className="block text-xs font-medium text-slate-700">
            <span>Comissão por conversão (%)</span>
            <input
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 disabled:bg-slate-50"
            />
          </label>

          {canEdit && (
            <label className="block text-xs font-medium text-slate-700">
              <span>Motivo da alteração (auditoria)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                placeholder="Motivo obrigatório (mín. 3 caracteres)"
              />
            </label>
          )}
        </div>

        {canEdit ? (
          <div>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={busy || reason.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Salvar regras</span>
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Somente Superadmin pode alterar regras e registrar pagamentos.
          </p>
        )}

        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <CalendarDays className="h-4 w-4 text-amber-700" />
            <span>Pagamentos semanais: toda sexta-feira</span>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Toda sexta-feira o Superadmin confere a fila, realiza cada Pix no banco e registra a
            transferência individual. Valores não pagos continuam disponíveis para a próxima semana.
          </p>
        </div>

        <p className="text-[11px] text-slate-500">
          Repasses automáticos Mercado Pago desativados. A ativação futura exigirá uma etapa separada.
        </p>
      </section>

      {canEdit && (
        <PartnerProgramManagementView mfaVerified={mfaVerified} onRequestMfa={onRequestMfa} />
      )}

      {canView && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Fila de pagamentos</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Cada linha é uma comissão individual; não há consolidação automática.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={commissionFilter}
                onChange={(e) => setCommissionFilter(e.target.value as typeof commissionFilter)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="available">A pagar</option>
                <option value="paid">Pagas</option>
                <option value="all">Todas</option>
              </select>

              <button
                type="button"
                disabled={commissions.length === 0}
                onClick={() => exportPartnerCommissionsToExcel(commissions)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <span className="text-slate-600">Total disponível para pagamento</span>
            <strong className="font-mono text-sm text-slate-900 tabular-nums">
              {money(pendingTotal)}
            </strong>
          </div>

          <div className="space-y-3">
            {commissions.map((c) => (
              <article key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.partner_name}</p>
                    <p className="text-xs font-mono text-slate-500">
                      {c.partner_email} · código {c.referral_code}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 tabular-nums">
                      Conversão em {formatDateBr(c.created_at)} · base{' '}
                      <span className="font-mono">{money(c.base_amount_cents)}</span> · comissão{' '}
                      <span className="font-mono">{c.commission_percent}%</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold font-mono text-slate-900 tabular-nums">
                      {money(c.amount_cents)}
                    </p>
                    <div className="mt-1">
                      <StatusIndicator
                        status={
                          c.status === 'paid'
                            ? 'approved'
                            : c.status === 'available'
                              ? 'pending'
                              : 'cancelled'
                        }
                        labelOverride={
                          c.status === 'paid'
                            ? 'Pago'
                            : c.status === 'available'
                              ? 'A pagar'
                              : c.status === 'cancelled'
                                ? 'Cancelada por estorno'
                                : c.status
                        }
                      />
                    </div>
                  </div>
                </div>

                {canEdit && c.status === 'available' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.has_pix_key ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            revealedPix[c.partner_id]
                              ? setRevealedPix((current) => {
                                  const next = { ...current };
                                  delete next[c.partner_id];
                                  return next;
                                })
                              : void showPix(c.partner_id)
                          }
                          disabled={pixLoading === c.partner_id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>
                            {pixLoading === c.partner_id
                              ? 'Consultando...'
                              : revealedPix[c.partner_id]
                                ? 'Ocultar chave Pix'
                                : 'Exibir chave Pix'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentModalError('');
                            setSelected(c);
                            setPaymentReference('');
                            setPaymentNote('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Registrar Pix realizado</span>
                        </button>
                        {revealedPix[c.partner_id] && (
                          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                            <p className="text-slate-700">
                              <strong className="text-slate-900">
                                {revealedPix[c.partner_id].holder_name}
                              </strong>{' '}
                              · {revealedPix[c.partner_id].pix_key_type}
                            </p>
                            <p className="mt-1 break-all font-mono text-slate-900 select-all">
                              {revealedPix[c.partner_id].pix_key}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-amber-700">
                        Parceiro ainda não cadastrou uma chave Pix.
                      </p>
                    )}
                  </div>
                )}

                {c.status === 'paid' && (
                  <p className="mt-3 text-xs text-emerald-700 font-mono">
                    Pago em {c.paid_at ? formatDateBr(c.paid_at) : '—'} · referência{' '}
                    {c.payment_reference || '—'}
                  </p>
                )}

                {c.reversal_required && (
                  <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">
                    Pagamento da assinatura estornado após repasse. Revisão administrativa necessária.
                  </p>
                )}
              </article>
            ))}

            {!commissions.length && (
              <p className="py-8 text-center text-xs text-slate-500">
                Nenhuma comissão encontrada.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Parceiros cadastrados ({visible.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                placeholder="Nome, e-mail ou código..."
                className="w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="suspended">Suspensos</option>
              <option value="blocked">Bloqueados</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 font-medium">Parceiro</th>
                <th className="px-4 py-2.5 font-medium">Código</th>
                <th className="px-4 py-2.5 font-medium text-right">Indicações</th>
                <th className="px-4 py-2.5 font-medium text-right">Convertidas</th>
                <th className="px-4 py-2.5 font-medium text-right">A pagar</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                {canEdit && <th className="px-4 py-2.5 font-medium text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{p.full_name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{p.email}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Desde {formatDateBr(p.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{p.referral_code}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                    {p.referral_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                    {p.converted_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                    {money(p.pending_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusIndicator
                      status={p.status === 'blocked' ? 'suspended' : p.status}
                      labelOverride={
                        p.status === 'active'
                          ? 'Ativo'
                          : p.status === 'suspended'
                            ? 'Suspenso'
                            : 'Bloqueado'
                      }
                    />
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <select
                        value={p.status}
                        disabled={busy}
                        onChange={(e) => {
                          const nextStatus = e.target.value as 'active' | 'suspended' | 'blocked';
                          if (nextStatus === p.status) return;
                          setPendingPartnerStatus({ partner: p, nextStatus });
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                      >
                        <option value="active">Ativo</option>
                        <option value="suspended">Suspenso</option>
                        <option value="blocked">Bloqueado</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <p className="py-8 text-center text-xs text-slate-500">
              Nenhum parceiro encontrado.
            </p>
          )}
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="partner-payment-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 id="partner-payment-title" className="text-base font-bold text-slate-900">
                  Confirmar Pix realizado
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {selected.partner_name} ·{' '}
                  <span className="font-mono font-semibold">{money(selected.amount_cents)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPaymentModalError('');
                  setSelected(null);
                }}
                disabled={savingPayment}
                className="rounded p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {paymentModalError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {paymentModalError}
              </div>
            )}

            <label className="block text-xs font-medium text-slate-700">
              <span>Identificador da transferência / EndToEnd ID</span>
              <input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                maxLength={180}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                placeholder="Referência informada pelo banco"
              />
            </label>

            <label className="block text-xs font-medium text-slate-700">
              <span>Observação opcional</span>
              <textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Confirme somente depois de realizar o Pix no banco. Esta ação apenas registra o
              pagamento; não transfere dinheiro.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPaymentModalError('');
                  setSelected(null);
                }}
                disabled={savingPayment}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmPayment()}
                disabled={savingPayment || paymentReference.trim().length < 8}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
              >
                {savingPayment ? 'Registrando...' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReasonConfirmModal
        open={Boolean(pendingPartnerStatus)}
        title="Alterar status do parceiro"
        description={
          pendingPartnerStatus
            ? `Confirma alterar o status de "${pendingPartnerStatus.partner.full_name}" para "${
                pendingPartnerStatus.nextStatus === 'active'
                  ? 'Ativo'
                  : pendingPartnerStatus.nextStatus === 'suspended'
                    ? 'Suspenso'
                    : 'Bloqueado'
              }"? Esta ação exige MFA AAL2 e grava auditoria.`
            : ''
        }
        confirmLabel="Confirmar status"
        tone={pendingPartnerStatus?.nextStatus === 'active' ? 'accent' : 'danger'}
        mfaVerified={mfaVerified}
        onRequestMfa={onRequestMfa}
        onClose={() => setPendingPartnerStatus(null)}
        onConfirm={async (auditReason) => {
          if (!pendingPartnerStatus) return;
          await updateMgwPartnerStatus(
            pendingPartnerStatus.partner.id,
            pendingPartnerStatus.nextStatus,
            auditReason,
          );
          await load();
        }}
      />
    </div>
  );
}
