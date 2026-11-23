import { useEffect, useState } from 'react';
import { Activity, AlertCircle, Info, Webhook } from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import { fetchWebhookEvents } from '../services/adminApi';
import { formatDateTimeBr } from '../services/rbac';
import type { WebhookEventRecord } from '../types/admin';

interface MonitoringViewProps {
  refreshTrigger: number;
}

export function MonitoringView({ refreshTrigger }: MonitoringViewProps) {
  const [events, setEvents] = useState<WebhookEventRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWebhookEvents(statusFilter, 120);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar eventos de monitoramento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [refreshTrigger, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Monitoramento Técnico</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Auditoria sanitizada de webhooks (<code className="font-mono">mp_webhook_events</code>) e
          status de integrações da plataforma.
        </p>
      </div>

      {/* Honest Pending Edge Functions Telemetry Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Activity className="h-4 w-4 text-[#F5B731]" />
              <span>Edge Functions (Supabase Runtime)</span>
            </div>
            <span className="text-[11px] font-mono text-amber-400">Telemetria pendente</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Funções registradas no projeto: <code className="font-mono text-slate-300">menu-storage</code> e{' '}
            <code className="font-mono text-slate-300">send-order-push</code>. Logs de execução em
            tempo real não estão expostos via SQL cliente por padrão no Supabase; consulte o Supabase
            Dashboard ou habilite um coletor dedicado se necessário.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Webhook className="h-4 w-4 text-sky-400" />
              <span>Receptor Mercado Pago</span>
            </div>
            <span className="text-[11px] font-mono text-amber-400">Integração pendente</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            A tabela <code className="font-mono text-slate-300">mp_webhook_events</code> está pronta e
            monitorada abaixo (payloads brutos omitidos por segurança). Eventos passarão a aparecer
            automaticamente quando o webhook do Mercado Pago for ativado.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Eventos Webhook Recebidos</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-[#0B0D11] px-2.5 py-1.5 text-xs text-white"
          >
            <option value="all">Todos</option>
            <option value="processed">Processados</option>
            <option value="received">Recebidos</option>
            <option value="ignored">Ignorados</option>
            <option value="failed">Com falha</option>
          </select>
        </div>

        {loading ? (
          <div className="p-6 space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <Info className="h-5 w-5 text-slate-500" />
            <span>Nenhum evento registrado em <code className="font-mono">mp_webhook_events</code>.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Evento</th>
                  <th className="px-4 py-2.5 font-medium">Estabelecimento</th>
                  <th className="px-4 py-2.5 font-medium">Assinatura</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Erro</th>
                  <th className="px-4 py-2.5 font-medium text-right">Recebido em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-white">{ev.event_type}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {ev.action || '—'} · {ev.resource_id || ev.id}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{ev.tenant_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <StatusIndicator
                        status={ev.signature_verified ? 'active' : 'failed'}
                        labelOverride={ev.signature_verified ? 'Válida' : 'Não verificada'}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusIndicator status={ev.processing_status} />
                    </td>
                    <td className="px-4 py-2.5 text-rose-300 max-w-xs truncate">
                      {ev.error_message || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400 tabular-nums">
                      {formatDateTimeBr(ev.received_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
