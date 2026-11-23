import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Store,
  User,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { useNetworkConnectionStatus } from './OfflineIndicator';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onEmailLogin?: (email: string, password: string) => Promise<void>;
  onRegister?: (name: string, storeName: string, email: string, password: string) => Promise<void>;
  onPasswordReset?: (email: string) => Promise<void>;
  supportsEmailAuth?: boolean;
  isSigningIn: boolean;
  errorMessage: string | null;
  initialMode?: 'login' | 'register' | 'reset';
  onModeChange?: (mode: 'login' | 'register' | 'reset') => void;
  onBackToHome?: () => void;
}

type AuthMode = 'login' | 'register' | 'reset';

interface FieldErrors {
  name?: string;
  storeName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function MgwLoginBrandMark() {
  return (
    <div className="inline-flex items-center justify-center gap-2.5 select-none">
      <svg
        width="34"
        height="36"
        viewBox="0 0 36 38"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M11 4.5C15.5 2.5 23.5 3 27 8.5C30 13.2 27.5 19.5 21 23C16.5 25.4 13.5 28.5 14 33.5C8.5 31.8 6 27 7 22C8 17 13.5 14.8 16.5 12C18.5 10.1 17.5 7 11 4.5Z"
          fill="#F5B900"
        />
        <path
          d="M17.5 6.5C21.5 6.8 25 9.6 25.2 13.8C25.4 17.8 21.8 20.6 17.5 22.8"
          stroke="#FFC928"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <div className="text-left leading-none">
        <span className="block font-display text-[20px] font-extrabold tracking-tight text-[#172033]">
          MGW
        </span>
        <span className="block font-display text-[14px] font-semibold tracking-tight text-[#172033] mt-0.5">
          Gestão
        </span>
      </div>
    </div>
  );
}

function GoogleIconMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.27V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.78 1.27 5.38l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0 7.31 0 3.25 2.69 1.27 6.62l4 3.11c.95-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  );
}

