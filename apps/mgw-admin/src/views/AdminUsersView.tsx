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
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

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
      setEditingEmail(null);
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

  const handleSelectAdmin = (adm: PlatformAdminUserRecord) => {
    setEditingEmail(adm.email);
    setForm({
      email: adm.email,
      fullName: adm.full_name,
      role: adm.role,
      active: adm.active,
      notes: adm.notes,
      reason: '',
    });
  };

  const resetForm = () => {
    setEditingEmail(null);
    setForm({
      email: '',
      fullName: '',
      role: 'support',
      active: true,
      notes: '',
      reason: '',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Equipe Administrativa (MGW Admin)</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Controle de operadores em <code className="font-mono">platform_admins</code>. O banco
          bloqueia auto-escalação de privilégio e protege o último{' '}
          <code className="font-mono">super_admin</code> ativo.
        </p>
      </div>

      {!mfaVerified && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Operações de criação/edição de administradores exigem sessão MFA AAL2.</span>
          </div>
          <button
            type="button"
            onClick={onRequestMfa}
            className="rounded-lg border border-amber-500/50 px-3 py-1 font-semibold hover:bg-amber-500/20 cursor-pointer whitespace-nowrap"
          >
            Validar MFA
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Administrador</th>
                    <th className="px-4 py-2.5 font-medium">Papel</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admins.map((adm) => {
                    const isEditing = editingEmail === adm.email;
                    return (
                      <tr
                        key={adm.id}
                        onClick={() => handleSelectAdmin(adm)}
                        className={`cursor-pointer transition-colors ${
                          isEditing ? 'bg-amber-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">
                            {adm.full_name || adm.email}
                            {adm.user_id === currentAdminUserId && (
                              <span className="ml-2 font-mono text-[11px] font-semibold text-amber-700">
                                · Você
                              </span>
                            )}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500">{adm.email}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-800">
                          <span className="inline-flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-amber-600" />
                            {formatRoleLabel(adm.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusIndicator
                            status={adm.active ? 'active' : 'suspended'}
                            labelOverride={adm.active ? 'Ativo' : 'Desativado'}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                          {formatDateTimeBr(adm.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 h-fit">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {editingEmail ? 'Editar Operador' : 'Autorizar / Atualizar Admin'}
              </h2>
            </div>
            {editingEmail && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] font-medium text-amber-700 hover:underline cursor-pointer"
              >
                Novo
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="pt-4 space-y-3 text-xs">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Clique em um operador na tabela para editar ou informe um e-mail com conta verificada no
              Supabase Auth.
            </p>

            <div>
              <label className="block text-slate-700 font-medium mb-1">E-mail verificado</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="operador@empresa.com.br"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Nome completo</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Papel RBAC</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as PlatformRole }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-900"
              >
                <option value="support">Suporte (visualização + chamados)</option>
                <option value="finance">Financeiro (visualização + cobrança)</option>
                <option value="super_admin">Super Admin (acesso irrestrito)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span>Acesso administrativo ativo</span>
            </label>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Motivo (auditoria)</label>
              <input
                type="text"
                required
                minLength={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex.: Integração de operador de suporte..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !mfaVerified || form.reason.trim().length < 3}
              className="w-full rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar operador administrativo'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
