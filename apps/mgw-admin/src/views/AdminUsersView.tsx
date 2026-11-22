import { useEffect, useState, type FormEvent } from 'react';
import { Shield, ShieldAlert, UserPlus } from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import { fetchPlatformAdmins, upsertPlatformAdmin } from '../services/adminApi';
import { formatDateTimeBr, formatRoleLabel } from '../services/rbac';
import type { PlatformAdminUserRecord, PlatformRole } from '../types/admin';

interface AdminUsersViewProps {
  currentAdminUserId: string;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
}

export function AdminUsersView({
  currentAdminUserId,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
}: AdminUsersViewProps) {
  const [admins, setAdmins] = useState<PlatformAdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    email: '',
    fullName: '',
    role: 'support' as PlatformRole,
    active: true,
    notes: '',
    reason: '',
  });

  const loadAdmins = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPlatformAdmins();
      setAdmins(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar administradores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdmins();
  }, [refreshTrigger]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await upsertPlatformAdmin(form);
      setForm({
        email: '',
        fullName: '',
        role: 'support',
        active: true,
        notes: '',
        reason: '',
      });
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar administrador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Equipe Administrativa (MGW Admin)</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Controle de operadores em <code className="font-mono">platform_admins</code>. O banco
          bloqueia auto-escalação de privilégio e protege o último{' '}
          <code className="font-mono">super_admin</code> ativo.
        </p>
      </div>

      {!mfaVerified && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Operações de criação/edição de administradores exigem sessão MFA AAL2.</span>
          </div>
          <button
            type="button"
            onClick={onRequestMfa}
            className="rounded border border-amber-400/50 px-3 py-1 font-semibold hover:bg-amber-500/20 cursor-pointer whitespace-nowrap"
          >
            Validar MFA
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-lg border border-[#222733] bg-[#12151C] overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-[#181C26] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0F1218] text-slate-400 border-b border-[#222733]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Administrador</th>
                    <th className="px-4 py-2.5 font-medium">Papel</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D222E]">
                  {admins.map((adm) => (
                    <tr key={adm.id} className="hover:bg-[#161A23]">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">
                          {adm.full_name || adm.email}
                          {adm.user_id === currentAdminUserId && (
                            <span className="ml-2 font-mono text-[11px] text-[#F5B731]">· Você</span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">{adm.email}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-200">
                        <span className="inline-flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-[#F5B731]" />
                          {formatRoleLabel(adm.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusIndicator
                          status={adm.active ? 'active' : 'suspended'}
                          labelOverride={adm.active ? 'Ativo' : 'Desativado'}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400 tabular-nums">
                        {formatDateTimeBr(adm.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#222733] bg-[#12151C] p-5 h-fit">
          <div className="flex items-center gap-2 pb-3 border-b border-[#222733]">
            <UserPlus className="h-4 w-4 text-[#F5B731]" />
            <h2 className="text-sm font-semibold text-white">Autorizar / Atualizar Admin</h2>
          </div>

          <form onSubmit={handleSubmit} className="pt-4 space-y-3 text-xs">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              O e-mail informado já deve possuir conta real e verificada no Supabase Auth.
            </p>

            <div>
              <label className="block text-slate-300 mb-1">E-mail verificado</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="operador@empresa.com.br"
                className="w-full rounded border border-[#2A3040] bg-[#0B0D11] px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Nome completo</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded border border-[#2A3040] bg-[#0B0D11] px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Papel RBAC</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as PlatformRole }))}
                className="w-full rounded border border-[#2A3040] bg-[#0B0D11] px-2.5 py-2 text-white"
              >
                <option value="support">Suporte (visualização + chamados)</option>
                <option value="finance">Financeiro (visualização + cobrança)</option>
                <option value="super_admin">Super Admin (acesso irrestrito)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span>Acesso administrativo ativo</span>
            </label>

            <div>
              <label className="block text-slate-300 mb-1">Motivo (auditoria)</label>
              <input
                type="text"
                required
                minLength={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex.: Integração de operador de suporte..."
                className="w-full rounded border border-[#2A3040] bg-[#0B0D11] px-3 py-2 text-white"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !mfaVerified || form.reason.trim().length < 3}
              className="w-full rounded bg-[#F5B731] px-4 py-2 text-xs font-semibold text-[#0B0D11] hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar operador administrativo'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
