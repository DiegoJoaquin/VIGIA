import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { todayInChile } from '../../shared/recurrence';
import type { Obligation, Project } from '../../shared/types';
import { ventanillaObligations, type VentanillaAnswers } from '../../shared/ventanilla';
import type { Env, SessionUser } from './env';
import { extractFromPdf, fetchRca } from './extract';
import type { FeedbackItem } from '../../shared/learning';
import { buildIcs } from './ics';
import { digestMail, inviteMail, passwordMail, sendMail, welcomeMail } from './mail';
import { DEFAULT_NOTIFY, planNotifications, pushToUser, runDailyAlerts, type NotifySettings } from './notify';
import { loadOrg, obligationOrg, putObligation, putProject } from './repo';
import { hashPassword, isEmail, randomId, sha256, verifyPassword, weakPassword } from './util';
import { allow, bearerOk, clientIp, crossSiteWrite, fileResponse, publicError, pushEndpointOk, withSecurityHeaders } from './security';
import { cleanObligation, cleanProject } from '../../shared/validate';

type App = { Bindings: Env; Variables: { user: SessionUser } };
const app = new Hono<App>();
const SESSION_COOKIE = 'vigia_session';
const MAX_EVIDENCE = 1_500_000;

app.onError((err, c) => {
  console.error(err);
  const e = publicError(err);
  return c.json({ error: e.message }, e.status);
});

// Cabeceras de seguridad en todo, y las escrituras solo aceptan pedidos que vienen de la propia app.
app.use('*', async (c, next) => {
  if (crossSiteWrite(c)) return withSecurityHeaders(c.json({ error: 'Pedido de otro sitio rechazado.' }, 403));
  await next();
  c.res = withSecurityHeaders(c.res);
});

const TOO_MANY = (c: Context<App>, msg = 'Demasiados intentos seguidos. Espera un rato y vuelve a probar.') => c.json({ error: msg }, 429);
// Cada lectura con IA gasta la cuota gratuita de todos: se limita por empresa.
const AI_PER_HOUR = 30;
const STORAGE_QUOTA = 100_000_000; // por empresa: la base gratuita de Cloudflare tiene 500 MB en total
async function usedStorage(env: Env, orgId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT (SELECT COALESCE(SUM(size),0) FROM evidence WHERE org_id = ?1) + (SELECT COALESCE(SUM(size),0) FROM documents WHERE org_id = ?1) AS n').bind(orgId).first<{ n: number }>();
  return r?.n ?? 0;
}

// —————————— Sesión por enlace mágico (sin contraseñas) ——————————

async function issueToken(env: Env, email: string, ttlMs: number, signup?: { name: string; company: string }) {
  const token = randomId(24);
  await env.DB.prepare('INSERT INTO login_tokens (token_hash, email, expires_at, signup) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), email, Date.now() + ttlMs, signup ? JSON.stringify(signup) : null).run();
  return token;
}
/** Enlace para crear o cambiar la contraseña (recuperación e invitaciones). */
const passwordLink = (env: Env, token: string) => `${env.APP_URL}/?clave=${token}`;

async function startSession(c: Context<App>, userId: string) {
  const sid = randomId(32);
  await c.env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(sid), userId, Date.now() + 60 * 86_400_000).run();
  setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, secure: c.env.APP_URL.startsWith('https'), sameSite: 'Lax', path: '/', maxAge: 60 * 86_400 });
}

const cleanEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

// Crear cuenta: la empresa nace con esta persona como administradora y queda adentro de inmediato.
app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json<{ email?: string; password?: string; name?: string; company?: string }>().catch(() => ({} as Record<string, undefined>));
  if (!(await allow(c.env, `signup:${clientIp(c)}`, 6, 3_600_000))) return TOO_MANY(c, 'Se crearon varias cuentas desde esta conexión. Espera una hora e inténtalo otra vez.');
  const company = (b.company ?? '').trim().slice(0, 120), name = (b.name ?? '').trim().slice(0, 80), email = cleanEmail(b.email);
  if (company.length < 2) return c.json({ error: 'Escribe el nombre de la empresa.', field: 'company' }, 400);
  if (name.length < 2) return c.json({ error: 'Escribe tu nombre.', field: 'name' }, 400);
  if (!isEmail(email)) return c.json({ error: 'Escribe un correo válido.', field: 'email' }, 400);
  const weak = weakPassword(b.password);
  if (weak) return c.json({ error: weak, field: 'password' }, 400);
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
    return c.json({ error: 'Ya existe una cuenta con ese correo. Entra con tu contraseña o recupérala.', field: 'email', exists: true }, 409);
  }
  const orgId = `o-${randomId(10)}`, userId = `u-${randomId(10)}`;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO orgs (id, name) VALUES (?, ?)').bind(orgId, company),
    c.env.DB.prepare(`INSERT INTO users (id, org_id, email, name, role) VALUES (?, ?, ?, ?, 'owner')`).bind(userId, orgId, email, name),
    c.env.DB.prepare('INSERT INTO credentials (user_id, hash) VALUES (?, ?)').bind(userId, await hashPassword(b.password!)),
    c.env.DB.prepare('INSERT INTO settings (user_id, notify, calendar_token) VALUES (?, ?, ?)').bind(userId, JSON.stringify(DEFAULT_NOTIFY), randomId(16)),
  ]);
  await startSession(c, userId);
  c.executionCtx.waitUntil(sendMail(c.env, welcomeMail(c.env, email, name, company)).then(() => undefined));
  return c.json({ ok: true });
});

