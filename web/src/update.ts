// Actualizar la app: buscar una versión nueva y, si la app se ve rara, borrar la copia guardada y recargar.
export const UPDATE_EVENT = 'vigia:update-ready';

declare const __DEMO__: boolean;
const canUseWorker = () => !__DEMO__ && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** iPhone o iPad usando Safari (no la app instalada): ahí hay que agregar Vigía a la pantalla de inicio. */
export function needsIosInstall(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

/** Pide al navegador que revise si hay un service worker nuevo (no hace nada sin conexión). */
export function checkForUpdate(): void {
  if (!canUseWorker()) return;
  navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => undefined);
}

// Android (Chrome, Edge, Samsung Internet): el navegador ofrece instalar la app; guardamos la oferta para mostrarla en Ajustes.
export const INSTALL_EVENT = 'vigia:install-available';
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let pending: InstallPrompt | null = null;
if (typeof addEventListener === 'function') {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pending = e as InstallPrompt; dispatchEvent(new Event(INSTALL_EVENT)); });
  addEventListener('appinstalled', () => { pending = null; dispatchEvent(new Event(INSTALL_EVENT)); });
}
export const canInstall = () => pending !== null;
export async function installApp(): Promise<boolean> {
  if (!pending) return false;
  const p = pending;
  pending = null;
  await p.prompt();
  const { outcome } = await p.userChoice;
  dispatchEvent(new Event(INSTALL_EVENT));
  return outcome === 'accepted';
}

/** Registra el service worker y avisa a la app cuando termina de instalarse una versión nueva. */
export function registerWorker(): void {
  if (!canUseWorker()) return;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        // Con "controller" ya había una versión anterior funcionando: esta es una actualización, no la primera instalación.
        if (w.state === 'installed' && navigator.serviceWorker.controller) dispatchEvent(new Event(UPDATE_EVENT));
      });
    });
  }).catch(() => undefined);
}

/** Borra la copia sin conexión y el service worker, y vuelve a cargar la app desde el servidor.
 *  No cierra la sesión ni toca los datos guardados en el servidor. */
export async function hardRefresh(): Promise<void> {
  try {
    if (canUseWorker()) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in self) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* si el navegador no deja borrar, igual recargamos */ }
  location.reload();
}
