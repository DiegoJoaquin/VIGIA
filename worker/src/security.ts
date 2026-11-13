// Defensas comunes del Worker: límites de uso, cabeceras, archivos subidos y comparaciones seguras.
import type { Context } from 'hono';
import type { Env } from './env';

/** Cuenta un intento en la ventana y dice si todavía está dentro del máximo. Usa la tabla auth_throttle. */
export async function allow(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const r = await env.DB.prepare(
    `INSERT INTO auth_throttle (key, fails, locked_until) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       fails = CASE WHEN auth_throttle.locked_until < ?3 THEN 1 ELSE auth_throttle.fails + 1 END,
       locked_until = CASE WHEN auth_throttle.locked_until < ?3 THEN ?2 ELSE auth_throttle.locked_until END
     RETURNING fails`,
  ).bind(`rl:${key}`, now + windowMs, now).first<{ fails: number }>();
  return (r?.fails ?? 1) <= max;
}

export const clientIp = (c: Context<any>) => c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

/** Comparación en tiempo constante (tokens de operador). */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export const bearerOk = (header: string | undefined, token: string | undefined) => !!token && token.length >= 16 && safeEqual(header ?? '', `Bearer ${token}`);

/** Tipos que el navegador puede mostrar sin riesgo. Todo lo demás se descarga, nunca se ejecuta en nuestro sitio. */
const INLINE = /^(image\/(png|jpeg|webp|gif|heic|heif)|application\/pdf)$/;
const asciiName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'archivo';

export function fileResponse(bytes: BodyInit, name: string, mime: string): Response {
  const inline = INLINE.test(mime);
  return new Response(bytes, {
    headers: {
      'content-type': inline ? mime : 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      'cache-control': 'private, max-age=3600',
    },
  });
}

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

/** Cabeceras de seguridad para todo lo que sale del Worker. Los archivos de usuarios traen su propia política. */
export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  const h = out.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  h.set('cross-origin-opener-policy', 'same-origin');
  if (!h.has('content-security-policy')) {
    h.set('content-security-policy', CSP);
    h.set('x-frame-options', 'DENY');
  }
  return out;
}

/** Rechaza escrituras que vengan de otro sitio (defensa extra además de la cookie SameSite=Lax). */
export function crossSiteWrite(c: Context<any>): boolean {
  const env = c.env as Env;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return false;
  const site = c.req.header('sec-fetch-site');
  if (site === 'cross-site') return true;
  const origin = c.req.header('origin');
  if (!origin) return false;
  try { return new URL(origin).host !== new URL(env.APP_URL).host && new URL(origin).host !== new URL(c.req.url).host; } catch { return true; }
}

const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
/** El servidor solo envía avisos a los servicios de push de los navegadores, no a cualquier dirección. */
export const pushEndpointOk = (endpoint: unknown) => { try { const u = new URL(String(endpoint)); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname); } catch { return false; } };

/** Mensaje que se puede mostrar a la persona sin filtrar detalles internos de la base de datos. */
export function publicError(err: unknown): { status: 400 | 500; message: string } {
  if (err instanceof SyntaxError) return { status: 400, message: 'La solicitud no tiene el formato esperado.' };
  const m = err instanceof Error ? err.message : '';
  if (!m || /D1_|SQLITE|sqlite|no such (table|column)|constraint|binding|Durable|internal/i.test(m)) return { status: 500, message: 'Algo falló de nuestro lado. Intenta de nuevo en unos minutos.' };
  return { status: 500, message: m.slice(0, 300) };
}