// Desde aquí Vigía entra con contraseña (UTC). Las cuentas anteriores la crean en su primer ingreso.
const PASSWORDS_SINCE = '2026-11-04 13:30:00';

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as Record<string, undefined>));
  const email = cleanEmail(b.email);
  if (!isEmail(email)) return c.json({ error: 'Escribe un correo válido.', field: 'email' }, 400);
  if (!b.password) return c.json({ error: 'Escribe tu contraseña.', field: 'password' }, 400);
  if (!(await allow(c.env, `login-ip:${clientIp(c)}`, 40, 900_000))) return TOO_MANY(c);
  const key = `login:${email}`;
  const t = await c.env.DB.prepare('SELECT fails, locked_until FROM auth_throttle WHERE key = ?').bind(key).first<{ fails: number; locked_until: number }>();
  if (t && t.locked_until > Date.now()) {
    const min = Math.ceil((t.locked_until - Date.now()) / 60_000);
    return c.json({ error: `Demasiados intentos. Espera ${min} minuto${min === 1 ? '' : 's'} o recupera tu contraseña.` }, 429);
  }
  const u = await c.env.DB.prepare('SELECT u.id, u.created_at, k.hash FROM users u LEFT JOIN credentials k ON k.user_id = u.id WHERE u.email = ?')
    .bind(email).first<{ id: string; created_at: string; hash: string | null }>();
  if (u && !u.hash) {
    // Cuentas creadas cuando Vigía entraba solo con enlaces por correo (antes del 4 nov 2026): la contraseña
    // que escriben ahora queda como su contraseña y entran directo, sin depender de un correo.
    if (u.created_at < PASSWORDS_SINCE) {
      const weak = weakPassword(b.password);
      if (weak) return c.json({ error: `Es tu primera vez con contraseña: elige una nueva. ${weak}`, field: 'password', firstPassword: true }, 400);
      await c.env.DB.prepare('INSERT INTO credentials (user_id, hash) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING').bind(u.id, await hashPassword(b.password)).run();
      await startSession(c, u.id);
      return c.json({ ok: true, firstPassword: true });
    }
    // Invitada que aún no activa su acceso: entra con el enlace que le compartió quien la invitó.
    return c.json({ error: 'Tu acceso aún no está activo. Abre el enlace de invitación que te compartieron (pídeselo a quien te invitó) o usa «¿Olvidaste tu contraseña?».', invited: true }, 409);
  }
  // Con cuenta o sin ella se hace el mismo trabajo, para que el tiempo de respuesta no delate qué correos existen.
  if (!u) await verifyPassword(b.password, 'pbkdf2$100000$00000000000000000000000000000000$' + '0'.repeat(64));
  if (!u || !(await verifyPassword(b.password, u.hash!))) {
    const fails = (t?.fails ?? 0) + 1;
    await c.env.DB.prepare('INSERT INTO auth_throttle (key, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until')
      .bind(key, fails >= 5 ? 0 : fails, fails >= 5 ? Date.now() + 15 * 60_000 : 0).run();
    return c.json({ error: 'El correo o la contraseña no coinciden.' }, 401);
  }
  if (t) await c.env.DB.prepare('DELETE FROM auth_throttle WHERE key = ?').bind(key).run();
  await startSession(c, u.id);
  return c.json({ ok: true });
});

// Recuperar contraseña: siempre responde lo mismo, exista o no la cuenta.
app.post('/api/auth/forgot', async (c) => {
  const b = await c.req.json<{ email?: string }>().catch(() => ({} as Record<string, undefined>));
  const email = cleanEmail(b.email);
  if (!isEmail(email)) return c.json({ error: 'Escribe un correo válido.', field: 'email' }, 400);
  // Pocas solicitudes por correo y por conexión: protege la bandeja de la persona y la cuota de envío. La respuesta es siempre la misma.
  if (!(await allow(c.env, `forgot:${email}`, 3, 3_600_000)) || !(await allow(c.env, `forgot-ip:${clientIp(c)}`, 10, 3_600_000))) return c.json({ ok: true });
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
    const r = await sendMail(c.env, passwordMail(c.env, email, passwordLink(c.env, await issueToken(c.env, email, 60 * 60_000)), true));
    if (!r.ok) return c.json({ error: `No pudimos enviar el correo: ${r.detail}` }, 502);
  }
  return c.json({ ok: true });
});

