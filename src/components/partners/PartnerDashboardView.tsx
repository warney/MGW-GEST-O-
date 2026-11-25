import { Copy, LogOut, ShieldCheck, Users, Wallet } from 'lucide-react';

export interface PartnerAccount {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  referralCode: string;
  status: 'active' | 'suspended' | 'blocked';
  createdAt: string;
}

interface PartnerDashboardViewProps {
  partner: PartnerAccount;
  onLogout: () => void;
}

export function PartnerDashboardView({ partner, onLogout }: PartnerDashboardViewProps) {
  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/cadastro?ref=${partner.referralCode}`
    : `/cadastro?ref=${partner.referralCode}`;

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
    } catch {
      // A etapa de materiais e compartilhamento adicionará fallback de cópia.
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F6FA] px-4 py-6 text-[#172033] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#A87500]">MGW Parceiros</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Olá, {partner.fullName.split(' ')[0]}</h1>
            <p className="mt-1 text-sm text-[#667085]">Seu espaço de acompanhamento de indicações.</p>
          </div>
          <button type="button" onClick={onLogout} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#475467] hover:border-[#D0D5DD]">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </header>

        <section className="mt-7 rounded-2xl border border-[#E8D99E] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Seu código exclusivo</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tracking-[0.12em] text-[#946B00]">{partner.referralCode}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4" /> {partner.status === 'active' ? 'Conta ativa' : partner.status === 'suspended' ? 'Conta suspensa' : 'Conta bloqueada'}
            </span>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-3 text-xs text-[#667085] break-all">{referralUrl}</div>
            <button type="button" onClick={() => void copyReferralLink()} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#172033] px-5 text-sm font-bold text-white hover:bg-[#29364D]">
              <Copy className="h-4 w-4" /> Copiar link
            </button>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF7D6] text-[#946B00]"><Users className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-semibold text-[#667085]">Indicações</p>
            <p className="mt-1 text-2xl font-extrabold">—</p>
            <p className="mt-1 text-xs text-[#98A2B3]">O acompanhamento será habilitado na próxima etapa.</p>
          </article>
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF3] text-emerald-700"><Wallet className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-semibold text-[#667085]">Comissões</p>
            <p className="mt-1 text-2xl font-extrabold">R$ —</p>
            <p className="mt-1 text-xs text-[#98A2B3]">O motor financeiro será implementado nas próximas etapas.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
