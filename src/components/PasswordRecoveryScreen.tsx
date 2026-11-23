import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Lock, ShieldAlert } from 'lucide-react';

interface PasswordRecoveryScreenProps {
  onSave: (password: string) => Promise<void>;
  errorMessage?: string | null;
}

export function PasswordRecoveryScreen({ onSave, errorMessage }: PasswordRecoveryScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setLocalError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    try {
      await onSave(password);
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : 'Não foi possível atualizar a senha.',
      );
    } finally {
      setSaving(false);
    }
  }

  const visibleError = localError || errorMessage;
  const inputClass =
    'min-h-[46px] w-full rounded-xl border border-[#E8EAF0] bg-[#F8F9FC] pl-3.5 pr-11 text-sm text-[#172033] placeholder:text-[#9AA3B5] transition-colors focus:bg-white focus:border-[#F5B900] focus:outline-none focus:ring-4 focus:ring-[#F5B900]/15';

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-[#F5F6FA] text-[#172033] flex items-center justify-center px-4 py-6 sm:p-6">
      <div className="pointer-events-none fixed inset-0 overflow-hidden select-none" aria-hidden="true">
        <svg
          className="absolute -top-24 -right-24 w-[420px] h-[320px] sm:w-[560px] sm:h-[400px]"
          viewBox="0 0 560 400"
          fill="none"
        >
          <path
            d="M120 0H560V340C470 315 410 250 355 180C295 104 225 45 120 0Z"
            fill="#F5B900"
            fillOpacity="0.12"
          />
        </svg>
        <svg
          className="absolute -bottom-24 -left-24 w-[440px] h-[300px] sm:w-[620px] sm:h-[380px]"
          viewBox="0 0 620 380"
          fill="none"
        >
          <path
            d="M0 95C95 110 175 160 255 225C340 294 435 340 580 380H0V95Z"
            fill="#F5B900"
            fillOpacity="0.14"
          />
        </svg>
      </div>

      <main className="relative z-10 w-full max-w-[440px] rounded-[24px] border border-[#E8EAF0] bg-white p-6 sm:p-8 shadow-[0_20px_48px_rgba(23,32,51,0.06)]">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#F5B900]/35 bg-[#FFFBEB] text-[#8A6200] shrink-0">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-[#172033] tracking-tight">
              Criar nova senha
            </h1>
            <p className="text-xs font-medium text-[#778094]">MGW Gestão</p>
          </div>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-[#778094]">
          Escolha uma nova senha com pelo menos 8 caracteres para recuperar o acesso à sua conta.
        </p>

        <form
          noValidate
          aria-busy={saving}
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-4"
        >
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-[#172033]">
              Nova senha
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                disabled={saving}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Mínimo 8 caracteres"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={saving}
                aria-label={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg text-[#778094] hover:text-[#172033] hover:bg-[#E8EAF0]/60 flex items-center justify-center cursor-pointer transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-new-password"
              className="mb-1.5 block text-xs font-semibold text-[#172033]"
            >
              Confirmar nova senha
            </label>
            <div className="relative">
              <input
                id="confirm-new-password"
                type={showConfirmation ? 'text' : 'password'}
                value={confirmation}
                disabled={saving}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Repita a nova senha"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowConfirmation((prev) => !prev)}
                disabled={saving}
                aria-label={showConfirmation ? 'Ocultar confirmação' : 'Visualizar confirmação'}
                aria-pressed={showConfirmation}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg text-[#778094] hover:text-[#172033] hover:bg-[#E8EAF0]/60 flex items-center justify-center cursor-pointer transition-colors"
              >
                {showConfirmation ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {visibleError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3.5 text-xs text-[#B91C1C] flex items-start gap-2.5"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" aria-hidden="true" />
              <span className="leading-relaxed font-medium">{visibleError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-sm font-bold text-[#172033] shadow-[0_6px_18px_rgba(245,185,0,0.28)] cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span>Atualizar senha</span>
              </>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