// Crear o cambiar la contraseña con el enlace del correo, y entrar.
app.post('/api/auth/reset', async (c) => {
  const b = await c.req.json<{ token?: string; password?: string }>().catch(() => ({} as Record<string, undefined>));
  if (!(await allow(c.env, `reset-ip:${clientIp(c)}`, 20, 3_600_000))) return TOO_MANY(c);
  const weak = weakPassword(b.password);
  if (weak) return c.json({ error: weak, field: 'password' }, 400);
  const hash = await sha256(b.token ?? '');
  const row = await c.env.DB.prepare('SELECT email, expires_at FROM login_tokens WHERE token_hash = ?').bind(hash).first<{ email: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return c.json({ error: 'Este enlace ya se usó o venció. Pide uno nuevo con "¿Olvidaste tu contraseña?".', expired: true }, 400);
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(row.email).first<{ id: string }>();
  if (!u) return c.json({ error: 'Esa cuenta ya no existe.', expired: true }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM login_tokens WHERE token_hash = ? OR expires_at < ?').bind(hash, Date.now()),
    c.env.DB.prepare(`INSERT INTO credentials (user_id, hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET hash = excluded.hash, updated_at = datetime('now')`).bind(u.id, await hashPassword(b.password!)),
    // Cambiar la contraseña cierra las demás sesiones abiertas.
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM auth_throttle WHERE key = ?').bind(`login:${row.email}`),
  ]);
  await startSession(c, u.id);
  return c.json({ ok: true, email: row.email });
});

// Enlaces de correos antiguos (antes de las contraseñas): llevan a crear la contraseña.
app.get('/api/auth/verify', (c) => c.redirect(`/?clave=${encodeURIComponent(c.req.query('token') ?? '')}`));

app.post('/api/auth/logout', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(sid)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// —————————— Todo lo de /api pide sesión, salvo lo anterior ——————————

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/') || c.req.path.startsWith('/api/extractor/')) return next();
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return c.json({ error: 'Necesitas iniciar sesión.' }, 401);
  const u = await c.env.DB.prepare(
    `SELECT u.id, u.org_id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(sid), Date.now()).first<{ id: string; org_id: string; email: string; name: string; role: string }>();
  if (!u) return c.json({ error: 'Tu sesión venció. Vuelve a entrar.' }, 401);
  c.set('user', { id: u.id, orgId: u.org_id, email: u.email, name: u.name, role: u.role });
  return next();
});

async function canTouch(c: { env: Env; get: (k: 'user') => SessionUser }, obligationId: string) {
  return (await obligationOrg(c.env, obligationId)) === c.get('user').orgId;
}

app.get('/api/snapshot', async (c) => {
  const user = c.get('user');
  const [data, s, org] = await Promise.all([
    loadOrg(c.env, user.orgId),
    c.env.DB.prepare('SELECT notify, calendar_token FROM settings WHERE user_id = ?').bind(user.id).first<{ notify: string; calendar_token: string }>(),
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(user.orgId).first<{ name: string }>(),
  ]);
  return c.json({
    user: { name: user.name, email: user.email, org: org?.name ?? '', role: user.role },
    ...data,
    notify: { ...DEFAULT_NOTIFY, ...(s ? JSON.parse(s.notify) : {}) },
    calendarUrl: `${c.env.APP_URL}/cal/${s?.calendar_token ?? ''}.ics`,
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null,
  });
});

app.post('/api/completions', async (c) => {
  const b = await c.req.json<{ obligationId: string; due: string; note?: string }>();
  b.note = typeof b.note === 'string' ? b.note.slice(0, 1000) : undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.due ?? '') || !(await canTouch(c, b.obligationId))) return c.json({ error: 'Compromiso no encontrado.' }, 404);
  const user = c.get('user');
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO completions (org_id, obligation_id, due, completed_at, by_user, note) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(obligation_id, due) DO UPDATE SET note = COALESCE(excluded.note, completions.note)`,
  ).bind(user.orgId, b.obligationId, b.due, now, user.name || user.email, b.note ?? null).run();
  const data = await loadOrg(c.env, user.orgId);
  return c.json(data.completions.find((x) => x.obligationId === b.obligationId && x.due === b.due));
});

app.delete('/api/completions', async (c) => {
  const id = c.req.query('obligationId') ?? '', due = c.req.query('due') ?? '';
  if (!(await canTouch(c, id))) return c.json({ error: 'Compromiso no encontrado.' }, 404);
  await c.env.DB.prepare('DELETE FROM completions WHERE obligation_id = ? AND due = ?').bind(id, due).run();
  return c.json({ ok: true });
});

app.post('/api/evidence', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | string | null;
  const obligationId = String(form.get('obligationId') ?? ''), due = String(form.get('due') ?? '');
  if (!file || typeof file === 'string') return c.json({ error: 'Falta el archivo.' }, 400);
  if (file.size > MAX_EVIDENCE) return c.json({ error: 'El archivo pesa más de 1,5 MB. Las fotos se comprimen solas; para PDF grandes, súbelos reducidos.' }, 413);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return c.json({ error: 'Fecha inválida.' }, 400);
  if (!(await canTouch(c, obligationId))) return c.json({ error: 'Compromiso no encontrado.' }, 404);
  if ((await usedStorage(c.env, c.get('user').orgId)) + file.size > STORAGE_QUOTA) return c.json({ error: 'Tu empresa llegó al límite de almacenamiento (100 MB). Borra documentos o evidencias que ya no necesites.' }, 413);
  const id = randomId(12);
  await c.env.DB.prepare('INSERT INTO evidence (id, org_id, obligation_id, due, name, mime, size, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.get('user').orgId, obligationId, due, file.name.slice(0, 160), file.type || 'application/octet-stream', file.size, new Uint8Array(await file.arrayBuffer())).run();
  const mime = file.type;
  return c.json({ id, name: file.name, size: file.size, kind: mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'other', url: `/api/evidence/${id}` });
});

