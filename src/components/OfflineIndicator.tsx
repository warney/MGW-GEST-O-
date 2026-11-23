import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, X } from 'lucide-react';

interface OfflineIndicatorProps {
  variant?: 'floating' | 'badge';
}

export function useNetworkConnectionStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  );
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? !navigator.onLine
      : false,
  );

  useEffect(() => {
    let reconnectTimer: number | undefined;

    const onOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setJustReconnected(true);
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          setJustReconnected(false);
        }, 5000);
      }
    };

    const onOffline = () => {
      wasOfflineRef.current = true;
      setJustReconnected(false);
      setIsOnline(false);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, []);

  return {
    isOnline,
    justReconnected,
    dismissReconnected: () => setJustReconnected(false),
  };
}

export function OfflineIndicator({
  variant = 'floating',
}: OfflineIndicatorProps) {
  const { isOnline, justReconnected, dismissReconnected } =
    useNetworkConnectionStatus();

  if (variant === 'badge') {
    if (!isOnline) {
      return (
        <span
          role="status"
          aria-live="polite"
          title="Sem conexão com a internet. Aguardando reconexão."
          className="no-print min-h-[34px] px-2.5 rounded-full bg-[#FFFBEB] border border-[#F5B900] text-[#8A6200] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <WifiOff className="w-3.5 h-3.5 text-[#B45309] shrink-0" aria-hidden="true" />
          <span>Sem conexão</span>
        </span>
      );
    }

    if (justReconnected) {
      return (
        <span
          role="status"
          aria-live="polite"
          title="Conexão com a internet restabelecida"
          className="no-print min-h-[34px] px-2.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Reconectado</span>
        </span>
      );
    }

    return (
      <span
        role="status"
        aria-label="Conectado à internet"
        title="Conectado à internet"
        className="no-print hidden sm:inline-flex min-h-[34px] px-2.5 rounded-full bg-white border border-[#E8EAF0] text-[#15803D] text-[11px] font-medium items-center gap-1.5 whitespace-nowrap shrink-0"
      >
        <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden xl:inline text-[#778094]">Online</span>
      </span>
    );
  }

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="no-print mgw-offline-banner fixed bottom-20 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-sm lg:bottom-5 z-40 flex items-start gap-2.5 rounded-2xl bg-[#FFFBEB] border border-[#F5B900] px-4 py-3 text-xs text-[#172033] shadow-[0_12px_30px_rgba(23,32,51,0.14)]"
      >
        <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] flex items-center justify-center shrink-0">
          <WifiOff className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-bold text-[#172033] leading-snug">
            Sem conexão com a internet
          </p>
          <p className="text-[11px] text-[#4B5563] leading-relaxed">
            Exibindo dados disponíveis em tela. Novos pedidos e alterações aguardam a reconexão.
          </p>
        </div>
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="no-print mgw-offline-banner fixed bottom-20 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-sm lg:bottom-5 z-40 flex items-center gap-2.5 rounded-2xl bg-[#ECFDF5] border border-[#16A36A] px-4 py-3 text-xs text-[#172033] shadow-[0_12px_30px_rgba(23,32,51,0.14)]"
      >
        <div className="w-8 h-8 rounded-xl bg-[#D1FAE5] border border-[#A7F3D0] text-[#15803D] flex items-center justify-center shrink-0">
          <Wifi className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#172033] leading-snug">
            Conexão restabelecida
          </p>
          <p className="text-[11px] text-[#15803D] leading-snug">
            Você está online novamente e os dados seguem atualizados.
          </p>
        </div>
        <button
          type="button"
          onClick={dismissReconnected}
          aria-label="Fechar aviso de reconexão"
          className="w-7 h-7 rounded-lg text-[#15803D] hover:bg-[#D1FAE5] flex items-center justify-center shrink-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
