import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Copy, ExternalLink, FolderOpen, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';

type LeadStage = 'new' | 'contacted' | 'demo_scheduled' | 'demo_completed' | 'awaiting_decision' | 'converted' | 'not_converted';
type Lead = { id:string; contact_name:string; establishment_name:string; phone:string; email:string; segment:string; city:string; notes:string; next_follow_up_at:string|null; stage:LeadStage; campaign_id:string|null; created_at:string };
type Campaign = { id:string; slug:string; name:string; objective:string; instructions:string; starts_at:string|null; ends_at:string|null };
type Material = { id:string; title:string; description:string; category:string; resource_url:string; resource_type:string };

const STAGES: Array<{value:LeadStage;label:string}> = [
  {value:'new',label:'Novo interessado'}, {value:'contacted',label:'Em contato'},
  {value:'demo_scheduled',label:'Demonstração agendada'}, {value:'demo_completed',label:'Demonstração realizada'},
  {value:'awaiting_decision',label:'Aguardando decisão'}, {value:'converted',label:'Convertido'},
  {value:'not_converted',label:'Não convertido'},
];
const field='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100';

export function PartnerCrmView({referralCode}:{referralCode:string}){
  const [partnerId,setPartnerId]=useState('');
  const [leads,setLeads]=useState<Lead[]>([]);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [materials,setMaterials]=useState<Material[]>([]);
  const [metrics,setMetrics]=useState<Record<string,unknown>>({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [contactName,setContactName]=useState('');
  const [establishmentName,setEstablishmentName]=useState('');
  const [phone,setPhone]=useState('');
  const [email,setEmail]=useState('');
  const [segment,setSegment]=useState('');
  const [city,setCity]=useState('');
  const [notes,setNotes]=useState('');
  const [followUp,setFollowUp]=useState('');
  const [campaignId,setCampaignId]=useState('');

  const supabase=getSupabaseClient();
  async function load(){
    setLoading(true);setError('');
    try{
      const {data:userData,error:userError}=await supabase.auth.getUser();
      if(userError||!userData.user) throw new Error('Sessão do parceiro não encontrada.');
      const {data:partnerData,error:partnerError}=await supabase.from('mgw_partners').select('id').eq('user_id',userData.user.id).single();
      if(partnerError||!partnerData) throw new Error(partnerError?.message||'Conta de parceiro não encontrada.');
      const id=(partnerData as {id:string}).id;setPartnerId(id);
      const [leadResult,campaignResult,materialResult,metricResult]=await Promise.all([
        supabase.from('mgw_partner_leads').select('*').eq('partner_id',id).order('updated_at',{ascending:false}),
        supabase.from('mgw_partner_campaigns').select('id,slug,name,objective,instructions,starts_at,ends_at').eq('status','active').order('created_at',{ascending:false}),
        supabase.from('mgw_partner_materials').select('id,title,description,category,resource_url,resource_type').eq('active',true).order('sort_order'),
        supabase.rpc('partner_get_crm_dashboard'),
      ]);
      if(leadResult.error) throw new Error(leadResult.error.message);
      if(campaignResult.error) throw new Error(campaignResult.error.message);
      if(materialResult.error) throw new Error(materialResult.error.message);
      if(metricResult.error) throw new Error(metricResult.error.message);
      setLeads((leadResult.data||[]) as Lead[]);
      setCampaigns((campaignResult.data||[]) as Campaign[]);
      setMaterials((materialResult.data||[]) as Material[]);
      setMetrics((metricResult.data||{}) as Record<string,unknown>);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar a área comercial.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  async function createLead(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!partnerId||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const {error:insertError}=await supabase.from('mgw_partner_leads').insert({
        partner_id:partnerId,contact_name:contactName.trim(),establishment_name:establishmentName.trim(),
        phone:phone.trim(),email:email.trim().toLowerCase(),segment:segment.trim(),city:city.trim(),
        notes:notes.trim(),next_follow_up_at:followUp?new Date(followUp+'T12:00:00').toISOString():null,
        campaign_id:campaignId||null,created_by:(await supabase.auth.getUser()).data.user?.id,
      });
      if(insertError)throw new Error(insertError.message);
      setContactName('');setEstablishmentName('');setPhone('');setEmail('');setSegment('');setCity('');setNotes('');setFollowUp('');setCampaignId('');
      setNotice('Interessado cadastrado com sucesso.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível cadastrar o interessado.');}
    finally{setSaving(false);}
  }
  async function changeStage(lead:Lead,stage:LeadStage){
    const {error:updateError}=await supabase.from('mgw_partner_leads').update({stage,updated_by:(await supabase.auth.getUser()).data.user?.id,updated_at:new Date().toISOString()}).eq('id',lead.id).eq('partner_id',partnerId);
    if(updateError){setError(updateError.message);return;} await load();
  }
  async function removeLead(lead:Lead){
    if(!window.confirm('Excluir este interessado? O histórico da ação será preservado.'))return;
    const {error:deleteError}=await supabase.from('mgw_partner_leads').delete().eq('id',lead.id).eq('partner_id',partnerId);
    if(deleteError){setError(deleteError.message);return;} await load();
  }
  const metric=(key:string)=>Number(metrics[key]||0).toLocaleString('pt-BR');
  const moneyDate=(value:string|null)=>value?new Date(value).toLocaleDateString('pt-BR'):'Sem data';

  return <section className="mt-7 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Central comercial</p><h2 className="mt-1 text-xl font-extrabold">Interessados, campanhas e materiais</h2><p className="mt-1 text-sm text-slate-500">Organize suas prospecções e acompanhe o resultado das divulgações.</p></div><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4"/>Atualizar</button></div>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Acessos ao link',metric('click_count')],['Interessados',metric('lead_count')],['Em negociação',metric('open_lead_count')],['Convertidos no CRM',metric('converted_lead_count')]].map(([label,value])=><article key={label} className="rounded-2xl border bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{loading?'—':value}</p></article>)}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <form onSubmit={event=>void createLead(event)} className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-amber-700"/><h3 className="font-bold">Cadastrar interessado</h3></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Nome do contato<input className={field+' mt-1'} value={contactName} onChange={e=>setContactName(e.target.value)} required maxLength={120}/></label>
          <label className="text-xs font-semibold text-slate-600">Estabelecimento<input className={field+' mt-1'} value={establishmentName} onChange={e=>setEstablishmentName(e.target.value)} required maxLength={160}/></label>
          <label className="text-xs font-semibold text-slate-600">WhatsApp<input className={field+' mt-1'} value={phone} onChange={e=>setPhone(e.target.value)} maxLength={40} placeholder="(00) 00000-0000"/></label>
          <label className="text-xs font-semibold text-slate-600">E-mail<input type="email" className={field+' mt-1'} value={email} onChange={e=>setEmail(e.target.value)} maxLength={254}/></label>
          <label className="text-xs font-semibold text-slate-600">Segmento<input className={field+' mt-1'} value={segment} onChange={e=>setSegment(e.target.value)} maxLength={80} placeholder="Lanchonete, pizzaria..."/></label>
          <label className="text-xs font-semibold text-slate-600">Cidade<input className={field+' mt-1'} value={city} onChange={e=>setCity(e.target.value)} maxLength={120}/></label>
          <label className="text-xs font-semibold text-slate-600">Próximo acompanhamento<input type="date" className={field+' mt-1'} value={followUp} onChange={e=>setFollowUp(e.target.value)}/></label>
          <label className="text-xs font-semibold text-slate-600">Campanha<select className={field+' mt-1'} value={campaignId} onChange={e=>setCampaignId(e.target.value)}><option value="">Sem campanha</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="sm:col-span-2 text-xs font-semibold text-slate-600">Observações<textarea className={field+' mt-1 min-h-20'} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={3000}/></label>
        </div>
        <button disabled={saving||!contactName.trim()||!establishmentName.trim()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#172033] px-4 text-sm font-bold text-white disabled:opacity-50">{saving?'Salvando...':'Cadastrar interessado'}</button>
      </form>
      <div className="space-y-5">
        <section className="rounded-2xl border bg-white p-5"><div className="mb-3 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-700"/><h3 className="font-bold">Campanhas ativas</h3></div>
          {campaigns.length?campaigns.map(c=><article key={c.id} className="border-t py-3 first:border-0"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{c.name}</p><p className="mt-1 text-xs text-slate-500">{c.objective||c.instructions||'Campanha de divulgação MGW'}</p><p className="mt-1 text-[11px] text-slate-400">Acessos: {((metrics.campaigns as Array<{id:string;clicks:number}>|undefined)||[]).find(x=>x.id===c.id)?.clicks||0} · Início: {moneyDate(c.starts_at)}</p></div><button type="button" onClick={()=>{const url=new URL('/cadastro',window.location.origin);url.searchParams.set('ref',referralCode);url.searchParams.set('campanha',c.slug);void navigator.clipboard.writeText(url.toString()).then(()=>setNotice('Link da campanha copiado.')).catch(()=>setError('Não foi possível copiar o link.'));}} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-[11px] font-bold text-slate-700"><Copy className="h-3.5 w-3.5"/>Copiar link</button></div></article>):<p className="text-sm text-slate-500">Nenhuma campanha ativa no momento.</p>}
        </section>
        <section className="rounded-2xl border bg-white p-5"><div className="mb-3 flex items-center gap-2"><FolderOpen className="h-5 w-5 text-amber-700"/><h3 className="font-bold">Materiais de divulgação</h3></div>
          {materials.length?materials.map(m=><article key={m.id} className="flex items-start justify-between gap-3 border-t py-3 first:border-0"><div><p className="text-sm font-semibold">{m.title}</p><p className="mt-1 text-xs text-slate-500">{m.description||m.category}</p></div><a href={m.resource_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-amber-700">Abrir <ExternalLink className="h-3.5 w-3.5"/></a></article>):<p className="text-sm text-slate-500">Os materiais serão disponibilizados pelo MGW.</p>}
        </section>
      </div>
    </div>
    <section className="rounded-2xl border bg-white p-5"><div className="mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-amber-700"/><h3 className="font-bold">Meus interessados</h3><span className="ml-auto text-xs text-slate-500">{leads.length} registros</span></div>
      {loading?<p className="py-5 text-sm text-slate-500">Carregando interessados...</p>:leads.length?leads.map(lead=><article key={lead.id} className="border-t py-4 first:border-0"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-bold">{lead.establishment_name}</p><p className="text-sm text-slate-600">{lead.contact_name}{lead.phone?' · '+lead.phone:''}</p><p className="mt-1 text-xs text-slate-500">{[lead.segment,lead.city].filter(Boolean).join(' · ')||'Sem segmento/cidade'} · Próximo contato: {moneyDate(lead.next_follow_up_at)}</p>{lead.notes&&<p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">{lead.notes}</p>}</div><div className="flex items-center gap-2"><select aria-label={'Etapa de '+lead.establishment_name} className="max-w-[220px] rounded-lg border px-2 py-2 text-xs" value={lead.stage} onChange={e=>void changeStage(lead,e.target.value as LeadStage)}>{STAGES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select><button aria-label={'Excluir '+lead.establishment_name} onClick={()=>void removeLead(lead)} className="rounded-lg border p-2 text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></div></div></article>):<p className="py-5 text-sm text-slate-500">Você ainda não cadastrou interessados. Registre aqui os estabelecimentos com quem conversou.</p>}
    </section>
  </section>;
}
