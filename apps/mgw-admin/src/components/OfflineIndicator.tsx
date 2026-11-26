import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-950 shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-700 shrink-0" aria-hidden="true" />
      <span>Sem conexão — reconecte para consultar ou salvar dados administrativos.</span>
    </div>
  );
}
