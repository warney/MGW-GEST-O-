import { Database, RefreshCw } from 'lucide-react';

interface PendingIntegrationBannerProps {
  moduleName: string;
  requiredRpc: string;
  detail?: string;
  onRetry?: () => void;
}

export function PendingIntegrationBanner({
  moduleName,
  requiredRpc,
  detail,
  onRetry,
}: PendingIntegrationBannerProps) {
  return (
    <div className="rounded-lg border border-amber-500/35 bg-[#12151C] p-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md border border-amber-500/35 bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
          <Database className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-white">
              Integração pendente para {moduleName}
            </h2>
            <span className="font-mono text-[11px] text-amber-400">
              · Aguardando migration 20261122000001
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            A função protegida <code className="font-mono text-[#F5B731]">{requiredRpc}</code> ainda
            não está disponível no Supabase remoto. Por segurança, o MGW Admin não executa consultas
            diretas às tabelas operacionais para contornar esta etapa.
          </p>
          {detail && <p className="text-[11px] font-mono text-slate-500">{detail}</p>}
        </div>
      </div>

      {onRetry && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2A3040] bg-[#0B0D11] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#1B202C] cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Verificar novamente</span>
          </button>
        </div>
      )}
    </div>
  );
}
