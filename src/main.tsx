import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import './design-system/tokens.css';
import './design-system/components.css';
import './design-system/app-shell.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        // Mantém a versão atual ativa durante o uso; a atualização será aplicada
        // quando o usuário recarregar ou reabrir o aplicativo.
      },
    });
  } catch {
    // Fallback silencioso se o navegador bloquear Service Worker
  }
}

createRoot(document.getElementById('root')!).render(<App />);
