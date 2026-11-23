import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  appName?: string;
  installLabel?: string;
  tone?: 'light' | 'dark';
  compactOnMobile?: boolean;
  showManualFallback?: boolean;
}

export function PWAInstallButton({
  appName = 'MGW Gestão',
  installLabel = 'Instalar no celular',
  tone = 'light',
  compactOnMobile = false,
  showManualFallback = false,
}: PWAInstallButtonProps) {
  const {
    isInstallable,
    isInstalled,
    isStandalone,
    isIOS,
    isInstalling,
    installStatus,
    install,
    clearStatus,
  } = usePWAInstall();
  const [activeGuide, setActiveGuide] = useState<'ios' | 'browser' | null>(
    null,
  );

  useEffect(() => {
    if (!activeGuide) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveGuide(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGuide]);

  useEffect(() => {
    if (installStatus !== 'dismissed' && installStatus !== 'error') return;
    const timer = window.setTimeout(() => {
      clearStatus();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [installStatus, clearStatus]);

  // If already running as an installed standalone PWA, suppress install UI
  if (isStandalone) {
    return null;
  }

  // Brief confirmation right after completing installation in the browser tab
  if (isInstalled && installStatus === 'installed') {
    return (
      <span
        role="status"
        className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
          tone === 'dark'
            ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#86EFAC]'
            : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]'
        }`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
          {appName} instalado
        </span>
        {compactOnMobile && <span className="sm:hidden">Instalado</span>}
      </span>
    );
  }

  if (isInstalled) {
    return null;
  }

  const buttonClass =
    tone === 'dark'
      ? 'min-h-[40px] px-3.5 rounded-xl border border-[#F5B731]/50 bg-[#F5B731]/15 hover:bg-[#F5B731]/25 text-[#FCD34D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-60'
      : 'min-h-[38px] px-3 sm:px-3.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#8A6200] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-60';

  const manualFallbackButtonClass =
    tone === 'dark'
      ? 'min-h-[40px] px-3 rounded-xl border border-[#232834] bg-[#12151C]/90 hover:border-[#374151] text-[#D1D5DB] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0'
      : 'min-h-[36px] px-3 rounded-xl border border-[#E8EAF0] bg-white hover:border-[#D5D9E4] hover:bg-[#F7F8FC] text-[#4B5563] hover:text-[#172033] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0';

  const labelNode = compactOnMobile ? (
    <span className="hidden sm:inline">{installLabel}</span>
  ) : (
    <span>{installLabel}</span>
  );

  const renderFeedbackNotice = () => {
    if (installStatus !== 'dismissed' && installStatus !== 'error') {
      return null;
    }
    return (
      <span
        role="status"
        className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap ${
          tone === 'dark'
            ? 'bg-[#181C24] border-[#232834] text-[#D1D5DB]'
            : 'bg-[#F7F8FC] border-[#E8EAF0] text-[#4B5563]'
        }`}
      >
        {installStatus === 'dismissed'
          ? 'Instalação adiada — disponível no menu do navegador.'
          : 'Não foi possível iniciar a instalação automática.'}
      </span>
    );
  };

  const renderGuideModal = () => {
    if (!activeGuide || typeof document === 'undefined') return null;
    const isIOSGuide = activeGuide === 'ios';

    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-guide-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setActiveGuide(null);
          }
        }}
        className="fixed inset-0 z-50 bg-[#172033]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <div className="max-w-sm w-full bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.18)] p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3
              id="pwa-guide-modal-title"
              className="text-sm font-bold text-[#172033]"
            >
              {isIOSGuide
                ? `Instalar ${appName} no iPhone / iPad`
                : `Como instalar o ${appName}`}
            </h3>
            <button
              type="button"
              onClick={() => setActiveGuide(null)}
              aria-label="Fechar instruções de instalação"
              className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isIOSGuide ? (
            <>
              <p className="text-xs text-[#4B5563] leading-relaxed">
                No Safari do iOS/iPadOS, a instalação é feita pelo menu do próprio navegador para habilitar a experiência de aplicativo:
              </p>
              <ol className="text-xs text-[#172033] space-y-2.5 bg-[#F7F8FC] border border-[#E8EAF0] rounded-xl p-3.5">
                <li className="flex items-start gap-2">
                  <Share
                    className="w-4 h-4 text-[#B38300] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    1. Toque no botão <strong>Compartilhar</strong> na barra do Safari.
                  </span>
                </li>
                <li>
                  2. Role as opções e toque em{' '}
                  <strong className="text-[#8A6200]">
                    Adicionar à Tela de Início
                  </strong>
                  .
                </li>
                <li>
                  3. Confirme tocando em <strong>Adicionar</strong> e abra o{' '}
                  {appName} pelo ícone criado.
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="text-xs text-[#4B5563] leading-relaxed">
                Seu navegador atual não exibiu o atalho automático de instalação neste momento. Você ainda pode instalar ou fixar o {appName}:
              </p>
              <ol className="text-xs text-[#172033] space-y-2.5 bg-[#F7F8FC] border border-[#E8EAF0] rounded-xl p-3.5">
                <li>
                  <strong>Chrome ou Edge (computador/Android):</strong> clique no ícone de instalação na barra de endereço ou abra o menu <strong>⋮</strong> e toque em <strong>Instalar aplicativo</strong>.
                </li>
                <li>
                  <strong>Outros navegadores (como Firefox no computador):</strong> se o navegador não oferecer suporte à instalação de PWA, adicione esta página aos favoritos ou abra em um navegador compatível (Chrome, Edge ou Safari no iOS).
                </li>
              </ol>
            </>
          )}

          <button
            type="button"
            onClick={() => setActiveGuide(null)}
            className="w-full min-h-[42px] rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-xs font-bold cursor-pointer transition-colors"
          >
            Entendi
          </button>
        </div>
      </div>,
      document.body,
    );
  };

  if (isInstallable) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isInstalling}
          aria-busy={isInstalling}
          aria-label={compactOnMobile ? `${installLabel} (${appName})` : undefined}
          title={compactOnMobile ? installLabel : undefined}
          onClick={() => void install()}
          className={buttonClass}
        >
          {isInstalling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
          ) : (
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{isInstalling ? 'Instalando...' : labelNode}</span>
        </button>
        {renderFeedbackNotice()}
      </div>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          aria-label={compactOnMobile ? `${installLabel} (${appName})` : undefined}
          title={compactOnMobile ? installLabel : undefined}
          onClick={() => setActiveGuide('ios')}
          className={buttonClass}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {labelNode}
        </button>
        {renderGuideModal()}
      </>
    );
  }

  if (showManualFallback || installStatus === 'dismissed' || installStatus === 'error') {
    return (
      <>
        <div className="inline-flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveGuide('browser')}
            className={manualFallbackButtonClass}
          >
            <Info className="w-3.5 h-3.5 text-[#778094] shrink-0" aria-hidden="true" />
            <span>Como instalar</span>
          </button>
          {renderFeedbackNotice()}
        </div>
        {renderGuideModal()}
      </>
    );
  }

  return null;
}
