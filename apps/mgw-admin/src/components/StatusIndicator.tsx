import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

export type IndicatorTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

export function resolveStatusMeta(status: string | null | undefined): {
  label: string;
  tone: IndicatorTone;
} {
  switch (status) {
    case 'active':
    case 'authorized':
    case 'approved':
    case 'processed':
    case 'resolved':
      return {
        label:
          status === 'approved'
            ? 'Aprovado'
            : status === 'processed'
              ? 'Processado'
              : status === 'resolved'
                ? 'Resolvido'
                : 'Ativo',
        tone: 'success',
      };
    case 'exempt':
      return { label: 'Isento', tone: 'accent' };
    case 'trialing':
      return { label: 'Trial ativo', tone: 'warning' };
    case 'past_due':
    case 'paused':
    case 'pending':
    case 'in_process':
    case 'in_progress':
    case 'waiting_client':
    case 'received':
    case 'open':
      return {
        label:
          status === 'past_due'
            ? 'Inadimplente'
            : status === 'paused'
              ? 'Em carência'
              : status === 'in_progress'
                ? 'Em atendimento'
                : status === 'waiting_client'
                  ? 'Aguardando cliente'
                  : status === 'open'
                    ? 'Aberto'
                    : 'Pendente',
        tone: 'warning',
      };
    case 'suspended':
    case 'cancelled':
    case 'expired':
    case 'rejected':
    case 'failed':
    case 'archived':
    case 'closed':
      return {
        label:
          status === 'suspended'
            ? 'Suspenso'
            : status === 'cancelled'
              ? 'Cancelado'
              : status === 'expired'
                ? 'Expirado'
                : status === 'rejected'
                  ? 'Recusado'
                  : status === 'failed'
                    ? 'Falhou'
                    : status === 'closed'
                      ? 'Encerrado'
                      : 'Arquivado',
        tone: 'danger',
      };
    case 'ignored':
      return { label: 'Ignorado', tone: 'neutral' };
    default:
      return { label: status || '—', tone: 'neutral' };
  }
}

export function StatusIndicator({
  status,
  labelOverride,
  toneOverride,
}: {
  status?: string | null;
  labelOverride?: string;
  toneOverride?: IndicatorTone;
}) {
  const meta = resolveStatusMeta(status);
  const label = labelOverride ?? meta.label;
  const tone = toneOverride ?? meta.tone;

  const toneClasses: Record<IndicatorTone, string> = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-rose-400',
    accent: 'text-[#F5B731]',
    neutral: 'text-slate-400',
  };

  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
        ? Clock
        : tone === 'danger'
          ? XCircle
          : tone === 'accent'
            ? ShieldCheck
            : AlertTriangle;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${toneClasses[tone]}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function MfaBadgeIndicator({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 whitespace-nowrap">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      <span>MFA AAL2</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400 whitespace-nowrap">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span>MFA AAL1</span>
    </span>
  );
}
