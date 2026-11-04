export function randomId(bytes = 16): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export const isEmail = (s: unknown): s is string => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length < 200;

// —————————— Contraseñas ——————————
// PBKDF2-SHA256 con sal aleatoria. 100.000 iteraciones es el máximo que permite Cloudflare Workers.

const ITER = 100_000;
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${hex(salt)}$${hex(await derive(password, salt, ITER))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, want] = stored.split('$');
  if (alg !== 'pbkdf2' || !iter || !salt || !want) return false;
  const got = hex(await derive(password, unhex(salt), Number(iter)));
  // Comparación de tiempo constante.
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

/** Devuelve un mensaje si la contraseña es demasiado débil. */
export function weakPassword(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (p.length > 200) return 'La contraseña es demasiado larga.';
  if (/^(.)\1+$/.test(p) || /^(12345678|123456789|1234567890|password|contraseña|qwertyui)$/i.test(p)) return 'Esa contraseña es muy fácil de adivinar. Prueba con una frase.';
  return null;
}
