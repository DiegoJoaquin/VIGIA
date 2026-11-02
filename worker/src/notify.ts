// Alertas diarias. Se ejecuta con el cron del Worker.
// Para cada usuario: arma sus vencimientos, decide qué avisar hoy y envía UN correo y UNA notificación.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { addDays, buildOccurrences, toUTC } from '../../shared/recurrence';
import type { Occurrence } from '../../shared/types';
import type { Env } from './env';
import { digestMail, sendMail, type DigestGroup } from './mail';
import { loadOrg, type OrgData } from './repo';

export interface NotifySettings { weeklyDigest: boolean; before7: boolean; before1: boolean; overdue: boolean; push: boolean }
export const DEFAULT_NOTIFY: NotifySettings = { weeklyDigest: true, before7: true, before1: true, overdue: true, push: false };

export interface Plan { groups: DigestGroup[]; keys: string[]; subject: string; title: string; why: string }

/**
 * Decide qué avisar hoy. Función pura: se prueba sin base de datos.
 * `alreadySent` contiene las claves ya enviadas (para no repetir).
 */
export function planNotifications(data: OrgData, today: string, s: NotifySettings, userId: string, alreadySent: Set<string>): Plan | null {
  const occ = buildOccurrences({
    projects: data.projects, obligations: data.obligations.filter((o) => o.confirmed),
    completions: data.completions, events: data.events, today,
    from: addDays(today, -90), to: addDays(today, 8),
  }).filter((o) => o.status !== 'done');

  const monday = new Date(toUTC(today)).getUTCDay() === 1;
  const keys: string[] = [];
  const take = (o: Occurrence, tag: string) => { const k = `${userId}|${o.key}|${tag}`; if (alreadySent.has(k)) return false; keys.push(k); return true; };

  // Vencidos: un aviso por compromiso (el más antiguo), aunque tenga varias fechas atrasadas.
  const lateAll = s.overdue ? occ.filter((o) => o.daysLeft < 0 && take(o, `late-${today}`)) : [];
  const lateCount = new Map<string, number>();
  for (const o of lateAll) lateCount.set(o.obligation.id, (lateCount.get(o.obligation.id) ?? 0) + 1);
  const overdue = lateAll.filter((o, i) => lateAll.findIndex((x) => x.obligation.id === o.obligation.id) === i)
    .map((o) => (lateCount.get(o.obligation.id)! > 1 ? { ...o, obligation: { ...o.obligation, title: `${o.obligation.title} (${lateCount.get(o.obligation.id)} fechas pendientes)` } } : o));
  const soon = s.before1 ? occ.filter((o) => (o.daysLeft === 0 || o.daysLeft === 1) && take(o, 'd1')) : [];
  const week = monday && s.weeklyDigest
    ? occ.filter((o) => o.daysLeft >= 0 && o.daysLeft <= 7 && !soon.includes(o) && take(o, `week-${today}`))
    : s.before7 ? occ.filter((o) => o.daysLeft === 7 && take(o, 'd7')) : [];

  if (!overdue.length && !soon.length && !week.length) return null;
  const groups: DigestGroup[] = [
    { label: 'Vencidos', tone: 'danger', items: overdue },
    { label: 'Hoy y mañana', tone: 'warn', items: soon },
    { label: monday ? 'Esta semana' : 'En 7 días', tone: 'plain', items: week },
  ];
  const total = overdue.length + soon.length + week.length;
  const subject = overdue.length
    ? `${overdue.length} compromiso${overdue.length > 1 ? 's' : ''} vencido${overdue.length > 1 ? 's' : ''}${soon.length ? ` y ${soon.length} por vencer` : ''}`
    : monday && s.weeklyDigest ? `Tu semana: ${total} vencimiento${total > 1 ? 's' : ''}` : `${total} compromiso${total > 1 ? 's' : ''} por vencer`;
  const title = monday && s.weeklyDigest ? `Esta semana tienes ${total} compromiso${total > 1 ? 's' : ''} ambientales` : subject;
  return { groups, keys, subject: `Vigía · ${subject}`, title, why: 'Recibes este correo porque tienes avisos activados en Vigía.' };
}

export async function runDailyAlerts(env: Env, today: string): Promise<{ users: number; mails: number; pushes: number }> {
  const users = await env.DB.prepare(
    'SELECT u.id, u.org_id, u.email, s.notify FROM users u LEFT JOIN settings s ON s.user_id = u.id',
  ).all<{ id: string; org_id: string; email: string; notify: string | null }>();
  const cache = new Map<string, OrgData>();
  let mails = 0, pushes = 0;

  for (const u of users.results) {
    const settings: NotifySettings = { ...DEFAULT_NOTIFY, ...(u.notify ? JSON.parse(u.notify) : {}) };
    if (!cache.has(u.org_id)) cache.set(u.org_id, await loadOrg(env, u.org_id));
    const data = cache.get(u.org_id)!;
    const sent = await env.DB.prepare('SELECT key FROM notification_log WHERE key LIKE ?').bind(`${u.id}|%`).all<{ key: string }>();
    const plan = planNotifications(data, today, settings, u.id, new Set(sent.results.map((r) => r.key)));
    if (!plan) continue;

    const res = await sendMail(env, digestMail(env, u.email, plan.subject, plan.title, plan.groups, plan.why));
    if (res.ok) mails += 1; else console.warn(`[alertas] correo a ${u.email} falló: ${res.detail}`);

    if (settings.push) pushes += await pushToUser(env, u.id, plan.subject.replace('Vigía · ', ''), plan.groups.flatMap((g) => g.items).slice(0, 3).map((o) => o.obligation.title).join(' · '));

    if (res.ok) await env.DB.batch(plan.keys.map((k) => env.DB.prepare('INSERT OR IGNORE INTO notification_log (key) VALUES (?)').bind(k)));
  }
  // Limpieza: el registro de avisos solo necesita los últimos 120 días.
  await env.DB.prepare("DELETE FROM notification_log WHERE sent_at < datetime('now', '-120 days')").run();
  return { users: users.results.length, mails, pushes };
}

export async function pushToUser(env: Env, userId: string, title: string, body: string): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const subs = await env.DB.prepare('SELECT endpoint, keys FROM push_subs WHERE user_id = ?').bind(userId).all<{ endpoint: string; keys: string }>();
  let n = 0;
  for (const s of subs.results) {
    try {
      const payload = await buildPushPayload(
        { data: JSON.stringify({ title, body, url: env.APP_URL }), options: { ttl: 86_400, urgency: 'normal' } },
        { endpoint: s.endpoint, expirationTime: null, keys: JSON.parse(s.keys) },
        { subject: env.VAPID_SUBJECT ?? `mailto:${env.MAIL_FROM}`, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
      );
      const r = await fetch(s.endpoint, payload);
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (r.ok) n += 1;
    } catch (e) { console.warn('[push]', (e as Error).message); }
  }
  return n;
}
