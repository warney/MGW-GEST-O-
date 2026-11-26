import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowUpRight, Info, Search, Webhook, X } from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import { fetchWebhookEvents } from '../services/adminApi';
import { formatDateTimeBr } from '../services/rbac';
import type { WebhookEventRecord } from '../types/admin';

interface MonitoringViewProps {
  refreshTrigger: number;
  onInspectEstablishment?: (tenantId: string) => void;
}

export function MonitoringView({ refreshTrigger, onInspectEstablishment }: MonitoringViewProps) {
  const [events, setEvents] = useState<WebhookEventRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<WebhookEventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWebhookEvents(statusFilter, 120);
      setEvents(data);
      setSelectedEvent((prev) =>
        prev ? data.find((ev) => ev.id === prev.id) ?? null : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar eventos de monitoramento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [refreshTrigger, statusFilter]);

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.event_type.toLowerCase().includes(q) ||
        (ev.action || '').toLowerCase().includes(q) ||
        (ev.resource_id || '').toLowerCase().includes(q) ||
        (ev.tenant_name || '').toLowerCase().includes(q) ||
        (ev.error_message || '').toLowerCase().includes(q),
    );
  }, [events, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Monitoramento Técnico</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Auditoria sanitizada de webhooks (<code className="font-mono">mp_webhook_events</code>) e
          status de integrações da plataforma.
        </p>
      </div>

      {/* Honest Pending Edge Functions Telemetry Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Activity className="h-4 w-4 text-amber-600" />
              <span>Edge Functions (Supabase Runtime)</span>
            </div>
            <span className="text-[11px] font-mono font-semibold text-amber-700">
              Telemetria pendente
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Funções registradas no projeto:{' '}
            <code className="font-mono font-semibold text-slate-800">menu-storage</code>,{' '}
            <code className="font-mono font-semibold text-slate-800">send-order-push</code> e{' '}
            <code className="font-mono font-semibold text-slate-800">admin-partner-pix</code>. Logs
            em tempo real permanecem no Supabase Dashboard.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Webhook className="h-4 w-4 text-sky-700" />
              <span>Receptor Mercado Pago</span>
            </div>
            <span className="text-[11px] font-mono font-semibold text-amber-700">
              Integração pendente
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            A tabela <code className="font-mono font-semibold text-slate-800">mp_webhook_events</code>{' '}
            está monitorada abaixo (payloads brutos omitidos por segurança). Clique em um evento para
            inspecionar detalhes técnicos.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className={`grid grid-cols-1 ${selectedEvent ? 'xl:grid-cols-3' : ''} gap-5`}>
        <div
          className={`${selectedEvent ? 'xl:col-span-2' : ''} rounded-xl border border-slate-200 bg-white overflow-hidden`}
        >
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Eventos Webhook Recebidos ({visibleEvents.length})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Evento, recurso ou loja..."
                  className="w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="all">Todos</option>
                <option value="processed">Processados</option>
                <option value="received">Recebidos</option>
                <option value="ignored">Ignorados</option>
                <option value="failed">Com falha</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-6 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Info className="h-5 w-5 text-slate-500" />
              <span>
                Nenhum evento registrado para o filtro atual em{' '}
                <code className="font-mono">mp_webhook_events</code>.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
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
                  {visibleEvents.map((ev) => {
                    const isSelected = selectedEvent?.id === ev.id;
                    return (
                      <tr
                        key={ev.id}
                        onClick={() => setSelectedEvent(isSelected ? null : ev)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-slate-900">{ev.event_type}</p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {ev.action || '—'} · {ev.resource_id || ev.id.slice(0, 12)}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{ev.tenant_name || '—'}</td>
                        <td className="px-4 py-2.5">
                          <StatusIndicator
                            status={ev.signature_verified ? 'active' : 'failed'}
                            labelOverride={ev.signature_verified ? 'Válida' : 'Não verificada'}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusIndicator status={ev.processing_status} />
                        </td>
                        <td className="px-4 py-2.5 text-rose-700 max-w-xs truncate">
                          {ev.error_message || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTimeBr(ev.received_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedEvent && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 h-fit space-y-4 text-xs">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <p className="font-mono font-semibold text-amber-700">{selectedEvent.event_type}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {formatDateTimeBr(selectedEvent.received_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar inspeção do evento"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">ID do evento</span>
                <span className="font-mono text-slate-800 text-right break-all">
                  {selectedEvent.id}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Ação</span>
                <span className="font-mono text-slate-800">{selectedEvent.action || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Recurso</span>
                <span className="font-mono text-slate-800 text-right break-all">
                  {selectedEvent.resource_id || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Assinatura</span>
                <StatusIndicator
                  status={selectedEvent.signature_verified ? 'active' : 'failed'}
                  labelOverride={selectedEvent.signature_verified ? 'Válida' : 'Não verificada'}
                />
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Processado em</span>
                <span className="font-mono text-slate-700 tabular-nums">
                  {formatDateTimeBr(selectedEvent.processed_at)}
                </span>
              </div>
              {selectedEvent.error_message && (
                <div>
                  <span className="text-slate-500 block mb-1">Mensagem de erro</span>
                  <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-800 font-mono text-[11px] break-words">
                    {selectedEvent.error_message}
                  </p>
                </div>
              )}
            </div>

            {selectedEvent.tenant_id && onInspectEstablishment && (
              <button
                type="button"
                onClick={() => onInspectEstablishment(selectedEvent.tenant_id!)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <span>Abrir loja vinculada</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-amber-700" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
