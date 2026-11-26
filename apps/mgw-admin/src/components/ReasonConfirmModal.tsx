import { useEffect, useState, type FormEvent } from 'react';
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

  useEffect(() => {
    if (!open) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    setReason('');
    setError(null);
    onClose();
  };

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
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : tone === 'accent'
        ? 'bg-[#F5B731] hover:bg-[#e5a824] text-slate-900'
        : 'bg-amber-500 hover:bg-amber-600 text-slate-900';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-confirm-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <h2 id="reason-confirm-title" className="text-base font-bold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            aria-label="Fechar confirmação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
          <p className="text-xs leading-relaxed text-slate-600">{description}</p>

          {!mfaVerified && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Esta ação crítica exige sessão elevada <code className="font-mono font-semibold">MFA AAL2</code> no
                  backend Supabase.
                </span>
              </div>
              <button
                type="button"
                onClick={onRequestMfa}
                className="rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                Validar MFA agora
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="audit-reason-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
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
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !mfaVerified}
              className={`rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${buttonClasses}`}
            >
              {submitting ? 'Processando...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
