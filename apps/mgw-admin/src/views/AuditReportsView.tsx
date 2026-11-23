import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { fetchAuditLogs } from '../services/adminApi';
import { exportAuditLogsToExcel, exportAuditLogsToPdf } from '../services/exportReports';
import { formatDateTimeBr } from '../services/rbac';
import type { PlatformAuditLogRecord } from '../types/admin';

interface AuditReportsViewProps {
  refreshTrigger: number;
}

export function AuditReportsView({ refreshTrigger }: AuditReportsViewProps) {
  const [logs, setLogs] = useState<PlatformAuditLogRecord[]>([]);
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLogs('all', targetTypeFilter, 150);
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar trilha de auditoria.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [refreshTrigger, targetTypeFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Auditoria &amp; Relatórios</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Trilha imutável (append-only) de ações administrativas em{' '}
            <code className="font-mono">platform_audit_logs</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
          >
            <option value="all">Todos os alvos</option>
            <option value="tenant">Estabelecimentos</option>
            <option value="subscription">Assinaturas</option>
            <option value="plan">Planos</option>
            <option value="tenant_member">Membros</option>
            <option value="platform_admin">Admins da Plataforma</option>
            <option value="platform_settings">Configurações</option>
            <option value="support_ticket">Chamados</option>
          </select>

          <button
            type="button"
            disabled={logs.length === 0}
            onClick={() => exportAuditLogsToExcel(logs)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={logs.length === 0}
            onClick={() => exportAuditLogsToPdf(logs)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5 text-[#F5B731]" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-500" />
            <span>Nenhuma ação administrativa registrada até o momento.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Data / Hora</th>
                  <th className="px-4 py-2.5 font-medium">Operador</th>
                  <th className="px-4 py-2.5 font-medium">Ação</th>
                  <th className="px-4 py-2.5 font-medium">Alvo</th>
                  <th className="px-4 py-2.5 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                      {formatDateTimeBr(log.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-slate-900">{log.admin_email}</span>
                      <span className="text-slate-500"> · {log.admin_role}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#F5B731]">{log.action}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-300">
                      {log.target_type}:{log.target_id.slice(0, 12)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 max-w-md">{log.reason || '—'}</td>
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
