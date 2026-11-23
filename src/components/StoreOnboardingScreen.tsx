import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Store,
  User,
} from 'lucide-react';

interface StoreOnboardingScreenProps {
  accountEmail: string;
  initialStoreName?: string;
  onComplete: (storeName: string, ownerName: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

const ONBOARDING_ROADMAP_ITEMS = [
  {
    title: 'Informações do estabelecimento',
    description: 'Confirme o nome comercial e o responsável para concluir esta etapa.',
    active: true,
  },
  {
    title: 'Seu cardápio',
    description: 'Cadastre produtos, categorias, combos e adicionais direto no painel.',
    active: false,
  },
  {
    title: 'Preferências e cardápio digital',
    description: 'Personalize operação, pagamento e o endereço exclusivo da sua loja.',
    active: false,
  },
] as const;

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
  const [heroImageFailed, setHeroImageFailed] = useState(false);

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
    <div className="min-h-screen w-full overflow-x-clip bg-[#F5F6FA] text-[#172033] flex flex-col items-center justify-center px-4 py-6 sm:p-6">
      <main className="w-full max-w-[960px] bg-white border border-[#E8EAF0] rounded-[24px] overflow-hidden shadow-[0_20px_50px_rgba(23,32,51,0.06)] grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left editorial welcome panel */}
        <div className="lg:col-span-6 relative bg-[#172033] min-h-[220px] sm:min-h-[280px] lg:min-h-[560px] overflow-hidden">
          {!heroImageFailed ? (
            <img
              src="/assets/onboarding_owner_kitchen_1795445299150.jpg"
              alt="Lojista sorrindo na cozinha do seu estabelecimento utilizando o MGW Gestão"
              referrerPolicy="no-referrer"
              onError={() => setHeroImageFailed(true)}
              className="w-full h-full object-cover object-center lg:absolute lg:inset-0"
            />
          ) : (
            <div className="w-full h-full min-h-[220px] lg:min-h-[560px] bg-gradient-to-br from-[#172033] via-[#222E47] to-[#3B2E10] flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F5B900]/20 border border-[#F5B900]/40 text-[#FFC928] flex items-center justify-center mb-4">
                <Store className="w-8 h-8" aria-hidden="true" />
              </div>
              <p className="font-display text-lg font-bold text-white">MGW Gestão</p>
              <p className="text-xs text-[#CBD5E1] mt-1 max-w-[26ch]">
                Painel completo para gestão de vendas, despesas e pedidos.
              </p>
            </div>
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#172033]/90 via-[#172033]/25 to-transparent"
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 flex flex-col gap-2 text-white">
            <div className="inline-flex items-center gap-2">
              <svg
                width="26"
                height="28"
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
              <span className="font-display text-base font-bold tracking-tight text-white">
                MGW Gestão
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-[#E8EAF0] leading-relaxed max-w-[34ch]">
              Seu espaço já foi criado automaticamente. Confirme os dados iniciais para entrar no
              painel.
            </p>
          </div>
        </div>

        {/* Right onboarding setup form */}
        <div className="lg:col-span-6 relative p-6 sm:p-8 lg:p-9 flex flex-col justify-between bg-white">
          {/* Subtle yellow accent rays matching the reference */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
            className="hidden sm:block absolute top-6 right-6 text-[#F5B900] pointer-events-none"
          >
            <path
              d="M6 12L10 4M13 14L22 6M15 21L25 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>

          <div className="space-y-5">
            <header className="pr-0 sm:pr-8">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#8A6200] mb-1.5">
                <span>Primeiro acesso</span>
                <span aria-hidden="true">·</span>
                <span>Teste grátis de 3 dias ativado</span>
              </div>
              <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#172033] leading-tight">
                Bem-vindo ao MGW Gestão!
              </h1>
              <p className="mt-1.5 text-sm text-[#778094] leading-relaxed">
                Vamos configurar seu sistema em poucos passos.
              </p>
            </header>

            {/* Clear orientation roadmap matching the 3 visual guide items */}
            <ol className="space-y-2.5" aria-label="Etapas iniciais de configuração">
              {ONBOARDING_ROADMAP_ITEMS.map((item) => (
                <li key={item.title} className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      item.active
                        ? 'bg-[#F5B900] text-[#172033]'
                        : 'bg-[#FFFBEB] border border-[#F5B900]/45 text-[#8A6200]'
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="w-3 h-3 stroke-[2.6]" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-xs sm:text-[13px] leading-snug ${
                        item.active
                          ? 'font-bold text-[#172033]'
                          : 'font-semibold text-[#172033]/85'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#778094] leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Account confirmation banner with accessible high contrast */}
            <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-[#15803D]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#16A36A]" aria-hidden="true" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold text-[#15803D]">Conta vinculada e pronta</p>
                <p className="text-[#172033]/80 leading-relaxed">
                  Acesso autenticado:{' '}
                  <span className="font-semibold text-[#172033] break-all">{accountEmail}</span>.
                  Sem necessidade de cartão de crédito.
                </p>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2.5"
              >
                <ShieldAlert
                  className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]"
                  aria-hidden="true"
                />
                <span className="font-medium leading-relaxed">{error}</span>
              </div>
            )}

            <form
              noValidate
              aria-busy={submitting}
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-3.5"
            >
              <div>
                <label
                  htmlFor="onboarding-store-name"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Nome do estabelecimento *
                </label>
                <div className="relative">
                  <Store
                    className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="onboarding-store-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    disabled={submitting}
                    value={storeName}
                    onChange={(e) => {
                      setStoreName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Ex: Lanchonete do Centro"
                    className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl bg-[#F8F9FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none focus:ring-4 focus:ring-[#F5B900]/15 text-sm text-[#172033] placeholder:text-[#9AA3B5] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="onboarding-owner-name"
                  className="block text-xs font-semibold text-[#172033] mb-1.5"
                >
                  Seu nome (opcional)
                </label>
                <div className="relative">
                  <User
                    className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="onboarding-owner-name"
                    type="text"
                    maxLength={120}
                    disabled={submitting}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Nome do responsável"
                    className="w-full min-h-[46px] pl-10 pr-3.5 rounded-xl bg-[#F8F9FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none focus:ring-4 focus:ring-[#F5B900]/15 text-sm text-[#172033] placeholder:text-[#9AA3B5] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || signingOut}
                className="w-full min-h-[48px] px-5 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] active:bg-[#E5AD00] text-[#172033] font-bold text-sm shadow-[0_6px_18px_rgba(245,185,0,0.28)] flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033] focus-visible:ring-offset-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Salvando estabelecimento...</span>
                  </>
                ) : (
                  <>
                    <span>Começar Agora</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          </div>

          <footer className="mt-5 pt-4 border-t border-[#E8EAF0] flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#778094]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#8A6200] shrink-0" aria-hidden="true" />
              <span>Dados isolados e salvos apenas neste estabelecimento.</span>
            </span>
            <button
              type="button"
              onClick={() => void handleLogoutClick()}
              disabled={signingOut || submitting}
              className="min-h-[38px] px-3 rounded-xl border border-[#E8EAF0] bg-white hover:bg-[#F5F6FA] hover:border-[#D5D9E2] text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172033]"
            >
              <LogOut className="w-3.5 h-3.5 text-[#778094]" aria-hidden="true" />
              <span>{signingOut ? 'Saindo...' : 'Sair'}</span>
            </button>
          </footer>
        </div>
      </main>
    </div>
  );
}
