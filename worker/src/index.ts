import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { todayInChile } from '../../shared/recurrence';
import type { Obligation, Project } from '../../shared/types';
import { ventanillaObligations, type VentanillaAnswers } from '../../shared/ventanilla';
import type { Env, SessionUser } from './env';
import { extractFromPdf, fetchRca } from './extract';
import { buildIcs } from './ics';
import { digestMail, magicLinkMail, sendMail } from './mail';
import { DEFAULT_NOTIFY, planNotifications, pushToUser, runDailyAlerts, type NotifySettings } from './notify';
import { loadOrg, obligationOrg, putObligation, putProject } from './repo';
import { isEmail, randomId, sha256 } from './util';

type App = { Bindings: Env; Variables: { user: SessionUser } };
const app = new Hono<App>();
const SESSION_COOKIE = 'vigia_session';
const MAX_EVIDENCE = 1_500_000;

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Error inesperado' }, 500);
});

// —————————— Sesión por enlace mágico (sin contraseñas) ——————————

app.post('/api/auth/request', async (c) => {
  const { email } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }));
  if (!isEmail(email)) return c.json({ error: 'Escribe un correo válido.' }, 400);
  const clean = email.trim().toLowerCase();
  const token = randomId(24);
  await c.env.DB.prepare('INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), clean, Date.now() + 20 * 60_000).run();
  const link = `${c.env.APP_URL}/api/auth/verify?token=${token}`;
  const res = await sendMail(c.env, magicLinkMail(c.env, clean, link));
  if (!res.ok) return c.json({ error: `No pudimos enviar el correo: ${res.detail}` }, 502);
  return c.json({ ok: true });
});

app.get('/api/auth/verify', async (c) => {
  const token = c.req.query('token') ?? '';
  const row = await c.env.DB.prepare('SELECT email, expires_at FROM login_tokens WHERE token_hash = ?')
    .bind(await sha256(token)).first<{ email: string; expires_at: number }>();
  await c.env.DB.prepare('DELETE FROM login_tokens WHERE token_hash = ? OR expires_at < ?').bind(await sha256(token), Date.now()).run();
  if (!row || row.expires_at < Date.now()) return c.redirect('/login?error=enlace');

  let user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(row.email).first<{ id: string }>();
  if (!user) {
    // Primer ingreso: crea la organización y el usuario dueño.
    const orgId = `o-${randomId(8)}`, userId = `u-${randomId(8)}`;
    const domain = row.email.split('@')[1];
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO orgs (id, name) VALUES (?, ?)').bind(orgId, domain),
      c.env.DB.prepare('INSERT INTO users (id, org_id, email, name) VALUES (?, ?, ?, ?)').bind(userId, orgId, row.email, row.email.split('@')[0]),
      c.env.DB.prepare('INSERT INTO settings (user_id, notify, calendar_token) VALUES (?, ?, ?)').bind(userId, JSON.stringify(DEFAULT_NOTIFY), randomId(16)),
    ]);
    user = { id: userId };
  }
  const sid = randomId(32);
  await c.env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(sid), user.id, Date.now() + 60 * 86_400_000).run();
  setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 60 * 86_400 });
  return c.redirect('/#hoy');
});

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
    user: { name: user.name, email: user.email, org: org?.name ?? '' },
    ...data,
    notify: { ...DEFAULT_NOTIFY, ...(s ? JSON.parse(s.notify) : {}) },
    calendarUrl: `${c.env.APP_URL}/cal/${s?.calendar_token ?? ''}.ics`,
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null,
  });
});

app.post('/api/completions', async (c) => {
  const b = await c.req.json<{ obligationId: string; due: string; note?: string }>();
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
  if (!(await canTouch(c, obligationId))) return c.json({ error: 'Compromiso no encontrado.' }, 404);
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
  return new Response(new Uint8Array(r.bytes as ArrayBuffer), {
    headers: { 'content-type': r.mime, 'content-disposition': `inline; filename="${encodeURIComponent(r.name)}"`, 'cache-control': 'private, max-age=86400' },
  });
});