app.get('/api/evidence/:id', async (c) => {
  const r = await c.env.DB.prepare('SELECT name, mime, bytes FROM evidence WHERE id = ? AND org_id = ?')
    .bind(c.req.param('id'), c.get('user').orgId).first<{ name: string; mime: string; bytes: ArrayBuffer }>();
  if (!r) return c.json({ error: 'Archivo no encontrado.' }, 404);
  return fileResponse(new Uint8Array(r.bytes as ArrayBuffer), r.name, r.mime);
});

app.post('/api/events', async (c) => {
  const b = await c.req.json<{ obligationId: string; note?: string }>();
  b.note = typeof b.note === 'string' ? b.note.slice(0, 1000) : undefined;
  if (!(await canTouch(c, b.obligationId))) return c.json({ error: 'Compromiso no encontrado.' }, 404);
  const ev = { id: randomId(10), obligationId: b.obligationId, occurredAt: new Date().toISOString(), note: b.note };
  await c.env.DB.prepare('INSERT INTO events (id, org_id, obligation_id, occurred_at, note) VALUES (?, ?, ?, ?, ?)')
    .bind(ev.id, c.get('user').orgId, ev.obligationId, ev.occurredAt, ev.note ?? null).run();
  // Un evento es urgente: se avisa de inmediato al celular.
  await pushToUser(c.env, c.get('user').id, 'Evento registrado', 'Revisa el plazo en Vigía');
  return c.json(ev);
});

app.post('/api/obligations/confirm', async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  if (!Array.isArray(ids) || ids.length > 2000) return c.json({ error: 'Lista inválida.' }, 400);
  const orgId = c.get('user').orgId;
  const data = await loadOrg(c.env, orgId);
  const targets = data.obligations.filter((o) => ids.includes(o.id));
  if (targets.length) await c.env.DB.batch(targets.map((o) => putObligation(c.env, orgId, { ...o, confirmed: true })));
  return c.json({ ok: true, count: targets.length });
});

app.put('/api/obligations/:id', async (c) => {
  const o = cleanObligation(await c.req.json());
  if (!o || o.id !== c.req.param('id') || !(await canTouch(c, o.id))) return c.json({ error: 'Compromiso no encontrado o con datos inválidos.' }, 404);
  if (!(await ownsProject(c.env, c.get('user').orgId, o.projectId))) return c.json({ error: 'Proyecto no encontrado.' }, 404);
  await putObligation(c.env, c.get('user').orgId, o).run();
  return c.json({ ok: true });
});

