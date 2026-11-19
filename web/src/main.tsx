import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import { registerWorker } from './update';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StoreProvider><App /></StoreProvider>);

// La app instalada registra su service worker para notificaciones y uso sin conexión.
addEventListener('load', registerWorker);
