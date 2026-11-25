import { useEffect, useState, type FormEvent } from 'react';
import { Copy, LogOut, ShieldCheck, Users, Wallet, CreditCard, RefreshCw } from 'lucide-react';
import { fetchPartnerDashboardData, savePartnerPayoutProfile, type PartnerDashboardData } from '../../services/dataService';

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
  const [data,setData]=useState<PartnerDashboardData|null>(null);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [pixKey,setPixKey]=useState('');
  const [pixKeyType,setPixKeyType]=useState<'cpf'|'cnpj'|'email'|'phone'|'random'>('cpf');
  const [holderName,setHolderName]=useState(partner.fullName);
  const [savingPix,setSavingPix]=useState(false);
  const [pixNotice,setPixNotice]=useState<string|null>(null);
  const money=(cents:number)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  async function reloadDashboard(){
    try { const result=await fetchPartnerDashboardData(); setData(result); setLoadError(null); if(result.payout_profile){setPixKey(result.payout_profile.pix_key);setPixKeyType(result.payout_profile.pix_key_type as typeof pixKeyType);setHolderName(result.payout_profile.holder_name);} }
    catch(error){setLoadError(error instanceof Error?error.message:'Não foi possível carregar os dados.');}
  }
  useEffect(()=>{void reloadDashboard();},[]);
  async function handleSavePix(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSavingPix(true);setPixNotice(null);
    try{await savePartnerPayoutProfile({pixKey,pixKeyType,holderName});setPixNotice('Dados Pix salvos.');await reloadDashboard();}
    catch(error){setPixNotice(error instanceof Error?error.message:'Não foi possível salvar.');}
    finally{setSavingPix(false);}
  }

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
            <p className="mt-1 text-2xl font-extrabold">{data?.referral_count ?? '—'}</p>
            <p className="mt-1 text-xs text-[#98A2B3]">{data?.converted_count ?? 0} clientes convertidos</p>
          </article>
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF3] text-emerald-700"><Wallet className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-semibold text-[#667085]">Comissões</p>
            <p className="mt-1 text-2xl font-extrabold">{data ? money(data.pending_cents+data.paid_cents) : '—'}</p>
            <p className="mt-1 text-xs text-[#98A2B3]">{data ? `${money(data.pending_cents)} pendentes · ${money(data.paid_cents)} pagos` : 'Carregando...'}</p>
          </article>
        {loadError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError} <button onClick={()=>void reloadDashboard()} className="underline font-bold">Tentar novamente</button></p>}
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold">Indicações recentes</h2><button onClick={()=>void reloadDashboard()} aria-label="Atualizar" className="p-2"><RefreshCw className="h-4 w-4"/></button></div>
            <p className="mt-1 text-xs text-slate-500">Comissão vigente: {data?.commission_percent ?? 15}% sobre o primeiro pagamento aprovado.</p>
            <div className="mt-3 space-y-2">{(data?.referrals??[]).map(item=><div key={item.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span><b>{item.status==='converted'?'Convertida':item.status==='registered'?'Cadastrada':'Não elegível'}</b></div>)}
            {data && !data.referrals.length && <p className="text-sm text-slate-500">Você ainda não possui indicações.</p>}</div>
          </article>
          <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex items-center gap-2"><CreditCard className="h-5 w-5"/><h2 className="font-bold">Dados para recebimento Pix</h2></div>
            <p className="mt-1 text-xs text-slate-500">Cadastre sua chave para receber comissões quando os pagamentos forem habilitados.</p>
            <form onSubmit={event=>void handleSavePix(event)} className="mt-4 space-y-3">
              <label className="block text-xs font-semibold">Titular<input value={holderName} onChange={e=>setHolderName(e.target.value)} required maxLength={120} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label>
              <label className="block text-xs font-semibold">Tipo de chave<select value={pixKeyType} onChange={e=>setPixKeyType(e.target.value as typeof pixKeyType)} className="mt-1 w-full rounded-lg border p-3 text-sm"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option></select></label>
              <label className="block text-xs font-semibold">Chave Pix<input value={pixKey} onChange={e=>setPixKey(e.target.value)} required maxLength={160} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label>
              <button disabled={savingPix} className="w-full rounded-lg bg-[#172033] p-3 text-sm font-bold text-white disabled:opacity-50">{savingPix?'Salvando...':'Salvar dados Pix'}</button>
              {pixNotice&&<p role="status" className="text-xs text-slate-600">{pixNotice}</p>}
            </form>
          </article>
        </section>
        <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-5"><h2 className="font-bold">Histórico de comissões</h2>
          {(data?.commissions??[]).map(item=><div key={item.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span><b>{money(item.amount_cents)}</b><span>{item.status==='paid'?'Pago':item.status==='available'?'Disponível':item.status==='processing'?'Em processamento':'Pendente'}</span></div>)}
          {data && !data.commissions.length&&<p className="mt-3 text-sm text-slate-500">Nenhuma comissão registrada ainda.</p>}
        </section>
        </section>
      </div>
    </main>
  );
}
