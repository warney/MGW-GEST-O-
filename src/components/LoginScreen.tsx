import { useState } from 'react';
import { Check, KeyRound, Lock, LogIn, Mail, ShieldAlert, Store, UserPlus } from 'lucide-react';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onEmailLogin?: (email: string, password: string) => Promise<void>;
  onRegister?: (name: string, storeName: string, email: string, password: string) => Promise<void>;
  onPasswordReset?: (email: string) => Promise<void>;
  supportsEmailAuth?: boolean;
  isSigningIn: boolean;
  errorMessage: string | null;
}
type AuthMode = 'login' | 'register' | 'reset';

export function LoginScreen({ onGoogleLogin, onEmailLogin, onRegister, onPasswordReset, supportsEmailAuth = false, isSigningIn, errorMessage }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || isSigningIn;
  const visibleError = localError || errorMessage;
  const inputClass = 'w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]';
  const labelClass = 'block text-xs font-medium text-[#D1D5DB] mb-1.5';
  const changeMode = (next: AuthMode) => { setMode(next); setLocalError(null); setMessage(null); };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); if (!onEmailLogin || busy) return;
    setLocalError(null); setMessage(null); setSubmitting(true);
    try { await onEmailLogin(email, password); }
    catch (err) { setLocalError(err instanceof Error ? err.message : 'Não foi possível entrar.'); }
    finally { setSubmitting(false); }
  }
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); if (!onRegister || busy) return;
    setLocalError(null); setMessage(null);
    if (password.length < 8) { setLocalError('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setLocalError('As senhas não conferem.'); return; }
    setSubmitting(true);
    try {
      await onRegister(name, storeName, email, password);
      setMessage('Cadastro recebido! Confira seu e-mail para confirmar a conta. Depois, entre com seu e-mail e senha.');
      setPassword(''); setConfirmPassword(''); setMode('login');
    } catch (err) { setLocalError(err instanceof Error ? err.message : 'Não foi possível criar sua conta.'); }
    finally { setSubmitting(false); }
  }
  async function handleReset(e: React.FormEvent) {
    e.preventDefault(); if (!onPasswordReset || busy) return;
    setLocalError(null); setMessage(null); setSubmitting(true);
    try { await onPasswordReset(email); setMessage('Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.'); }
    catch (err) { setLocalError(err instanceof Error ? err.message : 'Não foi possível solicitar a recuperação.'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col items-center justify-center p-4 sm:p-6">
      <main className="w-full max-w-md bg-[#12151C] border border-[#232834] rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731] font-display font-bold text-lg">M</div>
          <div><h1 className="text-xl font-bold tracking-tight">MGW GESTÃO</h1><p className="text-xs text-[#9CA3AF]">Gestão inteligente para seu estabelecimento</p></div>
        </div>
        <p className="text-sm text-[#D1D5DB] leading-relaxed mb-6">{mode === 'register' ? 'Crie sua conta e cadastre sua lanchonete para começar.' : 'Controle vendas, despesas, produtos, combos e pedidos em um só lugar.'}</p>
        {visibleError && <div role="alert" className="mb-5 p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5] flex gap-2.5"><ShieldAlert className="w-4 h-4 shrink-0"/><span>{visibleError}</span></div>}
        {message && <div role="status" className="mb-5 p-3.5 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs text-[#86EFAC] flex gap-2.5"><Check className="w-4 h-4 shrink-0"/><span>{message}</span></div>}
        {mode !== 'reset' && <button type="button" onClick={() => { setLocalError(null); void onGoogleLogin(); }} disabled={busy} className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] font-semibold text-sm flex items-center justify-center gap-2.5 disabled:opacity-60"><LogIn className="w-4 h-4"/>{isSigningIn ? 'Conectando...' : 'Continuar com Google'}</button>}
        {supportsEmailAuth && <div className="mt-5 pt-5 border-t border-[#232834]">
          {mode === 'login' && <form onSubmit={(e) => void handleLogin(e)} className="space-y-3">
            <div><label htmlFor="login-email" className={labelClass}>E-mail</label><div className="relative"><Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2"/><input id="login-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="seu@email.com" className={inputClass+' pl-10'}/></div></div>
            <div><label htmlFor="login-password" className={labelClass}>Senha</label><div className="relative"><KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2"/><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Sua senha" className={inputClass+' pl-10'}/></div></div>
            <button type="submit" disabled={busy} className="w-full min-h-[44px] rounded-xl border border-[#232834] hover:border-[#F5B731] bg-[#0B0D11] text-sm font-semibold disabled:opacity-60">{submitting?'Entrando...':'Entrar com E-mail e Senha'}</button>
            <div className="flex justify-between text-xs"><button type="button" onClick={()=>changeMode('reset')} className="text-[#9CA3AF] hover:text-[#F5B731]">Esqueci minha senha</button>{onRegister&&<button type="button" onClick={()=>changeMode('register')} className="text-[#F5B731] font-semibold">Criar minha conta</button>}</div>
          </form>}
          {mode === 'register' && <form onSubmit={e=>void handleRegister(e)} className="space-y-3">
            <div><label htmlFor="reg-name" className={labelClass}>Seu nome</label><input id="reg-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={80} autoComplete="name" placeholder="Nome do proprietário" className={inputClass}/></div>
            <div><label htmlFor="reg-store" className={labelClass}>Nome do estabelecimento</label><div className="relative"><Store className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2"/><input id="reg-store" value={storeName} onChange={e=>setStoreName(e.target.value)} required maxLength={80} placeholder="Minha Lanchonete" className={inputClass+' pl-10'}/></div></div>
            <div><label htmlFor="reg-email" className={labelClass}>E-mail</label><input id="reg-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="seu@email.com" className={inputClass}/></div>
            <div><label htmlFor="reg-password" className={labelClass}>Senha (mínimo 8 caracteres)</label><input id="reg-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputClass}/></div>
            <div><label htmlFor="reg-confirm" className={labelClass}>Confirmar senha</label><input id="reg-confirm" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputClass}/></div>
            <button type="submit" disabled={busy} className="w-full min-h-[46px] rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"><UserPlus className="w-4 h-4"/>{submitting?'Criando conta...':'Criar conta e estabelecimento'}</button>
            <button type="button" onClick={()=>changeMode('login')} className="w-full text-xs text-[#9CA3AF]">Já tenho uma conta · Voltar ao login</button>
          </form>}
          {mode === 'reset' && <form onSubmit={e=>void handleReset(e)} className="space-y-3"><div><label htmlFor="reset-email" className={labelClass}>E-mail para recuperação</label><input id="reset-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required className={inputClass}/></div><div className="flex gap-2"><button type="submit" disabled={busy} className="flex-1 min-h-[44px] rounded-xl border border-[#F5B731]/50 text-xs font-semibold text-[#F5B731] disabled:opacity-60">{submitting?'Enviando...':'Enviar link de recuperação'}</button><button type="button" onClick={()=>changeMode('login')} className="px-3 rounded-xl border border-[#232834] text-xs text-[#9CA3AF]">Voltar</button></div></form>}
        </div>}
        <div className="mt-5 pt-4 border-t border-[#232834] text-xs text-[#9CA3AF] flex items-start gap-2"><Lock className="w-3.5 h-3.5 text-[#F5B731] shrink-0 mt-0.5"/><p className="leading-relaxed">Cada estabelecimento possui seus próprios produtos, vendas, despesas, imagens e cardápio, protegidos por regras de acesso individuais.</p></div>
      </main>
    </div>
  );
}
