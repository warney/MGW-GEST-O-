import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Loader2, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  tone?: 'light' | 'dark';
  compactOnMobile?: boolean;
  showManualFallback?: boolean;
}

export function PWAInstallButton({
  tone = 'light',
  compactOnMobile = true,
  showManualFallback = true,
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
  const [activeGuide, setActiveGuide] = useState<'ios' | 'browser' | null>(null);

  useEffect(() => {
    if (!activeGuide) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveGuide(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeGuide]);

  useEffect(() => {
    if (installStatus !== 'dismissed' && installStatus !== 'error') return;
    const timer = window.setTimeout(() => {
      clearStatus();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [installStatus, clearStatus]);

  if (isStandalone) {
    return null;
  }

  if (isInstalled && installStatus === 'installed') {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
          tone === 'dark'
            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
        }`}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className={compactOnMobile ? 'hidden sm:inline' : ''}>App instalado</span>
      </span>
    );
  }

  if (isInstalled) {
    return null;
  }

  const primaryClass =
    tone === 'dark'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-[#F5B731]/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-[#F5B731]/25 cursor-pointer whitespace-nowrap shrink-0 transition-colors disabled:opacity-60'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer whitespace-nowrap shrink-0 transition-colors disabled:opacity-60';

  const fallbackClass =
    tone === 'dark'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer whitespace-nowrap shrink-0 transition-colors'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0 transition-colors';

  const renderGuideModal = () => {
    if (!activeGuide || typeof document === 'undefined') return null;
    const isIOSGuide = activeGuide === 'ios';

    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-pwa-guide-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setActiveGuide(null);
          }
        }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 p-0 sm:p-4"
      >
        <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="admin-pwa-guide-title" className="text-sm font-bold text-slate-900">
                {isIOSGuide
                  ? 'Instalar MGW Admin no iPhone / iPad'
                  : 'Instalar MGW Admin como App'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Acesso direto em janela dedicada no celular ou computador.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveGuide(null)}
              aria-label="Fechar instruções de instalação"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isIOSGuide ? (
            <ol className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-800">
              <li className="flex items-start gap-2">
                <Share className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  1. Toque em <strong>Compartilhar</strong> na barra inferior ou superior do Safari.
                </span>
              </li>
              <li>
                2. Role a lista e escolha <strong className="text-amber-800">Adicionar à Tela de Início</strong>.
              </li>
              <li>
                3. Toque em <strong>Adicionar</strong> para fixar o ícone do <strong>MGW Admin</strong>.
              </li>
            </ol>
          ) : (
            <ol className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-800">
              <li>
                <strong>Google Chrome / Microsoft Edge:</strong> clique no ícone de instalação na barra de endereços ou abra o menu <strong>⋮</strong> e selecione <strong>Instalar aplicativo MGW Admin</strong>.
              </li>
              <li>
                <strong>Android (Chrome):</strong> abra o menu <strong>⋮</strong> do navegador e toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
              </li>
            </ol>
          )}

          <button
            type="button"
            onClick={() => setActiveGuide(null)}
            className="w-full rounded-lg bg-[#F5B731] py-2 text-xs font-semibold text-slate-900 hover:bg-amber-400 cursor-pointer"
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
      <button
        type="button"
        disabled={isInstalling}
        onClick={() => void install()}
        title="Instalar MGW Admin como aplicativo"
        className={primaryClass}
      >
        {isInstalling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
          {isInstalling ? 'Instalando...' : 'Instalar App'}
        </span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setActiveGuide('ios')}
          title="Instalar MGW Admin no iPhone / iPad"
          className={primaryClass}
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Instalar App</span>
        </button>
        {renderGuideModal()}
      </>
    );
  }

  if (showManualFallback || installStatus === 'dismissed' || installStatus === 'error') {
    return (
      <>
        <button
          type="button"
          onClick={() => setActiveGuide('browser')}
          title="Como instalar o MGW Admin"
          className={fallbackClass}
        >
          <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Instalar App</span>
        </button>
        {renderGuideModal()}
      </>
    );
  }

  return null;
}