app.put('/api/projects/:id/ventanilla', async (c) => {
  const id = c.req.param('id');
  const orgId = c.get('user').orgId;
  const owns = await c.env.DB.prepare('SELECT 1 FROM projects WHERE id = ? AND org_id = ?').bind(id, orgId).first();
  if (!owns) return c.json({ error: 'Proyecto no encontrado.' }, 404);
  const next = ventanillaObligations(id, await c.req.json<VentanillaAnswers>());
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM obligations WHERE project_id = ? AND org_id = ? AND id LIKE ?`).bind(id, orgId, `${id}-vu-%`),
    ...next.map((o) => putObligation(c.env, orgId, o)),
  ]);
  return c.json(next);
});

app.post('/api/import/extract', async (c) => {
  const { url } = await c.req.json<{ url: string }>();
  if (!(await allow(c.env, `ai:${c.get('user').orgId}`, AI_PER_HOUR, 3_600_000))) return TOO_MANY(c, 'Leíste muchos documentos en poco tiempo. Espera un rato para seguir.');
  const draft = await extractFromPdf(c.env, await fetchRca(url), url);
  return c.json(draft);
});

app.post('/api/import/extract-file', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | string | null;
  if (!file || typeof file === 'string') return c.json({ error: 'Falta el PDF.' }, 400);
  if (file.size > 25_000_000) return c.json({ error: 'La RCA pesa más de 25 MB. Usa el extractor local.' }, 413);
  if (!(await allow(c.env, `ai:${c.get('user').orgId}`, AI_PER_HOUR, 3_600_000))) return TOO_MANY(c, 'Leíste muchos documentos en poco tiempo. Espera un rato para seguir.');
  return c.json(await extractFromPdf(c.env, await file.arrayBuffer(), `archivo:${file.name}`));
});

app.post('/api/import/save', async (c) => {
  const { draft, keep, documentId, feedback } = await c.req.json<{ draft: { project: Project; obligations: Obligation[] }; keep: string[]; documentId?: string; feedback?: FeedbackItem[] }>();
  const orgId = c.get('user').orgId;
  const project = cleanProject(draft?.project);
  if (!project || !Array.isArray(draft.obligations) || draft.obligations.length > 500) return c.json({ error: 'El borrador no tiene el formato esperado.' }, 400);
  const clean = draft.obligations.map(cleanObligation);
  if (clean.some((o) => !o)) return c.json({ error: 'Hay compromisos con datos inválidos. Vuelve a leer el documento.' }, 400);
  const r = await saveDraft(c.env, orgId, { project, obligations: clean as Obligation[] }, Array.isArray(keep) ? keep : null, true);
  // Lo que la persona corrigió en la revisión enseña a la próxima lectura (ver shared/learning.ts).
  if (Array.isArray(feedback) && feedback.length) {
    const ok = (x: FeedbackItem) => ['kept', 'removed', 'edited', 'added'].includes(x.action) && typeof x.quoteKey === 'string' && x.quoteKey.length >= 20;
    const rows = feedback.filter(ok).slice(0, 300).map((x) => c.env.DB.prepare(
      'INSERT INTO reading_feedback (id, org_id, project_id, action, quote_key, quote, section, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(randomId(12), orgId, r.projectId, x.action, x.quoteKey.slice(0, 160), String(x.quote ?? '').slice(0, 400), x.section ? String(x.section).slice(0, 120) : null,
      x.before ? JSON.stringify(x.before) : null, x.after ? JSON.stringify(x.after) : null));
    for (let i = 0; i < rows.length; i += 50) await c.env.DB.batch(rows.slice(i, i + 50)).catch((e) => console.log('[aprendizaje]', String(e)));
  }
  if (documentId) await c.env.DB.prepare(`UPDATE documents SET read_at = datetime('now') WHERE id = ? AND org_id = ?`).bind(documentId, orgId).run();
  return c.json({ ok: true, ...r });
});

async function saveDraft(env: Env, orgId: string, draft: { project: Project; obligations: Obligation[] }, keep: string[] | null, confirm: boolean) {
  const exists = await env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(draft.project.id).first<{ org_id: string }>();
  const mine = exists?.org_id === orgId;
  // Cada empresa tiene sus propios identificadores: dos empresas pueden importar la misma RCA sin pisarse.
  const projectId = exists && !mine ? `${draft.project.id}-${randomId(4)}` : draft.project.id;
  const oldId = draft.project.id;
  const reId = (id: string) => {
    if (id.startsWith(`${oldId}-vu-`)) return `${projectId}-vu-${id.slice(oldId.length + 4)}`;
    return id.startsWith(`${projectId}:`) ? id : `${projectId}:${id}`;
  };
  const obs = draft.obligations
    .filter((o) => !keep || keep.includes(o.id))
    .map((o) => ({ ...o, id: reId(o.id), projectId, confirmed: confirm ? true : o.confirmed }));
  // Vigía empieza a vigilar desde el día en que se importa la RCA: lo anterior no se marca como vencido.
  const today = todayInChile();
  const project = mine ? { ...draft.project, id: projectId } : { ...draft.project, id: projectId, trackingStart: draft.project.trackingStart > today ? draft.project.trackingStart : today };
  await env.DB.batch([...(mine ? [] : [putProject(env, orgId, project)]), ...obs.map((o) => putObligation(env, orgId, o))]);
  return { projectId, count: obs.length };
}

// Correcciones acumuladas, para sumar casos al set de referencia (tests/eval/gold). Solo con el token del operador.
app.get('/api/extractor/feedback', async (c) => {
  if (!bearerOk(c.req.header('authorization'), c.env.EXTRACTOR_TOKEN)) return c.json({ error: 'Token inválido.' }, 401);
  const { results } = await c.env.DB.prepare(
    `SELECT action, quote_key, quote, section, before_json, after_json, created_at FROM reading_feedback WHERE action != 'kept' ORDER BY created_at DESC LIMIT 1000`,
  ).all();
  return c.json(results);
});

// El extractor local (tu servidor con Ollama) sube RCA ya leídas con un token propio.
app.post('/api/extractor/upload', async (c) => {
  if (!bearerOk(c.req.header('authorization'), c.env.EXTRACTOR_TOKEN)) return c.json({ error: 'Token inválido.' }, 401);
  const { email, draft } = await c.req.json<{ email: string; draft: { project: Project; obligations: Obligation[] } }>();
  const u = await c.env.DB.prepare('SELECT org_id FROM users WHERE email = ?').bind(cleanEmail(email)).first<{ org_id: string }>();
  if (!u) return c.json({ error: 'Ese correo no tiene cuenta en Vigía.' }, 404);
  const project = cleanProject(draft?.project);
  const obligations = (Array.isArray(draft?.obligations) ? draft.obligations.slice(0, 500) : []).map(cleanObligation).filter((o): o is Obligation => !!o);
  if (!project) return c.json({ error: 'El borrador no tiene el formato esperado.' }, 400);
  const r = await saveDraft(c.env, u.org_id, { project, obligations }, null, false); // quedan "por revisar"
  return c.json({ ok: true, ...r });
});

app.put('/api/settings/notify', async (c) => {
  const n = await c.req.json<NotifySettings>();
  const clean: NotifySettings = { weeklyDigest: !!n.weeklyDigest, before7: !!n.before7, before1: !!n.before1, overdue: !!n.overdue, push: !!n.push };
  await c.env.DB.prepare('UPDATE settings SET notify = ? WHERE user_id = ?').bind(JSON.stringify(clean), c.get('user').id).run();
  return c.json({ ok: true });
});

app.post('/api/settings/test-email', async (c) => {
  const user = c.get('user');
  if (!(await allow(c.env, `mail-test:${user.id}`, 5, 3_600_000))) return TOO_MANY(c, 'Ya enviaste varias pruebas. Espera una hora para otra.');
  const data = await loadOrg(c.env, user.orgId);
  const plan = planNotifications(data, todayInChile(), { ...DEFAULT_NOTIFY, weeklyDigest: true }, user.id, new Set());
  const mail = plan
    ? digestMail(c.env, user.email, `${plan.subject} (prueba)`, plan.title, plan.groups, 'Este es un correo de prueba.')
    : digestMail(c.env, user.email, 'Vigía · Correo de prueba', 'Todo al día', [], 'Este es un correo de prueba. No tienes vencimientos cercanos.');
  const r = await sendMail(c.env, mail);
  return c.json({ ok: r.ok, message: r.ok ? `Enviado a ${user.email}.` : `No se pudo enviar: ${r.detail}` });
});

app.post('/api/push/subscribe', async (c) => {
  const sub = await c.req.json<{ endpoint: string; keys: { p256dh: string; auth: string } }>();
  if (!pushEndpointOk(sub?.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string' || sub.endpoint.length > 600) return c.json({ error: 'Suscripción inválida.' }, 400);
  await c.env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, keys) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys')
    .bind(sub.endpoint, c.get('user').id, JSON.stringify(sub.keys)).run();
  const sent = await pushToUser(c.env, c.get('user').id, 'Notificaciones activadas', 'Aquí te avisaremos de cada vencimiento.');
  return c.json({ ok: true, sent });
});

// —————————— Empresa y equipo ——————————

const isOwner = (c: { get: (k: 'user') => SessionUser }) => c.get('user').role === 'owner';

app.get('/api/team', async (c) => {
  const me = c.get('user');
  const r = await c.env.DB.prepare('SELECT u.id, u.name, u.email, u.role, k.user_id IS NULL AS pending FROM users u LEFT JOIN credentials k ON k.user_id = u.id WHERE u.org_id = ? ORDER BY u.created_at')
    .bind(me.orgId).all<{ id: string; name: string; email: string; role: string; pending: number }>();
  return c.json(r.results.map((u) => ({ ...u, pending: !!u.pending, you: u.id === me.id })));
});

app.post('/api/team/invite', async (c) => {
  if (!isOwner(c)) return c.json({ error: 'Solo quien creó la cuenta puede invitar.' }, 403);
  const me = c.get('user');
  if (!(await allow(c.env, `invite:${me.orgId}`, 20, 86_400_000))) return TOO_MANY(c, 'Hoy ya enviaste muchas invitaciones. Vuelve a intentarlo mañana.');
  const b = await c.req.json<{ email?: string; name?: string }>().catch(() => ({} as Record<string, undefined>));
  if (!isEmail(b.email)) return c.json({ error: 'Escribe un correo válido.', field: 'email' }, 400);
  const email = b.email.trim().toLowerCase();
  const other = await c.env.DB.prepare('SELECT org_id FROM users WHERE email = ?').bind(email).first<{ org_id: string }>();
  if (other && other.org_id !== me.orgId) return c.json({ error: 'Ese correo ya usa Vigía en otra empresa. Cada correo pertenece a una sola empresa.', field: 'email' }, 409);
  if (other) return c.json({ error: 'Esa persona ya está en tu equipo.', field: 'email' }, 409);
  const id = `u-${randomId(10)}`;
  const name = (b.name ?? '').trim().slice(0, 80) || email.split('@')[0];
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO users (id, org_id, email, name, role) VALUES (?, ?, ?, ?, 'member')`).bind(id, me.orgId, email, name),
    c.env.DB.prepare('INSERT INTO settings (user_id, notify, calendar_token) VALUES (?, ?, ?)').bind(id, JSON.stringify(DEFAULT_NOTIFY), randomId(16)),
  ]);
  const org = await c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(me.orgId).first<{ name: string }>();
  // El enlace vuelve a quien invita para que lo comparta por donde quiera (WhatsApp, chat): no depende del correo.
  const link = passwordLink(c.env, await issueToken(c.env, email, 7 * 86_400_000));
  const res = await sendMail(c.env, inviteMail(c.env, email, link, me.name || me.email, org?.name ?? 'tu empresa'));
  return c.json({ id, name, email, role: 'member', pending: true, link, mailed: res.ok, detail: res.ok ? undefined : res.detail });
});

