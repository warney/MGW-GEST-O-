import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  appName?: string;
  installLabel?: string;
}

export function PWAInstallButton({ appName = 'MGW Gestão', installLabel = 'Instalar no celular' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="min-h-[40px] px-3.5 rounded-xl border border-[#F5B731]/50 bg-[#F5B731]/12 hover:bg-[#F5B731]/20 text-[#F5B731] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{installLabel}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[40px] px-3.5 rounded-xl border border-[#F5B731]/50 bg-[#F5B731]/12 hover:bg-[#F5B731]/20 text-[#F5B731] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{installLabel}</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-guide-title"
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="max-w-sm w-full bg-[#12151C] border border-[#232834] rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3
                  id="ios-pwa-guide-title"
                  className="text-sm font-bold text-[#F3F4F6]"
                >
                  Instalar {appName} no iPhone
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fechar instruções"
                  className="w-8 h-8 rounded-lg border border-[#232834] text-[#9CA3AF] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#D1D5DB] leading-relaxed">
                No iPhone e iPad, as notificações de pedidos funcionam quando o app está instalado na Tela de Início:
              </p>
              <ol className="text-xs text-[#F3F4F6] space-y-2 bg-[#0B0D11] border border-[#232834] rounded-xl p-3.5">
                <li className="flex items-center gap-2">
                  <Share className="w-3.5 h-3.5 text-[#F5B731] shrink-0" />
                  <span>1. Toque no botão Compartilhar na barra do Safari.</span>
                </li>
                <li>
                  2. Role para baixo e toque em{' '}
                  <strong className="text-[#F5B731]">
                    Adicionar à Tela de Início
                  </strong>
                  .
                </li>
                <li>3. Abra o app pelo ícone e ative as notificações em Pedidos.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[42px] rounded-xl bg-[#F5B731] text-[#0B0D11] text-xs font-bold cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
