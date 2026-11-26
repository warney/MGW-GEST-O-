import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { signInAdmin } from '../services/adminApi';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { MgwBrandLogo } from './MgwBrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface AdminLoginScreenProps {
  onSuccess: () => Promise<void>;
  unauthorizedNotice?: string | null;
}

export function AdminLoginScreen({ onSuccess, unauthorizedNotice }: AdminLoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900 flex flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Official Dark Brand Lockup Header */}
        <div className="bg-[#202733] px-7 py-6 border-b border-slate-800 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <MgwBrandLogo variant="full" className="h-11 w-auto" />
            <PWAInstallButton tone="dark" compactOnMobile showManualFallback />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
            <h1 className="text-sm font-semibold text-white">Console Administrativo</h1>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Acesso Restrito</span>
            </span>
          </div>
        </div>

        <div className="p-7">
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>
                Variáveis <code className="font-mono">VITE_SUPABASE_URL</code> e{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> não configuradas no ambiente.
              </span>
            </div>
          )}

          {unauthorizedNotice && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{unauthorizedNotice}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-3 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#F5B731] px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Lock className="h-4 w-4" />
              <span>{loading ? 'Validando credenciais...' : 'Entrar no MGW Admin'}</span>
            </button>
          </form>

          <p className="mt-5 pt-4 border-t border-slate-200 text-[11px] leading-relaxed text-slate-600">
            Autenticação protegida por Supabase Auth e validação na tabela{' '}
            <code className="font-mono text-slate-800">platform_admins</code>. Mutações críticas exigem
            segundo fator (MFA AAL2).
          </p>
        </div>
      </div>
    </div>
  );
}
