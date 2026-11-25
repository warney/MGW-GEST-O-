import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';

interface PartnerAccessScreenProps {
  mode: 'login' | 'register';
  busy: boolean;
  errorMessage: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  onNavigate: (path: string) => void;
}

export function PartnerAccessScreen({
  mode,
  busy,
  errorMessage,
  onLogin,
  onRegister,
  onForgotPassword,
  onNavigate,
}: PartnerAccessScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === 'register';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting) return;
    const cleanEmail = email.trim().toLowerCase();
    setLocalError(null);
    setNotice(null);

    if (isRegister) {
      if (name.trim().length < 2) {
        setLocalError('Informe seu nome completo.');
        return;
      }
      if (password.length < 8) {
        setLocalError('A senha precisa ter pelo menos 8 caracteres.');
        return;
      }
      if (password !== confirmation) {
        setLocalError('As senhas não conferem.');
        return;
      }
    } else if (!password) {
      setLocalError('Informe sua senha.');
      return;
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        await onRegister(name.trim(), cleanEmail, password);
        setPassword('');
        setConfirmation('');
        setNotice('Cadastro realizado. Enviamos um link de confirmação para seu e-mail. Após confirmar, entre para acessar seu portal.');
      } else {
        await onLogin(cleanEmail, password);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setLocalError('Informe seu e-mail para receber o link de recuperação.');
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    setNotice(null);
    try {
      await onForgotPassword(cleanEmail);
      setNotice('Se a conta existir, enviaremos as instruções de recuperação para seu e-mail.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível solicitar a recuperação.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full min-h-[48px] rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] pl-11 pr-4 text-sm text-[#172033] outline-none transition focus:border-[#D5A300] focus:bg-white focus:ring-4 focus:ring-[#F5B900]/10 disabled:opacity-60';

  return (
    <main className="min-h-screen bg-[#F5F6FA] px-4 py-8 flex items-center justify-center text-[#172033]">
      <div className="w-full max-w-[460px]">
        <button type="button" onClick={() => onNavigate('/')} className="mb-5 inline-flex min-h-[40px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-[#667085] hover:bg-white hover:text-[#172033]">
          <ArrowLeft className="h-4 w-4" /> Voltar ao MGW Gestão
        </button>
        <section className="rounded-[26px] border border-[#E6E8EE] bg-white p-6 shadow-[0_18px_50px_rgba(23,32,51,0.07)] sm:p-9">
          <header className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF7D6] text-[#9A7000]">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A87500]">MGW Parceiros</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{isRegister ? 'Faça parte da rede' : 'Acesse seu portal'}</h1>
            <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-[#667085]">
              {isRegister
                ? 'Crie sua conta gratuita e indique negócios para conhecer o MGW Gestão.'
                : 'Entre para acompanhar suas indicações e sua conta de parceiro.'}
            </p>
          </header>

          {(localError || errorMessage) && (
            <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {localError || errorMessage}
            </div>
          )}
          {notice && (
            <div role="status" className="mb-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
            </div>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">Nome completo</span>
                <span className="relative block">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                  <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} required disabled={busy || submitting} placeholder="Seu nome" className={inputClass} />
                </span>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold">E-mail</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={busy || submitting} placeholder="voce@email.com" className={inputClass} />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold">Senha</span>
              <span className="relative block">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} required disabled={busy || submitting} placeholder="Mínimo de 8 caracteres" className={inputClass} />
              </span>
            </label>
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">Confirmar senha</span>
                <span className="relative block">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                  <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required disabled={busy || submitting} placeholder="Repita sua senha" className={inputClass} />
                </span>
              </label>
            )}
            <button type="submit" disabled={busy || submitting} className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#F5B900] px-5 text-sm font-extrabold text-[#172033] shadow-[0_8px_20px_rgba(245,185,0,0.22)] transition hover:bg-[#FFC928] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Aguarde...' : isRegister ? 'Criar conta de parceiro' : 'Entrar no portal'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {!isRegister && (
            <button type="button" onClick={() => void handleForgotPassword()} disabled={busy || submitting} className="mt-4 w-full py-2 text-center text-xs font-semibold text-[#667085] hover:text-[#9A7000]">
              Esqueci minha senha
            </button>
          )}

          <div className="mt-6 border-t border-[#EEF0F3] pt-5 text-center text-sm text-[#667085]">
            {isRegister ? 'Já tem cadastro?' : 'Ainda não é parceiro?'}
            <button type="button" onClick={() => onNavigate(isRegister ? '/parceiros/login' : '/parceiros/cadastro')} className="ml-1 font-bold text-[#946B00] hover:underline">
              {isRegister ? 'Fazer login' : 'Quero ser parceiro'}
            </button>
          </div>
          <p className="mt-5 text-center text-[11px] leading-relaxed text-[#98A2B3]">
            O cadastro de parceiro é independente do cadastro de estabelecimento no MGW Gestão.
          </p>
        </section>
      </div>
    </main>
  );
}
