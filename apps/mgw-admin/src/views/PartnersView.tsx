import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Handshake, KeyRound, RefreshCw, Save, Users, Wallet } from 'lucide-react';
import {
  fetchMgwPartners, fetchMgwPartnerSettings, updateMgwPartnerProgram, updateMgwPartnerStatus,
  fetchMgwPartnerCommissions, markMgwPartnerCommissionPaid, revealMgwPartnerPix,
  type MgwPartnerAdminRecord, type MgwPartnerCommissionRecord,
} from '../services/adminApi';
import type { PlatformRole } from '../types/admin';
import { PartnerProgramManagementView } from './PartnerProgramManagementView';
import { formatDateBr } from '../services/rbac';

interface Props { role:PlatformRole; mfaVerified:boolean; onRequestMfa:()=>void; refreshTrigger:number; }
export function PartnersView({role,mfaVerified,onRequestMfa,refreshTrigger}:Props){
  const [partners,setPartners]=useState<MgwPartnerAdminRecord[]>([]);
  const [commissions,setCommissions]=useState<MgwPartnerCommissionRecord[]>([]);
  const [percent,setPercent]=useState('15');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('all');
  const [commissionFilter,setCommissionFilter]=useState<'available'|'paid'|'all'>('available');
  const [revealedPix,setRevealedPix]=useState<Record<string,{pix_key:string;pix_key_type:string;holder_name:string}>>({});
  const [pixLoading,setPixLoading]=useState<string|null>(null);
  const [selected,setSelected]=useState<MgwPartnerCommissionRecord|null>(null);
  const [paymentReference,setPaymentReference]=useState('');
  const [paymentNote,setPaymentNote]=useState('');
  const [savingPayment,setSavingPayment]=useState(false);
  const canEdit=role==='super_admin';
  const canView=role==='super_admin'||role==='finance';
  const money=(cents:number)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  async function load(){
    setBusy(true);setError('');
    try{
      const [p,s,c]=await Promise.all([
        fetchMgwPartners(),fetchMgwPartnerSettings(),
        canView?fetchMgwPartnerCommissions(commissionFilter):Promise.resolve([]),
      ]);
      setPartners(p);setPercent(String(s.commission_percent));setCommissions(c);
    }catch(e){setError(e instanceof Error?e.message:'Falha ao carregar o programa de parceiros.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load();},[refreshTrigger,commissionFilter,role]);

  async function saveSettings(){
    if(!canEdit)return;
    if(!mfaVerified){onRequestMfa();return;}
    setBusy(true);setError('');setMessage('');
    try{
      const s=await updateMgwPartnerProgram({commissionPercent:Number(percent.replace(',','.')),reason});
      setPercent(String(s.commission_percent));setReason('');setMessage('Percentual atualizado. A nova regra vale somente para conversoes futuras.');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar as regras.');}
    finally{setBusy(false);}
  }
  async function changeStatus(p:MgwPartnerAdminRecord,status:'active'|'suspended'|'blocked'){
    if(!canEdit)return;
    if(!mfaVerified){onRequestMfa();return;}
    const why=window.prompt('Informe o motivo desta alteracao (minimo 3 caracteres):');
    if(!why||why.trim().length<3)return;
    setBusy(true);
    try{await updateMgwPartnerStatus(p.id,status,why);await load();}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar parceiro.');}
    finally{setBusy(false);}
  }
  async function showPix(partnerId:string){
    if(!canEdit)return;
    if(!mfaVerified){onRequestMfa();return;}
    setPixLoading(partnerId);setError('');
    try{
      const details=await revealMgwPartnerPix(partnerId);
      setRevealedPix(current=>({...current,[partnerId]:details}));
    }catch(e){setError(e instanceof Error?e.message:'Nao foi possivel consultar a chave Pix.');}
    finally{setPixLoading(null);}
  }
  async function confirmPayment(){
    if(!selected||!canEdit)return;
    if(!mfaVerified){onRequestMfa();return;}
    if(paymentReference.trim().length<8){setError('Informe o identificador da transferencia Pix (minimo 8 caracteres).');return;}
    setSavingPayment(true);setError('');setMessage('');
    try{
      const result=await markMgwPartnerCommissionPaid({commissionId:selected.id,paymentReference:paymentReference.trim(),paymentNote:paymentNote.trim()});
      setMessage('Pagamento registrado: '+money(result.amount_cents)+'. O saldo do parceiro foi atualizado.');
      setRevealedPix(current=>{const next={...current};delete next[selected.partner_id];return next;});
      setSelected(null);setPaymentReference('');setPaymentNote('');await load();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao registrar o pagamento.');}
    finally{setSavingPayment(false);}
  }
  const visible=partners.filter(p=>filter==='all'||p.status===filter);
  const pendingTotal=commissions.filter(c=>c.status==='available').reduce((n,c)=>n+c.amount_cents,0);

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Programa de parceiros</p><h1 className="mt-1 text-2xl font-bold text-slate-900">MGW Parceiros</h1><p className="mt-1 text-sm text-slate-500">Indicacoes, comissoes e pagamentos semanais individuais.</p></div><button onClick={()=>void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Atualizar</button></header>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}
    {message&&<div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-5"><Handshake className="h-5 w-5 text-amber-700"/><p className="mt-3 text-xs text-slate-500">Parceiros cadastrados</p><strong className="text-2xl">{partners.length}</strong></div>
      <div className="rounded-xl border bg-white p-5"><Users className="h-5 w-5 text-blue-700"/><p className="mt-3 text-xs text-slate-500">Indicacoes convertidas</p><strong className="text-2xl">{partners.reduce((n,p)=>n+p.converted_count,0)}</strong></div>
      <div className="rounded-xl border bg-white p-5"><Wallet className="h-5 w-5 text-emerald-700"/><p className="mt-3 text-xs text-slate-500">Comissoes a pagar</p><strong className="text-2xl">{money(partners.reduce((n,p)=>n+p.pending_cents,0))}</strong></div>
    </section>
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Regras comerciais</h2>
      <p className="mt-1 text-xs text-slate-500">Uma unica comissao por cliente indicado, no primeiro pagamento de assinatura aprovado. A porcentagem e o valor-base ficam registrados na conversao e nao mudam retroativamente.</p>
      <div className="mt-4 max-w-sm"><label className="text-xs font-semibold">Comissao por conversao (%)<input value={percent} onChange={e=>setPercent(e.target.value)} disabled={!canEdit} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label></div>
      {canEdit&&<><label className="mt-3 block text-xs font-semibold">Motivo da alteracao<input value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm" placeholder="Motivo obrigatorio"/></label><button onClick={()=>void saveSettings()} disabled={busy||reason.trim().length<3} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Salvar regras</button></>}
      {!canEdit&&<p className="mt-3 text-xs text-slate-500">Somente Superadmin pode alterar regras e registrar pagamentos.</p>}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><CalendarDays className="h-4 w-4"/>Pagamentos semanais: toda sexta-feira</div><p className="mt-1 text-xs text-amber-800">Toda sexta-feira o Superadmin confere a fila, faz cada Pix no banco e registra a transferencia individual. Valores nao pagos continuam disponiveis para a proxima semana.</p></div>
      <p className="mt-2 text-xs text-slate-400">Repasses automaticos Mercado Pago desativados. A ativacao futura exigira uma etapa separada.</p>
    </section>
    {canEdit&&<PartnerProgramManagementView />}
    {canView&&<section className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Fila de pagamentos</h2><p className="mt-1 text-xs text-slate-500">Cada linha e uma comissao individual; nao ha consolidacao automatica.</p></div><select value={commissionFilter} onChange={e=>setCommissionFilter(e.target.value as typeof commissionFilter)} className="rounded-lg border p-2 text-sm"><option value="available">A pagar</option><option value="paid">Pagas</option><option value="all">Todas</option></select></div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 p-3"><span className="text-sm text-slate-600">Total disponivel para pagamento</span><b>{money(pendingTotal)}</b></div>
      <div className="mt-4 space-y-3">
        {commissions.map(c=><article key={c.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{c.partner_name}</p><p className="text-xs text-slate-500">{c.partner_email} · codigo {c.referral_code}</p><p className="mt-1 text-xs text-slate-500">Conversao em {formatDateBr(c.created_at)} · base {money(c.base_amount_cents)} · comissao {c.commission_percent}%</p></div><div className="text-right"><p className="text-lg font-bold">{money(c.amount_cents)}</p><p className="text-xs text-slate-500">{c.status==='paid'?'Pago':c.status==='available'?'A pagar':c.status==='cancelled'?'Cancelada por estorno':c.status}</p></div></div>
          {canEdit&&c.status==='available'&&<div className="mt-3 flex flex-wrap items-center gap-2">
            {c.has_pix_key?<><button onClick={()=>revealedPix[c.partner_id]?setRevealedPix(current=>{const next={...current};delete next[c.partner_id];return next;}):void showPix(c.partner_id)} disabled={pixLoading===c.partner_id} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><KeyRound className="h-4 w-4"/>{pixLoading===c.partner_id?'Consultando...':revealedPix[c.partner_id]?'Ocultar chave Pix':'Exibir chave Pix'}</button>
              {revealedPix[c.partner_id]&&<div className="w-full rounded-lg bg-slate-50 p-3 text-sm"><p><b>{revealedPix[c.partner_id].holder_name}</b> · {revealedPix[c.partner_id].pix_key_type}</p><p className="mt-1 break-all font-mono">{revealedPix[c.partner_id].pix_key}</p></div>}
              <button onClick={()=>{setSelected(c);setPaymentReference('');setPaymentNote('');}} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-4 w-4"/>Registrar Pix realizado</button></>
              :<p className="text-xs text-amber-700">Parceiro ainda nao cadastrou uma chave Pix.</p>}
          </div>}
          {c.status==='paid'&&<p className="mt-3 text-xs text-emerald-700">Pago em {c.paid_at?formatDateBr(c.paid_at):'—'} · referencia {c.payment_reference||'—'}</p>}{c.reversal_required&&<p className="mt-2 rounded bg-amber-50 p-2 text-xs font-semibold text-amber-800">Pagamento da assinatura estornado apos repasse. Revisao administrativa necessaria.</p>}
        </article>)}
        {!commissions.length&&<p className="py-8 text-center text-sm text-slate-500">Nenhuma comissao encontrada.</p>}
      </div>
    </section>}
    <section className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Parceiros cadastrados</h2><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="all">Todos</option><option value="active">Ativos</option><option value="suspended">Suspensos</option><option value="blocked">Bloqueados</option></select></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Parceiro</th><th className="p-3">Codigo</th><th className="p-3">Indicacoes</th><th className="p-3">Convertidas</th><th className="p-3">A pagar</th><th className="p-3">Status</th><th className="p-3">Acoes</th></tr></thead><tbody className="divide-y">{visible.map(p=><tr key={p.id}><td className="p-3"><b>{p.full_name}</b><br/><span className="text-xs text-slate-500">{p.email}</span><br/><span className="text-xs text-slate-400">Desde {formatDateBr(p.created_at)}</span></td><td className="p-3 font-mono">{p.referral_code}</td><td className="p-3">{p.referral_count}</td><td className="p-3">{p.converted_count}</td><td className="p-3">{(p.pending_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td className="p-3">{p.status}</td><td className="p-3">{canEdit&&<select value={p.status} disabled={busy} onChange={e=>void changeStatus(p,e.target.value as 'active'|'suspended'|'blocked')} className="rounded border p-2 text-xs"><option value="active">Ativar</option><option value="suspended">Suspender</option><option value="blocked">Bloquear</option></select>}</td></tr>)}</tbody></table>{!visible.length&&<p className="py-8 text-center text-sm text-slate-500">Nenhum parceiro encontrado.</p>}</div>
    </section>
    {selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="partner-payment-title"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <h2 id="partner-payment-title" className="text-lg font-bold">Confirmar Pix realizado</h2><p className="mt-1 text-sm text-slate-600">{selected.partner_name} · {money(selected.amount_cents)}</p>
      <label className="mt-4 block text-xs font-semibold">Identificador da transferencia / EndToEnd ID<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} maxLength={180} className="mt-1 w-full rounded-lg border p-3 text-sm" placeholder="Referencia informada pelo banco"/></label>
      <label className="mt-3 block text-xs font-semibold">Observacao opcional<textarea value={paymentNote} onChange={e=>setPaymentNote(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label>
      <p className="mt-3 text-xs text-amber-700">Confirme somente depois de realizar o Pix no banco. Esta acao apenas registra o pagamento; nao transfere dinheiro.</p>
      <div className="mt-4 flex justify-end gap-2"><button onClick={()=>setSelected(null)} disabled={savingPayment} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button onClick={()=>void confirmPayment()} disabled={savingPayment||paymentReference.trim().length<8} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{savingPayment?'Registrando...':'Confirmar pagamento'}</button></div>
    </div></div>}
  </div>;
}
