import { useEffect, useState } from 'react';
import { AlertCircle, Handshake, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
import {
  fetchMgwPartners, fetchMgwPartnerSettings, updateMgwPartnerProgram, updateMgwPartnerStatus,
  type MgwPartnerAdminRecord, type MgwPartnerProgramSettings,
} from '../services/adminApi';
import type { PlatformRole } from '../types/admin';
import { formatCurrencyCents, formatDateBr } from '../services/rbac';

interface Props { role:PlatformRole; mfaVerified:boolean; onRequestMfa:()=>void; refreshTrigger:number; }
export function PartnersView({role,mfaVerified,onRequestMfa,refreshTrigger}:Props){
  const [partners,setPartners]=useState<MgwPartnerAdminRecord[]>([]);
  const [settings,setSettings]=useState<MgwPartnerProgramSettings|null>(null);
  const [percent,setPercent]=useState('15');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('all');
  const canEdit=role==='super_admin';
  async function load(){
    setBusy(true);setError('');
    try{const [p,s]=await Promise.all([fetchMgwPartners(),fetchMgwPartnerSettings()]);setPartners(p);setSettings(s);setPercent(String(s.commission_percent));}
    catch(e){setError(e instanceof Error?e.message:'Falha ao carregar parceiros.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load();},[refreshTrigger]);
  async function saveSettings(){
    if(!canEdit)return;
    if(!mfaVerified){onRequestMfa();return;}
    setBusy(true);setError('');setMessage('');
    try{const s=await updateMgwPartnerProgram({commissionPercent:Number(percent.replace(',','.')),reason});setSettings(s);setReason('');setMessage('Configurações atualizadas. As novas regras valem para conversões futuras.');}
    catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}
    finally{setBusy(false);}
  }
  async function changeStatus(p:MgwPartnerAdminRecord,status:'active'|'suspended'|'blocked'){
    if(!canEdit)return;
    if(!mfaVerified){onRequestMfa();return;}
    const why=window.prompt('Informe o motivo desta alteração (mínimo 3 caracteres):');
    if(!why||why.trim().length<3)return;
    setBusy(true);
    try{await updateMgwPartnerStatus(p.id,status,why);await load();}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar parceiro.');}
    finally{setBusy(false);}
  }
  const visible=partners.filter(p=>filter==='all'||p.status===filter);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Programa de parceiros</p><h1 className="mt-1 text-2xl font-bold text-slate-900">MGW Parceiros</h1><p className="mt-1 text-sm text-slate-500">Gestão de afiliados, conversões e comissões.</p></div><button onClick={()=>void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Atualizar</button></header>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}
    {message&&<div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-5"><Handshake className="h-5 w-5 text-amber-700"/><p className="mt-3 text-xs text-slate-500">Parceiros cadastrados</p><strong className="text-2xl">{partners.length}</strong></div>
      <div className="rounded-xl border bg-white p-5"><Users className="h-5 w-5 text-blue-700"/><p className="mt-3 text-xs text-slate-500">Indicações convertidas</p><strong className="text-2xl">{partners.reduce((n,p)=>n+p.converted_count,0)}</strong></div>
      <div className="rounded-xl border bg-white p-5"><ShieldCheck className="h-5 w-5 text-emerald-700"/><p className="mt-3 text-xs text-slate-500">Comissões a pagar</p><strong className="text-2xl">{formatCurrencyCents(partners.reduce((n,p)=>n+p.pending_cents,0))}</strong></div>
    </section>
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Regras comerciais</h2><p className="mt-1 text-xs text-slate-500">A comissão é gerada uma única vez, no primeiro pagamento aprovado do cliente indicado. O preço da assinatura continua sendo administrado em Planos & Assinaturas. Alterações não recalculam comissões existentes.</p>
      <div className="mt-4 max-w-sm"><label className="text-xs font-semibold">Comissão por conversão (%)<input value={percent} onChange={e=>setPercent(e.target.value)} disabled={!canEdit} className="mt-1 w-full rounded-lg border p-3 text-sm"/></label></div>
      {canEdit&&<><label className="mt-3 block text-xs font-semibold">Motivo da alteração<input value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm" placeholder="Descreva o motivo (obrigatório)"/></label><button onClick={()=>void saveSettings()} disabled={busy||reason.trim().length<3} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Salvar regras</button></>}
      {!canEdit&&<p className="mt-3 text-xs text-slate-500">Somente Superadmin pode alterar regras comerciais.</p>}
      <p className="mt-2 text-xs text-slate-400">Payout automático: {settings?.payout_enabled?'habilitado':'aguardando credenciais e homologação da API Payouts'}</p>
    </section>
    <section className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Parceiros cadastrados</h2><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="all">Todos</option><option value="active">Ativos</option><option value="suspended">Suspensos</option><option value="blocked">Bloqueados</option></select></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Parceiro</th><th className="p-3">Código</th><th className="p-3">Indicações</th><th className="p-3">Convertidas</th><th className="p-3">A pagar</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead><tbody className="divide-y">{visible.map(p=><tr key={p.id}><td className="p-3"><b>{p.full_name}</b><br/><span className="text-xs text-slate-500">{p.email}</span><br/><span className="text-xs text-slate-400">Desde {formatDateBr(p.created_at)}</span></td><td className="p-3 font-mono">{p.referral_code}</td><td className="p-3">{p.referral_count}</td><td className="p-3">{p.converted_count}</td><td className="p-3">{formatCurrencyCents(p.pending_cents)}</td><td className="p-3">{p.status}</td><td className="p-3">{canEdit&&<select value={p.status} disabled={busy} onChange={e=>void changeStatus(p,e.target.value as 'active'|'suspended'|'blocked')} className="rounded border p-2 text-xs"><option value="active">Ativar</option><option value="suspended">Suspender</option><option value="blocked">Bloquear</option></select>}</td></tr>)}</tbody></table>{!visible.length&&<p className="py-8 text-center text-sm text-slate-500">Nenhum parceiro encontrado.</p>}</div>
    </section>
  </div>;
}
