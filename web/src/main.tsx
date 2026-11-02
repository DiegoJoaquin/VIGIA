import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StoreProvider><App /></StoreProvider>);

// La app instalada registra su service worker para notificaciones y uso sin conexión.
declare const __DEMO__: boolean;
if (!__DEMO__ && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