// Prueba del envío de correos: manda uno a quien la pide y devuelve la respuesta real del proveedor.
app.post('/api/mail/test', async (c) => {
  const me = c.get('user');
  if (!(await allow(c.env, `mail-test:${me.id}`, 5, 3_600_000))) return TOO_MANY(c, 'Ya enviaste varias pruebas. Espera una hora para otra.');
  const r = await sendMail(c.env, { to: me.email, subject: 'Prueba de correo de Vigía', text: 'Si lees esto, los avisos de Vigía te van a llegar.', html: '<p>Si lees esto, los avisos de Vigía te van a llegar.</p>' });
  return c.json({ ok: r.ok, provider: c.env.MAIL_PROVIDER ?? 'consola', detail: r.detail });
});

// Nuevo enlace de acceso para alguien del equipo que todavía no crea su contraseña.
app.post('/api/team/:id/link', async (c) => {
  if (!isOwner(c)) return c.json({ error: 'Solo quien creó la cuenta puede generar enlaces de acceso.' }, 403);
  const me = c.get('user');
  const u = await c.env.DB.prepare('SELECT u.email, k.hash FROM users u LEFT JOIN credentials k ON k.user_id = u.id WHERE u.id = ? AND u.org_id = ?')
    .bind(c.req.param('id'), me.orgId).first<{ email: string; hash: string | null }>();
  if (!u) return c.json({ error: 'Persona no encontrada.' }, 404);
  if (u.hash) return c.json({ error: 'Esa persona ya tiene contraseña. Si la olvidó, puede recuperarla desde la pantalla de entrada.' }, 409);
  return c.json({ link: passwordLink(c.env, await issueToken(c.env, u.email, 7 * 86_400_000)) });
});

