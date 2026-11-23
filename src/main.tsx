import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import './design-system/tokens.css';
import './design-system/components.css';
import './design-system/app-shell.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({ immediate: true });
  } catch {
    // Fallback silencioso se o navegador bloquear Service Worker
  }
}

createRoot(document.getElementById('root')!).render(<App />);
