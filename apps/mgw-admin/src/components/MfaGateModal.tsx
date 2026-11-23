import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, ShieldCheck, X } from 'lucide-react';
import { enrollTotpFactor, getMfaStatus, verifyTotpChallenge } from '../services/adminApi';
import type { MfaFactorSummary } from '../types/admin';

interface MfaGateModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => Promise<void>;
}

export function MfaGateModal({ open, onClose, onVerified }: MfaGateModalProps) {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<MfaFactorSummary[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [enrollData, setEnrollData] = useState<{
    factorId: string;
    qrCodeSvg: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setCode('');
    setEnrollData(null);

    getMfaStatus()
      .then((res) => {
        if (!active) return;
        setFactors(res.verifiedFactors);
        if (res.verifiedFactors.length > 0) {
          setSelectedFactorId(res.verifiedFactors[0].id);
        } else {
          setSelectedFactorId(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao consultar MFA.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const handleStartEnroll = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const enrolled = await enrollTotpFactor('MGW Admin Autenticador');
      setEnrollData(enrolled);
      setSelectedFactorId(enrolled.factorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar configuração TOTP.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFactorId) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyTotpChallenge(selectedFactorId, code);
      await onVerified();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código TOTP inválido.');
    } finally {
      setSubmitting(false);
    }
  };

  const qrImageSrc = enrollData
    ? enrollData.qrCodeSvg.startsWith('data:')
      ? enrollData.qrCodeSvg
      : `data:image/svg+xml;utf8,${encodeURIComponent(enrollData.qrCodeSvg)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-[#F5B731]" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Verificação MFA (AAL2)</h2>
              <p className="text-xs text-slate-400">
                Obrigatória para ações administrativas críticas no banco.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            aria-label="Fechar verificação MFA"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="pt-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Consultando fatores MFA...</div>
          ) : factors.length === 0 && !enrollData ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-slate-300">
                Nenhum autenticador TOTP verificado foi encontrado nesta conta. Configure um
                aplicativo autenticador (Google Authenticator, 1Password, Authy) para elevar a
                sessão ao nível <code className="font-mono text-[#F5B731]">AAL2</code>.
              </p>
              <button
                type="button"
                onClick={handleStartEnroll}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F5B731] px-4 py-2 text-sm font-semibold text-[#0B0D11] hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="h-4 w-4" />
                <span>{submitting ? 'Gerando chave TOTP...' : 'Configurar Autenticador TOTP'}</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              {enrollData && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <p className="text-xs text-slate-300">
                    Escaneie o QR Code no seu aplicativo autenticador ou insira a chave manual:
                  </p>
                  <div className="flex justify-center bg-white rounded p-3 w-fit mx-auto">
                    <img src={qrImageSrc} alt="QR Code TOTP MGW Admin" className="h-36 w-36" />
                  </div>
                  <div className="text-center">
                    <code className="text-[11px] font-mono text-[#F5B731] break-all select-all">
                      {enrollData.secret}
                    </code>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="mfa-totp-code" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Código de 6 dígitos do autenticador
                </label>
                <input
                  id="mfa-totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-slate-900 focus:border-[#F5B731] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  className="flex items-center gap-1.5 rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-[#0B0D11] hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{submitting ? 'Verificando...' : 'Confirmar MFA AAL2'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
