import { useState } from 'react';
import { CheckCircle2, Loader2, LogOut, ShieldAlert, Store, User } from 'lucide-react';

interface StoreOnboardingScreenProps {
  accountEmail: string;
  initialStoreName?: string;
  onComplete: (storeName: string, ownerName: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function StoreOnboardingScreen({
  accountEmail,
  initialStoreName = '',
  onComplete,
  onLogout,
}: StoreOnboardingScreenProps) {
  const defaultDraft =
    initialStoreName && initialStoreName !== 'Meu Estabelecimento'
      ? initialStoreName
      : '';
  const [storeName, setStoreName] = useState(defaultDraft);
  const [ownerName, setOwnerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const cleanStoreName = storeName.trim();
    if (cleanStoreName.length < 2) {
      setError('Informe o nome do estabelecimento (mínimo 2 caracteres).');
      return;
    }

    setSubmitting(true);
    try {
      await onComplete(cleanStoreName, ownerName.trim());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a configuração do estabelecimento.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogoutClick() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col items-center justify-center p-4 sm:p-6">
      <main className="w-full max-w-md bg-[#12151C] border border-[#232834] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731] font-display font-bold text-lg">
            M
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">MGW Gestão</h1>
            <p className="text-xs text-[#9CA3AF]">
              Finalize o cadastro do seu estabelecimento
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 p-3.5 flex items-start gap-2.5 text-xs text-[#86EFAC]">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Teste grátis de 3 dias ativado</p>
            <p className="text-[#D1D5DB]">
              Conta autenticada: <span className="font-medium text-white break-all">{accountEmail}</span>.
              Não é necessário cartão de crédito para começar.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5] flex gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor="onboarding-store-name"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Nome do estabelecimento *
            </label>
            <div className="relative">
              <Store className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="onboarding-store-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Lanchonete do Centro"
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="onboarding-owner-name"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Seu nome (opcional)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="onboarding-owner-name"
                type="text"
                maxLength={120}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Nome do responsável"
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[46px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando estabelecimento...
              </>
            ) : (
              'Continuar para o painel'
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-[#232834] flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#9CA3AF]">
            Dados salvos apenas neste estabelecimento.
          </span>
          <button
            type="button"
            onClick={() => void handleLogoutClick()}
            disabled={signingOut || submitting}
            className="min-h-[38px] px-3 rounded-xl border border-[#232834] hover:border-[#374151] text-xs font-medium text-[#D1D5DB] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" />
            {signingOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </main>
    </div>
  );
}
