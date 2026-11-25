import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, Wallet, Bike, AlertCircle } from 'lucide-react';
import type { DeliveryCourierRecord, DeliveryDispatchRecord, OnlineOrderRecord } from '../types/finance';
import { getSupabaseClient } from '../lib/supabase';
import { formatCurrencyBRL } from '../utils/finance';

type Entry = {
  id: string; order_id: string; dispatch_id: string | null; courier_id: string | null;
  order_number: number; customer_name: string; delivery_fee: number; courier_amount: number;
  payout_status: 'pending' | 'paid'; payment_method: string | null; paid_at: string | null;
  notes: string; created_at: string;
};
interface Props {
  tenantId: string; userId: string; establishmentName: string;
  orders: OnlineOrderRecord[]; dispatches: DeliveryDispatchRecord[]; couriers: DeliveryCourierRecord[];
  onRefresh: () => Promise<void> | void;
}
const money = (value: number) => formatCurrencyBRL(Number(value || 0));
const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR');
export function DeliveryFinanceView({ tenantId, userId, establishmentName, orders, dispatches, couriers, onRefresh }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [period, setPeriod] = useState('30');
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Pix');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true); setError('');
    try {
      const { data, error: queryError } = await getSupabaseClient().from('delivery_finance_entries')
        .select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setEntries((data || []) as Entry[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o financeiro.'); }
    finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  const syncOrders = async () => {
    setBusy(true); setError('');
    try {
      const latestByOrder = new Map<string, DeliveryDispatchRecord>();
      for (const d of dispatches) if (d.dispatchStatus === 'delivered' && d.courierId) latestByOrder.set(d.orderId, d);
      const rows = orders.filter(o => o.fulfillmentType === 'delivery' && !['cancelled','rejected'].includes(o.status))
        .flatMap(o => {
          const d = latestByOrder.get(o.id);
          if (!d) return [];
          return [{ tenant_id: tenantId, order_id: o.id, dispatch_id: d.id, courier_id: d.courierId,
            order_number: o.orderNumber, customer_name: o.customerName, delivery_fee: Number(o.deliveryFee || 0),
            courier_amount: Number(o.deliveryFee || 0), notes: '' }];
        });
      if (rows.length) {
        const { error: upsertError } = await getSupabaseClient().from('delivery_finance_entries')
          .upsert(rows, { onConflict: 'tenant_id,order_id', ignoreDuplicates: true });
        if (upsertError) throw upsertError;
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao sincronizar entregas concluídas.'); }
    finally { setBusy(false); }
  };

  const saveAmount = async (entry: Entry) => {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) { setError('Informe um valor válido para o repasse.'); return; }
    setBusy(true); setError('');
    try {
      const { error: updateError } = await getSupabaseClient().from('delivery_finance_entries')
        .update({ courier_amount: parsed }).eq('id', entry.id).eq('tenant_id', tenantId);
      if (updateError) throw updateError;
      setEditing(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o valor.'); }
    finally { setBusy(false); }
  };

  const markPaid = async (entry: Entry) => {
    setBusy(true); setError('');
    try {
      const { error: updateError } = await getSupabaseClient().from('delivery_finance_entries')
        .update({ payout_status: 'paid', payment_method: method, paid_at: new Date().toISOString(), paid_by: userId })
        .eq('id', entry.id).eq('tenant_id', tenantId).eq('payout_status', 'pending');
      if (updateError) throw updateError;
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar o pagamento.'); }
    finally { setBusy(false); }
  };
  const visibleEntries = useMemo(() => {
    const cutoff = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
    return entries.filter(e => (filter === 'all' || e.payout_status === filter) && new Date(e.created_at).getTime() >= cutoff);
  }, [entries, filter, period]);
  const totals = useMemo(() => ({
    billed: visibleEntries.reduce((s,e) => s + Number(e.delivery_fee), 0),
    payable: visibleEntries.filter(e => e.payout_status === 'pending').reduce((s,e) => s + Number(e.courier_amount), 0),
    paid: visibleEntries.filter(e => e.payout_status === 'paid').reduce((s,e) => s + Number(e.courier_amount), 0),
  }), [visibleEntries]);
  const courierName = (id: string | null) => couriers.find(c => c.id === id)?.name || 'Entregador não localizado';

  return <div className="space-y-5">
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><p className="text-xs font-semibold text-[#A87900]">MGW DELIVERY · FINANCEIRO</p><h2 className="text-2xl font-extrabold text-[#172033]">Financeiro das entregas</h2><p className="text-sm text-[#778094]">{establishmentName} · taxas, repasses e pagamentos dos entregadores.</p></div>
      <div className="flex gap-2"><button onClick={() => void onRefresh()} className="mgw-btn-secondary"><RefreshCw className="w-4 h-4"/> Atualizar</button><button onClick={() => void syncOrders()} disabled={busy} className="mgw-btn-primary"><Wallet className="w-4 h-4"/> {busy ? 'Sincronizando...' : 'Sincronizar entregas concluídas'}</button></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <article className="rounded-2xl border border-[#E8EAF0] bg-white p-4"><p className="text-xs text-[#778094]">Taxas cobradas dos clientes</p><p className="mt-2 text-2xl font-bold text-[#172033]">{money(totals.billed)}</p><p className="text-xs text-[#778094] mt-1">Entregas concluídas no período</p></article>
      <article className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4"><p className="text-xs text-[#92400E]">Repasses pendentes</p><p className="mt-2 text-2xl font-bold text-[#92400E]">{money(totals.payable)}</p><p className="text-xs text-[#92400E] mt-1">{visibleEntries.filter(e=>e.payout_status==='pending').length} entregas aguardando pagamento</p></article>
      <article className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4"><p className="text-xs text-[#166534]">Total já repassado</p><p className="mt-2 text-2xl font-bold text-[#166534]">{money(totals.paid)}</p><p className="text-xs text-[#166534] mt-1">Pagamentos registrados no período</p></article>
    </section>
    <section className="rounded-2xl border border-[#E8EAF0] bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-[#172033]">Controle de repasses</h3><div className="flex flex-wrap gap-2">
        <select aria-label="Período" value={period} onChange={e=>setPeriod(e.target.value)} className="rounded-lg border border-[#D9DEE8] px-3 py-2 text-sm"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo o período</option></select>
        <select aria-label="Situação" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)} className="rounded-lg border border-[#D9DEE8] px-3 py-2 text-sm"><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option></select>
      </div></div>
      {loading ? <p className="py-8 text-center text-sm text-[#778094]">Carregando lançamentos...</p> : visibleEntries.length === 0 ? <div className="py-10 text-center"><Wallet className="w-8 h-8 mx-auto text-[#A0A7B5]"/><p className="mt-2 font-semibold text-[#172033]">Nenhum repasse encontrado</p><p className="text-sm text-[#778094]">Sincronize para importar entregas concluídas com entregador atribuído.</p></div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-[#E8EAF0] text-left text-xs text-[#778094]"><th className="p-3">Pedido</th><th className="p-3">Entregador</th><th className="p-3">Taxa cliente</th><th className="p-3">Repasse</th><th className="p-3">Situação</th><th className="p-3">Data</th><th className="p-3">Ação</th></tr></thead><tbody>
      {visibleEntries.map(entry=><tr key={entry.id} className="border-b border-[#F0F2F6]"><td className="p-3"><b>#{entry.order_number}</b><span className="block text-xs text-[#778094]">{entry.customer_name}</span></td><td className="p-3"><span className="inline-flex items-center gap-1.5"><Bike className="w-4 h-4"/>{courierName(entry.courier_id)}</span></td><td className="p-3">{money(entry.delivery_fee)}</td><td className="p-3">{editing===entry.id ? <span className="flex gap-1"><input aria-label="Valor do repasse" value={amount} onChange={e=>setAmount(e.target.value)} className="w-24 rounded border px-2 py-1"/><button onClick={()=>void saveAmount(entry)} className="text-xs font-semibold text-emerald-700">Salvar</button></span> : <button onClick={()=>{setEditing(entry.id);setAmount(String(entry.courier_amount));}} className="font-semibold underline decoration-dotted">{money(entry.courier_amount)} · editar</button>}</td><td className="p-3">{entry.payout_status==='paid' ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-4 h-4"/> Pago</span> : <span className="inline-flex items-center gap-1 text-amber-700"><Clock3 className="w-4 h-4"/> Pendente</span>}</td><td className="p-3">{dateLabel(entry.created_at)}</td><td className="p-3">{entry.payout_status==='pending' ? <span className="flex items-center gap-1"><select aria-label="Forma de pagamento" value={method} onChange={e=>setMethod(e.target.value)} className="max-w-24 rounded border px-1 py-1 text-xs"><option>Pix</option><option>Dinheiro</option><option>Transferência</option><option>Cartão</option></select><button disabled={busy} onClick={()=>void markPaid(entry)} className="rounded-lg bg-[#F5B900] px-2 py-1.5 text-xs font-bold text-[#172033]">Pagar</button></span> : <span className="text-xs text-[#778094]">{entry.payment_method || 'Registrado'}</span>}</td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