app.delete('/api/team/:id', async (c) => {
  if (!isOwner(c)) return c.json({ error: 'Solo quien creó la cuenta puede quitar personas.' }, 403);
  const me = c.get('user'), id = c.req.param('id');
  if (id === me.id) return c.json({ error: 'No puedes quitarte a ti mismo.' }, 400);
  const u = await c.env.DB.prepare('SELECT 1 FROM users WHERE id = ? AND org_id = ?').bind(id, me.orgId).first();
  if (!u) return c.json({ error: 'Persona no encontrada.' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM push_subs WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM settings WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM credentials WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ? AND org_id = ?').bind(id, me.orgId),
  ]);
  return c.json({ ok: true });
});

app.put('/api/org', async (c) => {
  if (!isOwner(c)) return c.json({ error: 'Solo quien creó la cuenta puede cambiar el nombre.' }, 403);
  const { name } = await c.req.json<{ name?: string }>();
  const clean = (name ?? '').trim().slice(0, 120);
  if (clean.length < 2) return c.json({ error: 'Escribe el nombre de la empresa.', field: 'name' }, 400);
  await c.env.DB.prepare('UPDATE orgs SET name = ? WHERE id = ?').bind(clean, c.get('user').orgId).run();
  return c.json({ ok: true });
});

// Borra la empresa completa: proyectos, compromisos, evidencias, documentos y personas. No se puede deshacer.
app.delete('/api/org', async (c) => {
  if (!isOwner(c)) return c.json({ error: 'Solo quien creó la cuenta puede eliminarla.' }, 403);
  const { confirm } = await c.req.json<{ confirm?: string }>().catch(() => ({ confirm: undefined }));
  const orgId = c.get('user').orgId;
  const org = await c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(orgId).first<{ name: string }>();
  if (!org || confirm?.trim() !== org.name) return c.json({ error: 'Escribe el nombre exacto de la empresa para confirmar.', field: 'confirm' }, 400);
  const users = `(SELECT id FROM users WHERE org_id = ?)`;
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM document_chunks WHERE document_id IN (SELECT id FROM documents WHERE org_id = ?)`).bind(orgId),
    ...['reading_feedback', 'documents', 'evidence', 'events', 'completions', 'obligations', 'projects'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE org_id = ?`).bind(orgId)),
    ...['sessions', 'push_subs', 'settings', 'credentials'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id IN ${users}`).bind(orgId)),
    c.env.DB.prepare('DELETE FROM users WHERE org_id = ?').bind(orgId),
    c.env.DB.prepare('DELETE FROM orgs WHERE id = ?').bind(orgId),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// —————————— Documentos del proyecto ——————————

const CHUNK = 900_000;
const MAX_DOC = 25_000_000;
const DOC_KINDS = ['rca', 'resolucion', 'programa', 'informe', 'otro'];

async function ownsProject(env: Env, orgId: string, projectId: string) {
  return !!(await env.DB.prepare('SELECT 1 FROM projects WHERE id = ? AND org_id = ?').bind(projectId, orgId).first());
}

async function documentBytes(env: Env, orgId: string, id: string) {
  const doc = await env.DB.prepare('SELECT name, mime, chunks, project_id, kind FROM documents WHERE id = ? AND org_id = ?')
    .bind(id, orgId).first<{ name: string; mime: string; chunks: number; project_id: string; kind: string }>();
  if (!doc) return null;
  const rows = await env.DB.prepare('SELECT bytes FROM document_chunks WHERE document_id = ? ORDER BY idx').bind(id).all<{ bytes: ArrayBuffer }>();
  const parts = rows.results.map((r) => new Uint8Array(r.bytes as ArrayBuffer));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return { ...doc, bytes: out };
}

app.post('/api/documents', async (c) => {
  const me = c.get('user');
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | string | null;
  const projectId = String(form.get('projectId') ?? ''), kind = String(form.get('kind') ?? 'otro');
  if (!file || typeof file === 'string') return c.json({ error: 'Elige un archivo.', field: 'file' }, 400);
  if (file.size > MAX_DOC) return c.json({ error: 'El archivo pesa más de 25 MB. Comprímelo o divídelo en partes.', field: 'file' }, 413);
  if (!DOC_KINDS.includes(kind)) return c.json({ error: 'Elige el tipo de documento.', field: 'kind' }, 400);
  if (!(await ownsProject(c.env, me.orgId, projectId))) return c.json({ error: 'Proyecto no encontrado.' }, 404);
  if ((await usedStorage(c.env, me.orgId)) + file.size > STORAGE_QUOTA) return c.json({ error: 'Tu empresa llegó al límite de almacenamiento (100 MB). Borra documentos o evidencias que ya no necesites.', field: 'file' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = `d-${randomId(12)}`, chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const name = file.name.slice(0, 160), mime = file.type || 'application/octet-stream';
  // Un trozo por consulta: así ninguna supera los límites de tamaño de D1, aunque el PDF pese 25 MB.
  await c.env.DB.prepare('INSERT INTO documents (id, org_id, project_id, kind, name, mime, size, chunks, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me.orgId, projectId, kind, name, mime, bytes.length, chunks, me.name || me.email).run();
  try {
    for (let i = 0; i < chunks; i++) {
      await c.env.DB.prepare('INSERT INTO document_chunks (document_id, idx, bytes) VALUES (?, ?, ?)').bind(id, i, bytes.slice(i * CHUNK, (i + 1) * CHUNK)).run();
    }
  } catch (e) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM document_chunks WHERE document_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id),
    ]);
    throw e;
  }
  return c.json({ id, projectId, kind, name, size: bytes.length, uploadedBy: me.name || me.email, createdAt: new Date().toISOString(), url: `/api/documents/${id}` });
});

app.get('/api/documents/:id', async (c) => {
  const d = await documentBytes(c.env, c.get('user').orgId, c.req.param('id'));
  if (!d) return c.json({ error: 'Documento no encontrado.' }, 404);
  return fileResponse(d.bytes, d.name, d.mime);
});

app.delete('/api/documents/:id', async (c) => {
  const orgId = c.get('user').orgId, id = c.req.param('id');
  const d = await c.env.DB.prepare('SELECT 1 FROM documents WHERE id = ? AND org_id = ?').bind(id, orgId).first();
  if (!d) return c.json({ error: 'Documento no encontrado.' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM document_chunks WHERE document_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM documents WHERE id = ? AND org_id = ?').bind(id, orgId),
  ]);
  return c.json({ ok: true });
});

// Lee un documento guardado y propone compromisos para su proyecto. Se revisan antes de guardarlos.
app.post('/api/documents/:id/extract', async (c) => {
  const orgId = c.get('user').orgId;
  if (!(await allow(c.env, `ai:${orgId}`, AI_PER_HOUR, 3_600_000))) return TOO_MANY(c, 'Leíste muchos documentos en poco tiempo. Espera un rato para seguir.');
  const d = await documentBytes(c.env, orgId, c.req.param('id'));
  if (!d) return c.json({ error: 'Documento no encontrado.' }, 404);
  if (d.mime !== 'application/pdf') return c.json({ error: 'Solo se pueden leer documentos PDF.' }, 400);
  const p = await c.env.DB.prepare('SELECT data FROM projects WHERE id = ? AND org_id = ?').bind(d.project_id, orgId).first<{ data: string }>();
  if (!p) return c.json({ error: 'Proyecto no encontrado.' }, 404);
  return c.json(await extractFromPdf(c.env, d.bytes.buffer, `documento:${d.name}`, { project: JSON.parse(p.data), kind: d.kind }));
});

// —————————— Calendario público por token ——————————

app.get('/cal/:file', async (c) => {
  const token = c.req.param('file').replace(/\.ics$/, '');
  const row = await c.env.DB.prepare('SELECT u.org_id FROM settings s JOIN users u ON u.id = s.user_id WHERE s.calendar_token = ?').bind(token).first<{ org_id: string }>();
  if (!row) return c.text('Calendario no encontrado', 404);
  const ics = buildIcs(await loadOrg(c.env, row.org_id), todayInChile(), c.env.APP_URL, c.env.APP_NAME);
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex' } });
});

app.get('/api/*', (c) => c.json({ error: 'Ruta no encontrada.' }, 404));

// Todo lo demás: la app (archivos estáticos con respaldo a index.html).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyAlerts(env, todayInChile()).then((r) => console.log('[alertas]', JSON.stringify(r))));
    // Limpieza diaria de sesiones, enlaces y contadores vencidos.
    const now = Date.now();
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM auth_throttle WHERE locked_until > 0 AND locked_until < ?').bind(now),
    ]).catch((e) => console.log('[limpieza]', String(e))));
  },
};
