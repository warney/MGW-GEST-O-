import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FileDown, FileSpreadsheet, Search, ShieldCheck, X } from 'lucide-react';
import { fetchAuditLogs } from '../services/adminApi';
import { exportAuditLogsToExcel, exportAuditLogsToPdf } from '../services/exportReports';
import { formatDateTimeBr } from '../services/rbac';
import type { PlatformAuditLogRecord } from '../types/admin';

interface AuditReportsViewProps {
  refreshTrigger: number;
  onInspectEstablishment?: (tenantId: string) => void;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AuditReportsView({ refreshTrigger, onInspectEstablishment }: AuditReportsViewProps) {
  const [logs, setLogs] = useState<PlatformAuditLogRecord[]>([]);
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<PlatformAuditLogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLogs(actionFilter, targetTypeFilter, 200);
      setLogs(data);
      setSelectedLog((prev) =>
        prev ? data.find((item) => item.id === prev.id) ?? null : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar trilha de auditoria.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [refreshTrigger, targetTypeFilter, actionFilter]);

  const availableActions = useMemo(() => {
    const unique = new Set(logs.map((l) => l.action));
    if (actionFilter !== 'all') unique.add(actionFilter);
    return Array.from(unique).sort();
  }, [logs, actionFilter]);

  const visibleLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (log) =>
        log.admin_email.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.target_id.toLowerCase().includes(q) ||
        log.target_type.toLowerCase().includes(q) ||
        (log.reason || '').toLowerCase().includes(q),
    );
  }, [logs, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Auditoria &amp; Relatórios</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Trilha imutável (append-only) de ações administrativas em{' '}
            <code className="font-mono">platform_audit_logs</code> ({visibleLogs.length} de {logs.length} eventos).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Operador, ação, alvo ou motivo..."
              className="w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
          >
            <option value="all">Todos os alvos</option>
            <option value="tenant">Estabelecimentos</option>
            <option value="subscription">Assinaturas</option>
            <option value="payment">Pagamentos</option>
            <option value="plan">Planos</option>
            <option value="tenant_member">Membros</option>
            <option value="platform_admin">Admins da Plataforma</option>
            <option value="platform_settings">Configurações</option>
            <option value="support_ticket">Chamados</option>
            <option value="partner">Parceiros</option>
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 max-w-48"
          >
            <option value="all">Todas as ações</option>
            {availableActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={visibleLogs.length === 0}
            onClick={() => exportAuditLogsToExcel(visibleLogs)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={visibleLogs.length === 0}
            onClick={() => exportAuditLogsToPdf(visibleLogs)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5 text-amber-600" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className={`grid grid-cols-1 ${selectedLog ? 'xl:grid-cols-3' : ''} gap-5`}>
        <div
          className={`${selectedLog ? 'xl:col-span-2' : ''} rounded-xl border border-slate-200 bg-white overflow-hidden`}
        >
          {loading ? (
            <div className="p-6 space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-500" />
              <span>Nenhum registro de auditoria corresponde aos filtros atuais.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Data / Hora</th>
                    <th className="px-4 py-2.5 font-medium">Operador</th>
                    <th className="px-4 py-2.5 font-medium">Ação</th>
                    <th className="px-4 py-2.5 font-medium">Alvo</th>
                    <th className="px-4 py-2.5 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleLogs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(isSelected ? null : log)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTimeBr(log.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-slate-900">{log.admin_email}</span>
                          <span className="text-slate-500"> · {log.admin_role}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-amber-700">
                          {log.action}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          {log.target_type}:{log.target_id.slice(0, 12)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-md truncate">
                          {log.reason || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedLog && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 h-fit space-y-4 text-xs">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <p className="font-mono font-semibold text-amber-700">{selectedLog.action}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {formatDateTimeBr(selectedLog.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar detalhes de auditoria"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Operador</span>
                <span className="font-mono text-slate-800 text-right break-all">
                  {selectedLog.admin_email} ({selectedLog.admin_role})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Alvo completo</span>
                <span className="font-mono text-slate-800 text-right break-all">
                  {selectedLog.target_type}:{selectedLog.target_id}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Motivo registrado</span>
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800">
                  {selectedLog.reason || '—'}
                </p>
              </div>
            </div>

            {selectedLog.before_data && (
              <div>
                <span className="text-slate-500 font-medium block mb-1">Estado anterior</span>
                <pre className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700 overflow-x-auto max-h-40">
                  {JSON.stringify(selectedLog.before_data, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.after_data && (
              <div>
                <span className="text-slate-500 font-medium block mb-1">Estado posterior</span>
                <pre className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-800 overflow-x-auto max-h-40">
                  {JSON.stringify(selectedLog.after_data, null, 2)}
                </pre>
              </div>
            )}

            {onInspectEstablishment &&
              ['tenant', 'subscription'].includes(selectedLog.target_type) &&
              UUID_REGEX.test(selectedLog.target_id) && (
                <button
                  type="button"
                  onClick={() => onInspectEstablishment(selectedLog.target_id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <span>Abrir estabelecimento alvo</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-amber-700" />
                </button>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
