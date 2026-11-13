import { describe, expect, it } from 'vitest';
import worker from '../worker/src/index';
import { bearerOk, fileResponse, pushEndpointOk, publicError, safeEqual, withSecurityHeaders } from '../worker/src/security';
import { cleanObligation, cleanProject, safeUrl } from '../shared/validate';

describe('cabeceras de seguridad', () => {
  it('el Worker las pone también a las páginas de la app (archivos estáticos)', async () => {
    const env = { APP_URL: 'https://vigia.example', ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) } } as never;
    const res = await worker.fetch(new Request('https://vigia.example/proyectos'), env, {} as never);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age/);
  });
  it('rechaza escrituras que dicen venir de otro sitio', async () => {
    const env = { APP_URL: 'https://vigia.example' } as never;
    const res = await worker.fetch(new Request('https://vigia.example/api/org', { method: 'PUT', headers: { origin: 'https://malo.example' }, body: '{}' }), env, {} as never);
    expect(res.status).toBe(403);
    const same = await worker.fetch(new Request('https://vigia.example/api/org', { method: 'PUT', headers: { origin: 'https://vigia.example' }, body: '{}' }), { ...env, DB: {} } as never, {} as never).catch(() => null);
    expect(same?.status).not.toBe(403);
  });
  it('conserva la política propia de los archivos', () => {
    const r = withSecurityHeaders(new Response('x', { headers: { 'content-security-policy': "default-src 'none'" } }));
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'");
  });
});

describe('archivos subidos', () => {
  it('solo muestra en línea imágenes y PDF; lo demás se descarga', () => {
    expect(fileResponse('x', 'a.pdf', 'application/pdf').headers.get('content-disposition')).toMatch(/^inline/);
    for (const mime of ['text/html', 'image/svg+xml', 'application/javascript', 'application/xhtml+xml']) {
      const r = fileResponse('x', 'a.bin', mime);
      expect(r.headers.get('content-type')).toBe('application/octet-stream');
      expect(r.headers.get('content-disposition')).toMatch(/^attachment/);
    }
  });
  it('el nombre no puede inyectar cabeceras ni comillas', () => {
    const r = fileResponse('x', 'a"\r\nSet-Cookie: x=1.pdf', 'application/pdf');
    expect(r.headers.get('content-disposition')).not.toMatch(/[\r\n]/);
    expect(r.headers.get('content-disposition')!.split(';')[1]).not.toContain('"\r');
  });
});

describe('utilidades', () => {
  it('compara tokens sin atajos y exige un largo mínimo', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(bearerOk('Bearer 0123456789abcdef', '0123456789abcdef')).toBe(true);
    expect(bearerOk('Bearer corto', 'corto')).toBe(false);
    expect(bearerOk(undefined, 'x'.repeat(20))).toBe(false);
  });
  it('las notificaciones solo van a servicios de push de navegadores', () => {
    expect(pushEndpointOk('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(pushEndpointOk('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(pushEndpointOk('https://web.push.apple.com/abc')).toBe(true);
    expect(pushEndpointOk('https://169.254.169.254/latest')).toBe(false);
    expect(pushEndpointOk('http://fcm.googleapis.com/x')).toBe(false);
    expect(pushEndpointOk('https://fcm.googleapis.com.malo.example/x')).toBe(false);
  });
  it('no filtra errores internos de la base de datos', () => {
    expect(publicError(new Error('D1_ERROR: no such table: users')).message).not.toMatch(/D1|table/);
    expect(publicError(new SyntaxError('Unexpected token')).status).toBe(400);
    expect(publicError(new Error('La RCA pesa más de 25 MB.')).message).toBe('La RCA pesa más de 25 MB.');
  });
});

describe('validación de datos de entrada', () => {
  const ob = { id: 'a:1', projectId: 'a', title: 'Monitoreo', frequency: { kind: 'monthly', dueDay: 10 }, recipient: 'SMA', component: 'Agua', evidence: 'x', confirmed: true, source: 'rca' };
  it('acepta un compromiso válido y descarta campos extra', () => {
    const c = cleanObligation({ ...ob, hack: 'x', __proto__: { a: 1 } })!;
    expect(c.title).toBe('Monitoreo');
    expect(c.frequency).toEqual({ kind: 'monthly', dueDay: 10 });
    expect('hack' in c).toBe(false);
  });
  it('rechaza lo que no tiene la forma del modelo', () => {
    expect(cleanObligation({ ...ob, frequency: { kind: 'cada rato' } })).toBeNull();
    expect(cleanObligation({ ...ob, title: '' })).toBeNull();
    expect(cleanObligation(null)).toBeNull();
    expect(cleanObligation('x')).toBeNull();
  });
  it('acota textos largos y fechas inválidas, y corrige valores desconocidos', () => {
    const c = cleanObligation({ ...ob, title: 'x'.repeat(5000), recipient: 'Hacker', component: 'Magia', frequency: { kind: 'once', date: '2026-13-45' } })!;
    expect(c.title.length).toBe(200);
    expect(c.recipient).toBe('Interno');
    expect(c.component).toBe('Administrativo');
    expect(c.frequency.date).toBeUndefined();
  });
  it('solo permite enlaces https en el proyecto', () => {
    expect(safeUrl('https://firma.sea.gob.cl/x.pdf')).toMatch(/^https:/);
    for (const u of ['javascript:alert(1)', 'data:text/html,<script>', 'http://x.cl', 'ftp://x', '', 5, 'no es url']) expect(safeUrl(u)).toBe('');
    const p = cleanProject({ id: 'p', name: 'N', trackingStart: '2026-11-01', sourceUrl: 'javascript:alert(1)' })!;
    expect(p.sourceUrl).toBe('');
    expect(cleanProject({ id: 'p', name: 'N', trackingStart: '2026-11-01', sourceUrl: 'archivo:rca.pdf' })!.sourceUrl).toBe('archivo:rca.pdf');
    expect(cleanProject({ id: 'p', name: 'N' })).toBeNull();
  });
});