export function LoginScreen({
  onGoogleLogin,
  onEmailLogin,
  onRegister,
  onPasswordReset,
  supportsEmailAuth = false,
  isSigningIn,
  errorMessage,
  initialMode = 'login',
  onModeChange,
  onBackToHome,
}: LoginScreenProps) {
  const { isOnline } = useNetworkConnectionStatus();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setLocalError(null);
    setMessage(null);
    setFieldErrors({});
  }, [initialMode]);

  useEffect(() => {
    if (errorMessage) {
      setMessage(null);
    }
  }, [errorMessage]);

  const busy = submitting || isSigningIn;
  const visibleError = localError || errorMessage;

  const baseInputClass =
    'w-full min-h-[46px] px-3.5 rounded-xl bg-[#F8F9FC] border text-sm text-[#172033] placeholder:text-[#9AA3B5] transition-colors focus:bg-white focus:outline-none focus:ring-4';

  const getInputClass = (hasError?: boolean) =>
    `${baseInputClass} ${
      hasError
        ? 'border-[#EF4444] focus:border-[#DC2626] focus:ring-[#EF4444]/15'
        : 'border-[#E8EAF0] focus:border-[#F5B900] focus:ring-[#F5B900]/15'
    }`;

  const labelClass = 'block text-xs font-semibold text-[#172033] mb-1.5';

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    setMessage(null);
    setFieldErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
    onModeChange?.(next);
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (!fieldErrors[field]) return;
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!onEmailLogin || busy) return;

    const cleanEmail = email.trim();
    const nextErrors: FieldErrors = {};
    if (!cleanEmail) {
      nextErrors.email = 'Informe seu e-mail.';
    } else if (!EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = 'Informe um e-mail válido.';
    }
    if (!password) {
      nextErrors.password = 'Informe sua senha.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setLocalError('Confira os campos destacados antes de entrar.');
      setMessage(null);
      return;
    }

    setFieldErrors({});
    setLocalError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await onEmailLogin(cleanEmail, password);
      setMessage('Login realizado com sucesso! Carregando seu painel...');
    } catch (err) {
      setMessage(null);
      setLocalError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!onRegister || busy) return;

    const cleanName = name.trim();
    const cleanStore = storeName.trim();
    const cleanEmail = email.trim();
    const nextErrors: FieldErrors = {};

    if (!cleanName) {
      nextErrors.name = 'Informe seu nome completo.';
    }
    if (!cleanStore) {
      nextErrors.storeName = 'Informe o nome do estabelecimento.';
    }
    if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = 'Informe um e-mail válido.';
    }
    if (password.length < 8) {
      nextErrors.password = 'A senha precisa ter pelo menos 8 caracteres.';
    }
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'As senhas não conferem.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setLocalError(
        nextErrors.password ||
          nextErrors.confirmPassword ||
          nextErrors.email ||
          'Preencha os campos obrigatórios para criar sua conta.',
      );
      setMessage(null);
      return;
    }

    setFieldErrors({});
    setLocalError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await onRegister(cleanName, cleanStore, cleanEmail, password);
      setMessage(
        'Cadastro recebido! Confira seu e-mail para confirmar a conta. Depois, entre com seu e-mail e senha.',
      );
      setPassword('');
      setConfirmPassword('');
      setMode('login');
      onModeChange?.('login');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Não foi possível criar sua conta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!onPasswordReset || busy) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail)) {
      setFieldErrors({ email: 'Informe um e-mail válido para recuperação de senha.' });
      setLocalError('Informe um e-mail válido para recuperação de senha.');
      setMessage(null);
      return;
    }

    setFieldErrors({});
    setLocalError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await onPasswordReset(cleanEmail);
      setMessage(
        'Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.',
      );
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Não foi possível solicitar a recuperação.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const modeHeading =
    mode === 'register'
      ? 'Crie sua conta'
      : mode === 'reset'
        ? 'Recuperar senha'
        : 'Faça login para continuar';

  const modeDescription =
    mode === 'register'
      ? 'Cadastre seu estabelecimento para começar com 3 dias grátis.'
      : mode === 'reset'
        ? 'Digite o e-mail cadastrado para receber o link de redefinição.'
        : 'Gerencie vendas, despesas, produtos e pedidos em um só lugar.';

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-[#F5F6FA] text-[#172033] flex flex-col items-center justify-center px-4 py-6 sm:p-6">
      {/* Subtle warm editorial waves matching the MGW reference */}
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
          <path
            d="M230 0H560V240C485 210 420 155 375 95C335 42 290 15 230 0Z"
            fill="#FFC928"
            fillOpacity="0.16"
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
          <path
            d="M0 185C75 205 145 245 215 295C275 338 355 366 445 380H0V185Z"
            fill="#FFC928"
            fillOpacity="0.2"
          />
        </svg>
      </div>

      {onBackToHome && (
        <div className="relative z-10 w-full max-w-[440px] mb-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#778094] hover:text-[#172033] min-h-[40px] px-2.5 -ml-2.5 rounded-xl hover:bg-white/80 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Voltar para a página inicial</span>
          </button>
        </div>
      )}

      <main className="relative z-10 w-full max-w-[440px] bg-white border border-[#E8EAF0] rounded-[24px] p-6 sm:p-8 shadow-[0_20px_48px_rgba(23,32,51,0.06)]">
        <header className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <MgwLoginBrandMark />
          </div>
          <h1 className="font-display text-xl sm:text-[22px] font-bold tracking-tight text-[#172033]">
            {modeHeading}
          </h1>
          <p className="mt-1.5 text-[13px] sm:text-sm text-[#778094] leading-relaxed max-w-[36ch] mx-auto">
            {modeDescription}
          </p>
        </header>

        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 p-3.5 rounded-xl bg-[#FFFBEB] border border-[#F5B900]/60 text-xs text-[#8A6200] flex items-start gap-2.5"
          >
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" aria-hidden="true" />
            <span>
              Sem conexão com a internet no momento. Verifique sua rede antes de autenticar.
            </span>
          </div>
        )}

        {visibleError && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" aria-hidden="true" />
            <span className="leading-relaxed font-medium">{visibleError}</span>
          </div>
        )}

        {message && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#15803D] flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#16A36A]" aria-hidden="true" />
            <span className="leading-relaxed font-medium">{message}</span>
          </div>
        )}

        {supportsEmailAuth && (
          <div>
            {mode === 'login' && (
              <form
                noValidate
                aria-busy={busy}
                onSubmit={(e) => void handleLogin(e)}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="login-email" className={labelClass}>
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      required
                      placeholder="Seu e-mail"
                      className={`${getInputClass(Boolean(fieldErrors.email))} pl-10`}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p id="login-email-error" className="mt-1.5 text-[11px] font-medium text-[#B91C1C]">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="login-password" className={labelClass}>
                    Senha
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError('password');
                      }}
                      required
                      placeholder="Sua senha"
                      className={`${getInputClass(Boolean(fieldErrors.password))} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={busy}
                      aria-label={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg text-[#778094] hover:text-[#172033] hover:bg-[#E8EAF0]/60 flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p id="login-password-error" className="mt-1.5 text-[11px] font-medium text-[#B91C1C]">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] active:bg-[#E5AD00] text-[#172033] font-bold text-sm shadow-[0_6px_18px_rgba(245,185,0,0.28)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033] focus-visible:ring-offset-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Entrando...</span>
                    </>
                  ) : (
                    <span>Entrar</span>
                  )}
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeMode('reset')}
                    className="min-h-[38px] px-1.5 rounded-lg text-[#778094] hover:text-[#172033] font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
                  >
                    Esqueceu sua senha?
                  </button>
                  {onRegister && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => changeMode('register')}
                      className="min-h-[38px] px-1.5 rounded-lg text-[#8A6200] hover:text-[#172033] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
                    >
                      Criar conta
                    </button>
                  )}
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form
                noValidate
                aria-busy={busy}
                onSubmit={(e) => void handleRegister(e)}
                className="space-y-3.5"
              >
                <div>
                  <label htmlFor="reg-name" className={labelClass}>
                    Seu nome
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reg-name"
                      value={name}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.name)}
                      onChange={(e) => {
                        setName(e.target.value);
                        clearFieldError('name');
                      }}
                      required
                      maxLength={80}
                      autoComplete="name"
                      placeholder="Nome do proprietário"
                      className={`${getInputClass(Boolean(fieldErrors.name))} pl-10`}
                    />
                  </div>
                  {fieldErrors.name && (
                    <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{fieldErrors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="reg-store" className={labelClass}>
                    Nome do estabelecimento
                  </label>
                  <div className="relative">
                    <Store
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reg-store"
                      value={storeName}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.storeName)}
                      onChange={(e) => {
                        setStoreName(e.target.value);
                        clearFieldError('storeName');
                      }}
                      required
                      maxLength={80}
                      placeholder="Minha Lanchonete"
                      className={`${getInputClass(Boolean(fieldErrors.storeName))} pl-10`}
                    />
                  </div>
                  {fieldErrors.storeName && (
                    <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">
                      {fieldErrors.storeName}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="reg-email" className={labelClass}>
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.email)}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      required
                      autoComplete="email"
                      placeholder="seu@email.com"
                      className={`${getInputClass(Boolean(fieldErrors.email))} pl-10`}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="reg-password" className={labelClass}>
                    Senha (mínimo 8 caracteres)
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.password)}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError('password');
                      }}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      className={`${getInputClass(Boolean(fieldErrors.password))} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={busy}
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
                  {fieldErrors.password && (
                    <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="reg-confirm" className={labelClass}>
                    Confirmar senha
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reg-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearFieldError('confirmPassword');
                      }}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Repita sua senha"
                      className={`${getInputClass(Boolean(fieldErrors.confirmPassword))} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      disabled={busy}
                      aria-label={
                        showConfirmPassword ? 'Ocultar confirmação' : 'Visualizar confirmação'
                      }
                      aria-pressed={showConfirmPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg text-[#778094] hover:text-[#172033] hover:bg-[#E8EAF0]/60 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] active:bg-[#E5AD00] text-[#172033] font-bold text-sm shadow-[0_6px_18px_rgba(245,185,0,0.28)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033] focus-visible:ring-offset-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Criando conta...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      <span>Criar conta e estabelecimento</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeMode('login')}
                  className="w-full min-h-[40px] rounded-xl text-xs font-medium text-[#778094] hover:text-[#172033] hover:bg-[#F5F6FA] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
                >
                  Já tenho uma conta · Voltar ao login
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form
                noValidate
                aria-busy={busy}
                onSubmit={(e) => void handleReset(e)}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="reset-email" className={labelClass}>
                    E-mail para recuperação
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.email)}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      required
                      placeholder="seu@email.com"
                      className={`${getInputClass(Boolean(fieldErrors.email))} pl-10`}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="mt-1.5 text-[11px] font-medium text-[#B91C1C]">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-sm font-bold shadow-[0_6px_18px_rgba(245,185,0,0.24)] flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <span>Enviar link de recuperação</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeMode('login')}
                    className="min-h-[46px] px-4 rounded-xl bg-white border border-[#E8EAF0] hover:bg-[#F5F6FA] text-xs font-semibold text-[#172033] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
                  >
                    Voltar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {mode !== 'reset' && (
          <div className={supportsEmailAuth ? 'mt-5' : ''}>
            {supportsEmailAuth && (
              <div className="relative flex items-center justify-center mb-4" aria-hidden="true">
                <div className="w-full border-t border-[#E8EAF0]" />
                <span className="bg-white px-3 text-[11px] font-medium text-[#778094] shrink-0">
                  ou
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                setMessage(null);
                void onGoogleLogin();
              }}
              disabled={busy}
              className={
                supportsEmailAuth
                  ? 'w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-[#E8EAF0] hover:bg-[#F5F6FA] hover:border-[#D5D9E2] text-[#172033] font-semibold text-sm flex items-center justify-center gap-2.5 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]'
                  : 'w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] font-bold text-sm shadow-[0_6px_18px_rgba(245,185,0,0.28)] flex items-center justify-center gap-2.5 cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]'
              }
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <GoogleIconMark />
                  <span>Continuar com Google</span>
                </>
              )}
            </button>
          </div>
        )}

        <footer className="mt-6 pt-4 border-t border-[#E8EAF0] text-[11px] text-[#778094] flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#8A6200] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            Acesso isolado por estabelecimento: seus produtos, vendas, despesas, imagens e cardápio
            seguem protegidos por autenticação e regras individuais.
          </p>
        </footer>
      </main>
    </div>
  );
}
