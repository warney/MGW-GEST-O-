import { useEffect, useState, type FormEvent } from 'react';
import { Save, ShieldAlert } from 'lucide-react';
import { fetchPlatformSettings, updatePlatformSettings } from '../services/adminApi';
import { canMutateTenantsOrPlans, formatDateTimeBr } from '../services/rbac';
import type { PlatformRole, PlatformSettingsRecord } from '../types/admin';

interface SettingsViewProps {
  role: PlatformRole;
  mfaVerified: boolean;
  onRequestMfa: () => void;
  refreshTrigger: number;
}

export function SettingsView({
  role,
  mfaVerified,
  onRequestMfa,
  refreshTrigger,
}: SettingsViewProps) {
  const [settings, setSettings] = useState<PlatformSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const [form, setForm] = useState({
    platformName: 'MGW Gestão',
    trialDays: 3,
    graceDays: 3,
    retentionMonths: 6,
    supportEmail: '',
    supportWhatsapp: '',
    allowPublicSignup: true,
    maintenanceMode: false,
    maintenanceMessage: '',
  });

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlatformSettings();
      setSettings(data);
      setForm({
        platformName: data.platform_name,
        trialDays: data.trial_days,
        graceDays: data.grace_days,
        retentionMonths: data.retention_months,
        supportEmail: data.support_email,
        supportWhatsapp: data.support_whatsapp,
        allowPublicSignup: data.allow_public_signup,
        maintenanceMode: data.maintenance_mode,
        maintenanceMessage: data.maintenance_message,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [refreshTrigger]);

  const isSuperAdmin = canMutateTenantsOrPlans(role);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const updated = await updatePlatformSettings({
        ...form,
        reason,
      });
      setSettings(updated);
      setReason('');
      setSuccessMsg('Configurações globais salvas e registradas na auditoria.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Configurações da Plataforma</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Parâmetros globais de trial, carência, retenção de dados e modo de manutenção.
          {settings && (
            <span className="ml-2 font-mono text-slate-500">
              Última atualização: {formatDateTimeBr(settings.updated_at)}
            </span>
          )}
        </p>
      </div>

      {!isSuperAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
          Modo somente leitura. Apenas <code className="font-mono font-semibold text-amber-700">super_admin</code> pode
          alterar parâmetros globais da plataforma.
        </div>
      )}

      {isSuperAdmin && !mfaVerified && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Valide seu segundo fator (MFA AAL2) para salvar alterações globais.</span>
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

      {successMsg && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-xs text-emerald-700">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
      ) : (
        <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">Nome da Plataforma</label>
              <input
                type="text"
                required
                disabled={!isSuperAdmin}
                value={form.platformName}
                onChange={(e) => setForm((f) => ({ ...f, platformName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">E-mail de Suporte</label>
              <input
                type="email"
                disabled={!isSuperAdmin}
                value={form.supportEmail}
                onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))}
                placeholder="suporte@mgwgestao.com.br"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">WhatsApp de Suporte</label>
              <input
                type="tel"
                disabled={!isSuperAdmin}
                value={form.supportWhatsapp}
                onChange={(e) => setForm((f) => ({ ...f, supportWhatsapp: e.target.value }))}
                placeholder="(92) 99999-0000"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">Dias de Trial Padrão</label>
              <input
                type="number"
                min={1}
                max={90}
                disabled={!isSuperAdmin}
                value={form.trialDays}
                onChange={(e) => setForm((f) => ({ ...f, trialDays: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">Dias de Carência</label>
              <input
                type="number"
                min={0}
                max={30}
                disabled={!isSuperAdmin}
                value={form.graceDays}
                onChange={(e) => setForm((f) => ({ ...f, graceDays: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">Retenção Pós-Encerramento (Meses)</label>
              <input
                type="number"
                min={1}
                max={24}
                disabled={!isSuperAdmin}
                value={form.retentionMonths}
                onChange={(e) => setForm((f) => ({ ...f, retentionMonths: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={form.allowPublicSignup}
                onChange={(e) => setForm((f) => ({ ...f, allowPublicSignup: e.target.checked }))}
              />
              <span>Permitir novos cadastros públicos no MGW Gestão</span>
            </label>

            <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isSuperAdmin}
                checked={form.maintenanceMode}
                onChange={(e) => setForm((f) => ({ ...f, maintenanceMode: e.target.checked }))}
              />
              <span>Ativar sinalizador de modo manutenção</span>
            </label>
          </div>

          {form.maintenanceMode && (
            <div>
              <label className="block text-slate-700 mb-1.5 font-medium">Mensagem de Manutenção</label>
              <textarea
                rows={2}
                disabled={!isSuperAdmin}
                value={form.maintenanceMessage}
                onChange={(e) => setForm((f) => ({ ...f, maintenanceMessage: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
              />
            </div>
          )}

          {isSuperAdmin && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div>
                <label className="block text-slate-700 mb-1.5 font-medium">
                  Motivo da alteração (registrado na auditoria)
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: Ajuste de janela de carência ou contato de suporte..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !mfaVerified || reason.trim().length < 3}
                className="inline-flex items-center gap-2 rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-50 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar configurações globais'}</span>
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
