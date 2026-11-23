import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PWAInstallStatus =
  | 'idle'
  | 'installing'
  | 'installed'
  | 'dismissed'
  | 'error';

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneQuery = window.matchMedia?.(
    '(display-mode: standalone)',
  )?.matches;
  const navigatorStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
    true;
  return Boolean(standaloneQuery || navigatorStandalone);
}

function checkIsIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    checkIsStandalone(),
  );
  const [isIOS, setIsIOS] = useState<boolean>(() => checkIsIOSDevice());
  const [installStatus, setInstallStatus] = useState<PWAInstallStatus>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsInstalled(checkIsStandalone());
    setIsIOS(checkIsIOSDevice());

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      if (checkIsStandalone()) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallStatus('idle');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallStatus('installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt || installStatus === 'installing') return false;
    setInstallStatus('installing');
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      // Chromium consumes the prompt instance once shown
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setInstallStatus('installed');
        return true;
      }
      setInstallStatus('dismissed');
      return false;
    } catch {
      setDeferredPrompt(null);
      setInstallStatus('error');
      return false;
    }
  }, [deferredPrompt, installStatus]);

  const clearStatus = useCallback(() => {
    setInstallStatus('idle');
  }, []);

  const isStandalone = checkIsStandalone();

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isStandalone,
    isIOS,
    isInstalling: installStatus === 'installing',
    installStatus,
    install,
    clearStatus,
  };
}
