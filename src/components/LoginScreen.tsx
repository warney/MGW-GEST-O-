import { useState } from 'react';
import { Check, KeyRound, Lock, LogIn, Mail, ShieldAlert } from 'lucide-react';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onEmailLogin?: (email: string, password: string) => Promise<void>;
  onPasswordReset?: (email: string) => Promise<void>;
  supportsEmailAuth?: boolean;
  isSigningIn: boolean;
  errorMessage: string | null;
}

export function LoginScreen({
  onGoogleLogin,
  onEmailLogin,
  onPasswordReset,
  supportsEmailAuth = false,
  isSigningIn,
  errorMessage,
}: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSentMessage, setResetSentMessage] = useState<string | null>(null);
  const [submittingEmail, setSubmittingEmail] = useState(false);

  const visibleError = localError || errorMessage;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onEmailLogin || submittingEmail || isSigningIn) return;
    setLocalError(null);
    setResetSentMessage(null);
    setSubmittingEmail(true);
    try {
      await onEmailLogin(email, password);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Não foi possível entrar.',
      );
    } finally {
      setSubmittingEmail(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onPasswordReset || submittingEmail || isSigningIn) return;
    setLocalError(null);
    setResetSentMessage(null);
    setSubmittingEmail(true);
    try {
      await onPasswordReset(email);
      setResetSentMessage(
        'Se este e-mail estiver cadastrado e verificado, enviaremos as instruções para redefinir sua senha.',
      );
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Não foi possível solicitar a recuperação de senha.',
      );
    } finally {
      setSubmittingEmail(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col items-center justify-center p-4 sm:p-6">
      <main className="w-full max-w-md bg-[#12151C] border border-[#232834] rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731] font-display font-bold text-lg">
            M
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#F3F4F6]">
              MGW GESTÃO
            </h1>
            <p className="text-xs text-[#9CA3AF]">
              Controle financeiro de lanchonetes
            </p>
          </div>
        </div>

        <p className="text-sm text-[#D1D5DB] leading-relaxed mb-6">
          Sistema exclusivo de administração para controle de vendas de X-Saladas,
          despesas, faturamento e lucro líquido em tempo real com backup em nuvem.
        </p>

        {visibleError && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5] flex items-start gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
            <span>{visibleError}</span>
          </div>
        )}

        {resetSentMessage && (
          <div
            role="status"
            className="mb-5 p-3.5 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs text-[#86EFAC] flex items-start gap-2.5"
          >
            <Check className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
            <span>{resetSentMessage}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setLocalError(null);
            void onGoogleLogin();
          }}
          disabled={isSigningIn || submittingEmail}
          className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] active:scale-[0.99] text-[#0B0D11] font-semibold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
        >
          <LogIn className="w-4 h-4" />
          {isSigningIn ? 'Conectando...' : 'Entrar com Google'}
        </button>

        {supportsEmailAuth && (
          <div className="mt-5 pt-5 border-t border-[#232834]">
            {mode === 'login' ? (
              <form
                onSubmit={(e) => void handleEmailSubmit(e)}
                className="space-y-3"
              >
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                  >
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="seu@email.com"
                      className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                  >
                    Senha
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingEmail || isSigningIn}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#232834] hover:border-[#F5B731] bg-[#0B0D11] text-sm font-semibold text-[#F3F4F6] transition-colors cursor-pointer disabled:opacity-60"
                >
                  {submittingEmail ? 'Entrando...' : 'Entrar com E-mail e Senha'}
                </button>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      setResetSentMessage(null);
                      setMode('reset');
                    }}
                    className="text-xs text-[#9CA3AF] hover:text-[#F5B731] transition-colors cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => void handleResetSubmit(e)}
                className="space-y-3"
              >
                <div>
                  <label
                    htmlFor="reset-email"
                    className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                  >
                    E-mail para recuperação de senha
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={submittingEmail || isSigningIn}
                    className="flex-1 min-h-[44px] px-4 rounded-xl border border-[#F5B731]/50 bg-[#0B0D11] hover:border-[#F5B731] text-xs font-semibold text-[#F5B731] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submittingEmail ? 'Enviando...' : 'Enviar link de recuperação'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      setResetSentMessage(null);
                      setMode('login');
                    }}
                    className="min-h-[44px] px-3 rounded-xl border border-[#232834] text-xs text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-[#232834] space-y-2 text-xs text-[#9CA3AF]">
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-[#F5B731] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Acesso restrito a proprietários e administradores autorizados pelo
              estabelecimento, com e-mail verificado e isolamento por conta.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
