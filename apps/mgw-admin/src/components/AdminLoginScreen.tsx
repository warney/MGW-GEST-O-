import { useState, type FormEvent } from 'react';
import { AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { signInAdmin } from '../services/adminApi';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface AdminLoginScreenProps {
  onSuccess: () => Promise<void>;
  unauthorizedNotice?: string | null;
}

export function AdminLoginScreen({ onSuccess, unauthorizedNotice }: AdminLoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInAdmin(email, password);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-md border border-[#222733] bg-[#12151C] rounded-lg p-7">
        <div className="flex items-center gap-3 pb-6 border-b border-[#222733]">
          <div className="h-10 w-10 rounded-md bg-[#F5B731]/12 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">MGW Admin</h1>
            <p className="text-xs text-slate-400">Console Administrativo · Plataforma SaaS</p>
          </div>
        </div>

        <div className="pt-5">
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Variáveis <code className="font-mono">VITE_SUPABASE_URL</code> e{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> não configuradas no ambiente.
              </span>
            </div>
          )}

          {unauthorizedNotice && (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{unauthorizedNotice}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail Administrativo
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@suaempresa.com.br"
                className="w-full rounded-md border border-[#2A3040] bg-[#0B0D11] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#F5B731] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Senha
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-[#2A3040] bg-[#0B0D11] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#F5B731] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-[#F5B731] px-4 py-2.5 text-sm font-semibold text-[#0B0D11] hover:bg-[#e5a824] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Lock className="h-4 w-4" />
              <span>{loading ? 'Validando credenciais...' : 'Entrar no MGW Admin'}</span>
            </button>
          </form>

          <p className="mt-5 pt-4 border-t border-[#222733] text-[11px] leading-relaxed text-slate-500">
            Acesso exclusivo para operadores cadastrados em{' '}
            <code className="font-mono text-slate-400">platform_admins</code> com e-mail verificado no
            Supabase Auth. Auto-cadastro público desabilitado.
          </p>
        </div>
      </div>
    </div>
  );
}
