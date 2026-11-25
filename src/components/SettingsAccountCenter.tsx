import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Copy, CreditCard, Crown, FileText, Info, LogOut, QrCode, RefreshCw, ShieldCheck, Store, Wallet } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import type { TenantContext } from '../types/finance';

type SubscriptionRow = {
  id: string; plan_code: string; status: string; plan_amount_cents: number; currency: string;
  current_period_start: string | null; current_period_end: string | null; trial_ends_at: string | null;
  created_at: string; mp_preapproval_id: string | null;
};
type PlanRow = { name: string; amount_cents: number; billing_interval: string; max_members: number | null };
type PaymentRow = { id: string; amount_cents: number; currency: string; status: string; payment_method: string | null; paid_at: string | null; due_at: string | null; created_at: string };
type PixPayment = { paymentId: string; amountCents: number; qrCode: string; qrCodeBase64: string; ticketUrl: string; expiresAt: string | null };

interface Props {
  tenant: TenantContext;
  accountEmail: string;
  onLogout: () => Promise<void>;
  onSubscribe: (tenantId: string) => Promise<void>;
  onSubscribePix: (tenantId: string) => Promise<PixPayment>;
}
const money = (cents: number, currency = 'BRL') => (Math.max(0, cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
const dateLabel = (value?: string | null) => {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
};
const dateTimeLabel = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};
function getStatus(status: string, exempt: boolean) {
  if (exempt) return { label: 'Conta isenta', tone: 'success' };
  if (status === 'authorized' || status === 'active') return { label: 'Conta ativa', tone: 'success' };
  if (status === 'trialing') return { label: 'Período de teste', tone: 'warning' };
  if (status === 'pending' || status === 'past_due' || status === 'cancelled') return { label: status === 'cancelled' ? 'Assinatura cancelada' : 'Pagamento pendente', tone: 'warning' };
  if (status === 'expired' || status === 'suspended' || status === 'paused') return { label: 'Acesso suspenso', tone: 'danger' };
  return { label: 'Verificando assinatura', tone: 'neutral' };
}
function paymentStatus(status: string) {
  if (status === 'approved') return { label: 'Aprovado', className: 'bg-[#ECFDF5] text-[#16845B]' };
  if (status === 'pending' || status === 'in_process') return { label: 'Pendente', className: 'bg-[#FFFBEB] text-[#A16207]' };
  if (status === 'cancelled' || status === 'canceled') return { label: 'Cancelado', className: 'bg-[#F3F4F6] text-[#6B7280]' };
  return { label: status === 'refunded' || status === 'charged_back' ? 'Estornado' : 'Não aprovado', className: 'bg-[#FEF2F2] text-[#C24145]' };
}
function methodLabel(method?: string | null, recurring = false) {
  if (recurring) return 'Cartão de crédito · renovação automática';
  const value = (method || '').toLowerCase();
  if (value.includes('pix')) return 'Pix · renovação manual';
  if (value.includes('credit') || value.includes('card') || value.includes('cartão')) return 'Cartão de crédito';
  return method || 'Não definido';
}
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SettingsAccountCenter({ tenant, accountEmail, onLogout, onSubscribe, onSubscribePix }: Props) {
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const load = async () => {
      const supabase = getSupabaseClient();
      const { data, error: subError } = await supabase.from('subscriptions')
        .select('id,plan_code,status,plan_amount_cents,currency,current_period_start,current_period_end,trial_ends_at,created_at,mp_preapproval_id')
        .eq('tenant_id', tenant.tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (subError) throw subError;
      const current = (data || null) as SubscriptionRow | null;
      if (!active) return;
      setSubscription(current);
      const [planResult, paymentResult] = await Promise.all([
        current?.plan_code
          ? supabase.from('plans').select('name,amount_cents,billing_interval,max_members').eq('code', current.plan_code).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        tenant.role === 'owner'
          ? supabase.from('platform_payments').select('id,amount_cents,currency,status,payment_method,paid_at,due_at,created_at')
              .eq('tenant_id', tenant.tenantId).order('created_at', { ascending: false }).limit(30)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active) return;
      if (planResult.error) console.warn('[MGW settings] Plano não carregado:', planResult.error.message);
      if (paymentResult.error) console.warn('[MGW settings] Histórico financeiro não carregado:', paymentResult.error.message);
      setPlan((planResult.data || null) as PlanRow | null);
      setPayments((paymentResult.data || []) as PaymentRow[]);
    };
    void load().catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados da assinatura.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenant.tenantId, tenant.role]);

  const exempt = tenant.billingExempt || tenant.isFounderAccount || subscription?.status === 'exempt';
  const status = subscription?.status || tenant.subscriptionStatus || 'pending';
  const statusInfo = getStatus(status, exempt);
  const endDate = subscription?.current_period_end || tenant.currentPeriodEnd || subscription?.trial_ends_at || tenant.trialEndsAt || null;
  const startDate = subscription?.current_period_start || subscription?.created_at || null;
  const amount = plan?.amount_cents ?? subscription?.plan_amount_cents ?? 0;
  const planName = exempt ? (tenant.isFounderAccount ? 'Plano Fundador' : 'Plano Isento') : status === 'trialing' ? 'Período de teste' : plan?.name || 'Plano mensal MGW Gestão';
  const approvedPayment = payments.find((payment) => payment.status === 'approved');
  const method = methodLabel(approvedPayment?.payment_method, Boolean(subscription?.mp_preapproval_id));
  const daysLeft = useMemo(() => endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)) : null, [endDate]);
  const attention = !exempt && ['pending', 'past_due', 'expired', 'suspended', 'paused', 'cancelled'].includes(status);
  const canManage = tenant.role === 'owner' && !exempt;

  useEffect(() => {
    if (!pixPayment) return;
    let active = true;
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      try {
        const { data, error: invokeError } = await getSupabaseClient().functions.invoke('get-mp-subscription-status', { body: { tenantId: tenant.tenantId } });
        if (invokeError) throw invokeError;
        if (active && (data?.status === 'authorized' || data?.status === 'active')) window.location.reload();
      } catch { /* webhook e próxima consulta confirmam o pagamento */ }
    };
    void check();
    const timer = window.setInterval(() => { if (attempts < 60) void check(); else window.clearInterval(timer); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pixPayment?.paymentId, tenant.tenantId]);

  async function payPix() {
    if (!canManage || pixLoading || cardLoading) return;
    setPixLoading(true); setError(null);
    try { setPixPayment(await onSubscribePix(tenant.tenantId)); setShowPaymentOptions(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o Pix.'); }
    finally { setPixLoading(false); }
  }
  async function payCard() {
    if (!canManage || pixLoading || cardLoading) return;
    setCardLoading(true); setError(null);
    try { await onSubscribe(tenant.tenantId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o checkout do cartão.'); setCardLoading(false); }
  }
  async function copyPix() {
    if (!pixPayment?.qrCode) return;
    try { await navigator.clipboard.writeText(pixPayment.qrCode); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError('Não foi possível copiar automaticamente. Selecione e copie o código Pix.'); }
  }
  async function logout() {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try { await onLogout(); } finally { setLogoutLoading(false); }
  }

  const banner = exempt
    ? { title: 'Seu acesso está garantido!', text: 'Este estabelecimento possui uma condição especial de isenção no MGW Gestão.', tone: 'success' }
    : status === 'trialing'
      ? { title: 'Seu período de teste está ativo!', text: endDate ? 'Seu período de teste termina em ' + dateLabel(endDate) + '.' : 'Aproveite todos os recursos do MGW Gestão durante seu período de teste.', tone: 'warning' }
      : attention
        ? { title: 'Sua assinatura precisa de atenção', text: 'Regularize sua assinatura para manter o acesso ao MGW Gestão e ao Cardápio Digital.', tone: 'warning' }
        : { title: 'Sua assinatura está em dia!', text: 'Acesso liberado para aproveitar todos os recursos do MGW Gestão.', tone: 'success' };

  const toneClass = statusInfo.tone === 'success' ? 'border-emerald-300/25 bg-emerald-400/20 text-emerald-100'
    : statusInfo.tone === 'warning' ? 'border-amber-300/25 bg-amber-300/15 text-amber-100'
    : statusInfo.tone === 'danger' ? 'border-rose-300/25 bg-rose-400/15 text-rose-100'
    : 'border-white/15 bg-white/10 text-white/80';

  return (
    <div className="max-w-5xl space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#172033] via-[#1B2740] to-[#171D35] p-5 text-white shadow-[0_8px_24px_rgba(23,32,51,0.13)] sm:p-6">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#F5B900]/10 blur-3xl" />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F5B900] text-[#172033]"><Store className="h-6 w-6" /></span>
              <div className="min-w-0"><h2 className="truncate text-lg font-bold sm:text-xl">{tenant.name}</h2><p className="mt-0.5 text-xs text-white/70">Seu estabelecimento no MGW Gestão</p></div>
            </div>
            <span className={'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ' + toneClass}><CheckCircle2 className="h-4 w-4" />{statusInfo.label}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 border-t border-white/15 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <div><p className="text-xs text-white/65">Plano atual</p><p className="mt-1 text-base font-bold">{planName}</p><p className="mt-0.5 text-2xl font-bold">{exempt ? 'Isento' : status === 'trialing' ? 'Grátis' : money(amount, subscription?.currency || 'BRL')}{!exempt && status !== 'trialing' && <span className="ml-1 text-xs font-medium text-white/70">/ mês</span>}</p></div>
            <div className="flex items-center gap-3 border-t border-white/15 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><CalendarDays className="h-7 w-7 shrink-0 text-[#F5B900]" /><div><p className="text-xs text-white/65">{status === 'trialing' ? 'Fim do período de teste' : 'Próxima renovação / vencimento'}</p><p className="mt-1 text-lg font-bold">{loading ? 'Carregando...' : dateLabel(endDate)}</p><p className="mt-0.5 text-xs text-[#FFD75E]">{daysLeft === null ? 'Data não definida' : daysLeft > 0 ? 'Faltam ' + daysLeft + ' dias' : 'Período encerrado'}</p></div></div>
            <div className="hidden h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-emerald-300 sm:flex"><ShieldCheck className="h-10 w-10" /></div>
          </div>
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
        {banner.tone === 'success' ? <Info className="mt-0.5 h-6 w-6 shrink-0 text-[#D5A400]" /> : <CircleAlert className="mt-0.5 h-6 w-6 shrink-0 text-[#B7791F]" />}
        <div><h3 className="text-sm font-bold text-[#172033]">{banner.title}</h3><p className="mt-0.5 text-xs leading-relaxed text-[#4B5563]">{banner.text}</p></div>
      </section>
      {error && <div role="alert" className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs text-[#B91C1C]">{error}</div>}

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-[#172033]">Ações rápidas</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { id: 'billing-plan', icon: CreditCard, title: 'Meu Plano', description: 'Ver detalhes da assinatura' },
            { id: 'billing-payments', icon: FileText, title: 'Pagamentos', description: 'Histórico de cobranças' },
            { id: 'establishment-details', icon: Store, title: 'Meu estabelecimento', description: 'Dados comerciais e operacionais' },
            { id: 'account-access', icon: ShieldCheck, title: 'Conta e acesso', description: 'E-mail e segurança da sessão' },
          ].map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" onClick={() => jumpTo(item.id)} className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#E8EAF0] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(23,32,51,0.03)] transition hover:-translate-y-0.5 hover:border-[#F5D56B]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFBEB] text-[#E0AC00]"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#172033]">{item.title}</span><span className="mt-0.5 block text-xs text-[#778094]">{item.description}</span></span>
              <ChevronRight className="h-5 w-5 text-[#778094]" />
            </button>;
          })}
        </div>
      </section>

      <section id="billing-plan" className="scroll-mt-24 rounded-2xl border border-[#E8EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(23,32,51,0.03)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8EAF0] pb-4">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFFBEB] text-[#D9A600]"><Crown className="h-5 w-5" /></span><h3 className="text-base font-bold text-[#172033]">Detalhes da Assinatura</h3></div>
          {canManage && <button type="button" onClick={() => { if (attention || status === 'trialing') setShowPaymentOptions((value) => !value); else jumpTo('billing-payments'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F5B900] px-4 text-xs font-bold text-[#172033] hover:bg-[#FFC928]"><RefreshCw className="h-4 w-4" />{attention || status === 'trialing' ? 'Renovar / ativar agora' : 'Ver pagamentos'}</button>}
        </div>
        <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-3">
          <div className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 h-5 w-5 text-[#E0AC00]" /><div><p className="text-xs text-[#778094]">Início do plano</p><p className="mt-1 text-sm font-semibold text-[#172033]">{loading ? 'Carregando...' : dateLabel(startDate)}</p></div></div>
          <div className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 h-5 w-5 text-[#E0AC00]" /><div><p className="text-xs text-[#778094]">Validade atual</p><p className="mt-1 text-sm font-semibold text-[#172033]">{dateLabel(endDate)}</p></div></div>
          <div className="flex items-start gap-2.5"><CreditCard className="mt-0.5 h-5 w-5 text-[#E0AC00]" /><div><p className="text-xs text-[#778094]">Forma de pagamento</p><p className="mt-1 text-sm font-semibold text-[#172033]">{method}</p></div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E8EAF0] pt-3"><Info className="h-4 w-4 text-[#172033]" /><span className="text-xs text-[#4B5563]">Status da assinatura</span><span className={'rounded-full px-2.5 py-1 text-[11px] font-bold ' + (statusInfo.tone === 'success' ? 'bg-[#ECFDF5] text-[#16845B]' : statusInfo.tone === 'warning' ? 'bg-[#FFFBEB] text-[#A16207]' : statusInfo.tone === 'danger' ? 'bg-[#FEF2F2] text-[#C24145]' : 'bg-[#F3F4F6] text-[#6B7280]')}>{statusInfo.label}</span>
          <p className="w-full text-xs leading-relaxed text-[#778094]">{exempt ? 'Sua conta possui isenção administrativa e não exige renovação paga.' : subscription?.mp_preapproval_id ? 'Sua cobrança por cartão está configurada para renovação recorrente.' : status === 'trialing' ? 'Ao terminar o teste, escolha Pix ou cartão para continuar usando o MGW Gestão.' : status === 'authorized' || status === 'active' ? 'No Pix, a renovação é manual. Você deverá realizar o próximo pagamento antes do vencimento.' : 'Regularize sua assinatura para restabelecer o acesso ao MGW Gestão.'}</p>
        </div>
        {showPaymentOptions && canManage && !pixPayment && <div className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB]/70 p-4"><h4 className="text-sm font-bold text-[#172033]">Escolha como deseja pagar</h4><p className="mt-1 text-xs text-[#6B7280]">O valor será o preço vigente configurado no MGW Admin.</p><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void payPix()} disabled={pixLoading || cardLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#16845B] px-4 text-xs font-bold text-white disabled:opacity-60"><QrCode className="h-4 w-4" />{pixLoading ? 'Gerando Pix...' : 'Pagar com Pix'}</button>
          <button type="button" onClick={() => void payCard()} disabled={pixLoading || cardLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5B900] px-4 text-xs font-bold text-[#172033] disabled:opacity-60"><CreditCard className="h-4 w-4" />{cardLoading ? 'Abrindo checkout...' : 'Cartão de crédito'}</button>
        </div></div>}
        {pixPayment && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h4 className="text-center text-sm font-bold text-emerald-900">Pague com Pix para ativar sua assinatura</h4><p className="mt-1 text-center text-sm font-bold text-emerald-800">{money(pixPayment.amountCents)}</p><img src={'data:image/png;base64,' + pixPayment.qrCodeBase64} alt="QR Code Pix do Mercado Pago" className="mx-auto mt-3 h-52 w-52 rounded-xl bg-white p-2 object-contain" /><button type="button" onClick={() => void copyPix()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white"><Copy className="h-4 w-4" />{copied ? 'Código Pix copiado!' : 'Copiar código Pix'}</button>{pixPayment.ticketUrl && <a href={pixPayment.ticketUrl} target="_blank" rel="noreferrer" className="mt-3 block text-center text-xs font-semibold text-emerald-800 underline">Abrir página do pagamento</a>}<p role="status" className="mt-3 text-center text-xs text-emerald-900">Aguardando confirmação do Mercado Pago. Seu acesso será atualizado após a aprovação.</p><button type="button" onClick={() => { setPixPayment(null); setShowPaymentOptions(false); }} className="mt-2 w-full text-xs text-emerald-800 underline">Fechar</button></div>}
      </section>

      <section id="billing-payments" className="scroll-mt-24 overflow-hidden rounded-2xl border border-[#E8EAF0] bg-white shadow-[0_1px_2px_rgba(23,32,51,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8EAF0] px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-[#D9A600]" /><h3 className="text-base font-bold text-[#172033]">Pagamentos Recentes</h3></div>{payments.length > 5 && <button type="button" onClick={() => setShowAll((value) => !value)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#3568C8]">{showAll ? 'Mostrar menos' : 'Ver histórico completo'} <ArrowRight className="h-3.5 w-3.5" /></button>}</div>
        {loading ? <div className="space-y-3 p-5"><div className="h-4 animate-pulse rounded bg-[#F3F4F6]" /><div className="h-4 animate-pulse rounded bg-[#F3F4F6]" /></div>
          : tenant.role !== 'owner' ? <p className="p-5 text-xs text-[#778094]">O histórico financeiro da assinatura fica disponível somente para o proprietário.</p>
          : payments.length === 0 ? <p className="p-5 text-xs text-[#778094]">Nenhum pagamento registrado até o momento.</p>
          : <div className="divide-y divide-[#E8EAF0]">{(showAll ? payments : payments.slice(0, 5)).map((payment) => { const info = paymentStatus(payment.status); return <div key={payment.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[125px_minmax(0,1fr)_auto_auto] sm:px-5"><div className="text-xs text-[#778094]"><p className="font-medium text-[#4B5563]">{dateTimeLabel(payment.paid_at || payment.created_at)}</p><p>{payment.payment_method || 'Cobrança'}</p></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#172033]">Mensalidade MGW Gestão</p><p className="mt-0.5 text-[11px] text-[#778094]">{payment.due_at ? 'Vencimento ' + dateLabel(payment.due_at) : 'Cobrança da assinatura'}</p></div><span className={'col-start-2 row-start-1 justify-self-end rounded-full px-2 py-1 text-[10px] font-semibold sm:col-auto sm:row-auto ' + info.className}>{info.label}</span><p className="col-span-2 text-right text-sm font-bold tabular-nums text-[#172033] sm:col-span-1">{money(payment.amount_cents, payment.currency)}</p></div>; })}</div>}
      </section>

      <section id="account-access" className="scroll-mt-24 flex flex-col gap-3 rounded-2xl border border-[#E8EAF0] bg-white p-4 shadow-[0_1px_2px_rgba(23,32,51,0.03)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFBEB] text-[#D9A600]"><ShieldCheck className="h-5 w-5" /></span><div className="min-w-0"><p className="text-sm font-bold text-[#172033]">Conta e acesso</p><p className="mt-0.5 break-all text-xs text-[#778094]">{accountEmail}</p></div></div>
        <button type="button" onClick={() => void logout()} disabled={logoutLoading} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E8EAF0] px-4 text-xs font-semibold text-[#4B5563] hover:border-[#E35D62] hover:text-[#C24145] disabled:opacity-60"><LogOut className="h-4 w-4" />{logoutLoading ? 'Saindo...' : 'Sair da conta'}</button>
      </section>
    </div>
  );
}