app.post('/api/events', async (c) => {
  const b = await c.req.json<{ obligationId: string; note?: string }>();
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
  const orgId = c.get('user').orgId;
  const data = await loadOrg(c.env, orgId);
  const targets = data.obligations.filter((o) => ids.includes(o.id));
  if (targets.length) await c.env.DB.batch(targets.map((o) => putObligation(c.env, orgId, { ...o, confirmed: true })));
  return c.json({ ok: true, count: targets.length });
});

app.put('/api/obligations/:id', async (c) => {
  const o = await c.req.json<Obligation>();
  if (o.id !== c.req.param('id') || !(await canTouch(c, o.id))) return c.json({ error: 'Compromiso no encontrado.' }, 404);
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
  const draft = await extractFromPdf(c.env, await fetchRca(url), url);
  return c.json(draft);
});

app.post('/api/import/extract-file', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | string | null;
  if (!file || typeof file === 'string') return c.json({ error: 'Falta el PDF.' }, 400);
  if (file.size > 25_000_000) return c.json({ error: 'La RCA pesa más de 25 MB. Usa el extractor local.' }, 413);
  return c.json(await extractFromPdf(c.env, await file.arrayBuffer(), `archivo:${file.name}`));
});

app.post('/api/import/save', async (c) => {
  const { draft, keep } = await c.req.json<{ draft: { project: Project; obligations: Obligation[] }; keep: string[] }>();
  const orgId = c.get('user').orgId;
  const r = await saveDraft(c.env, orgId, draft, keep, true);
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
  await env.DB.batch([putProject(env, orgId, project), ...obs.map((o) => putObligation(env, orgId, o))]);
  return { projectId, count: obs.length };
}

// El extractor local (tu servidor con Ollama) sube RCA ya leídas con un token propio.
app.post('/api/extractor/upload', async (c) => {
  if (!c.env.EXTRACTOR_TOKEN || c.req.header('authorization') !== `Bearer ${c.env.EXTRACTOR_TOKEN}`) return c.json({ error: 'Token inválido.' }, 401);
  const { email, draft } = await c.req.json<{ email: string; draft: { project: Project; obligations: Obligation[] } }>();
  const u = await c.env.DB.prepare('SELECT org_id FROM users WHERE email = ?').bind(email?.toLowerCase()).first<{ org_id: string }>();
  if (!u) return c.json({ error: 'Ese correo no tiene cuenta en Vigía.' }, 404);
  const r = await saveDraft(c.env, u.org_id, draft, null, false); // quedan "por revisar"
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
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh) return c.json({ error: 'Suscripción inválida.' }, 400);
  await c.env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, keys) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys')
    .bind(sub.endpoint, c.get('user').id, JSON.stringify(sub.keys)).run();
  const sent = await pushToUser(c.env, c.get('user').id, 'Notificaciones activadas', 'Aquí te avisaremos de cada vencimiento.');
  return c.json({ ok: true, sent });
});

// —————————— Calendario público por token ——————————

app.get('/cal/:file', async (c) => {
  const token = c.req.param('file').replace(/\.ics$/, '');
  const row = await c.env.DB.prepare('SELECT u.org_id FROM settings s JOIN users u ON u.id = s.user_id WHERE s.calendar_token = ?').bind(token).first<{ org_id: string }>();
  if (!row) return c.text('Calendario no encontrado', 404);
  const ics = buildIcs(await loadOrg(c.env, row.org_id), todayInChile(), c.env.APP_URL, c.env.APP_NAME);
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
});

app.get('/api/*', (c) => c.json({ error: 'Ruta no encontrada.' }, 404));

// Todo lo demás: la app (archivos estáticos con respaldo a index.html).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyAlerts(env, todayInChile()).then((r) => console.log('[alertas]', JSON.stringify(r))));
  },
};
