import { useState, type FormEvent } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

interface ReasonConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'warning' | 'danger' | 'accent';
  mfaVerified: boolean;
  onRequestMfa: () => void;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function ReasonConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  tone = 'warning',
  mfaVerified,
  onRequestMfa,
  onClose,
  onConfirm,
}: ReasonConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('Informe um motivo administrativo com pelo menos 3 caracteres.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setSubmitting(false);
    }
  };

  const buttonClasses =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white'
      : tone === 'accent'
        ? 'bg-[#F5B731] hover:bg-[#e5a824] text-[#0B0D11]'
        : 'bg-amber-500 hover:bg-amber-400 text-[#0B0D11]';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-lg border border-[#222733] bg-[#12151C] p-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#222733]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <h2 className="text-base font-bold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-[#1B202C] hover:text-white cursor-pointer"
            aria-label="Fechar confirmação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
          <p className="text-xs leading-relaxed text-slate-300">{description}</p>

          {!mfaVerified && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Esta ação crítica exige sessão elevada <code className="font-mono">MFA AAL2</code> no
                  backend Supabase.
                </span>
              </div>
              <button
                type="button"
                onClick={onRequestMfa}
                className="rounded border border-amber-400/50 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20 cursor-pointer"
              >
                Validar MFA agora
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="audit-reason-input" className="block text-xs font-medium text-slate-300 mb-1.5">
              Motivo obrigatório (registrado em <code className="font-mono">platform_audit_logs</code>)
            </label>
            <textarea
              id="audit-reason-input"
              rows={3}
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva a justificativa operacional ou número do chamado..."
              className="w-full rounded-md border border-[#2A3040] bg-[#0B0D11] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#F5B731] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#2A3040] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#1B202C] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !mfaVerified}
              className={`rounded-md px-4 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${buttonClasses}`}
            >
              {submitting ? 'Processando...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
