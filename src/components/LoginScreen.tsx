import { Lock, LogIn, ShieldAlert } from 'lucide-react';
import { ADMIN_EMAILS, SEPARATE_SHOP_EMAIL } from '../types/finance';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  isSigningIn: boolean;
  errorMessage: string | null;
}

export function LoginScreen({
  onGoogleLogin,
  isSigningIn,
  errorMessage,
}: LoginScreenProps) {
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

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5] flex items-start gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void onGoogleLogin()}
          disabled={isSigningIn}
          className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] active:scale-[0.99] text-[#0B0D11] font-semibold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
        >
          <LogIn className="w-4 h-4" />
          {isSigningIn ? 'Conectando...' : 'Entrar com Google'}
        </button>

        <div className="mt-4 pt-4 border-t border-[#232834] space-y-2 text-xs text-[#9CA3AF]">
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-[#F5B731] shrink-0 mt-0.5" />
            <div className="leading-relaxed space-y-1">
              <p>
                MGW Lanches:{' '}
                <strong className="text-[#D1D5DB] font-medium">
                  {ADMIN_EMAILS.join(' · ')}
                </strong>
              </p>
              <p>
                Conta separada (outro lanche):{' '}
                <strong className="text-[#D1D5DB] font-medium">
                  {SEPARATE_SHOP_EMAIL}
                </strong>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
