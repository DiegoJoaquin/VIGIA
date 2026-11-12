// Envío de correos sin costo. Tres opciones gratuitas, se elige con MAIL_PROVIDER:
//  - brevo:  300 correos al día gratis. Requiere verificar el remitente.
//  - resend: 100 al día / 3.000 al mes gratis. Requiere un dominio verificado.
//  - gas:    Google Apps Script con tu Gmail (100 al día). Cero configuración de dominio. Ver mailer/Code.gs.
import type { Occurrence } from '../../shared/types';
import type { Env } from './env';
import { escapeHtml } from './util';

export interface Mail { to: string; subject: string; html: string; text: string }

export async function sendMail(env: Env, m: Mail): Promise<{ ok: boolean; detail: string }> {
  try {
    if (env.MAIL_PROVIDER === 'brevo') {
      if (!env.BREVO_API_KEY) return { ok: false, detail: 'Falta el secreto BREVO_API_KEY' };
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
      });
      return { ok: r.ok, detail: r.ok ? 'enviado' : await r.text() };
    }
    if (env.MAIL_PROVIDER === 'resend') {
      if (!env.RESEND_API_KEY) return { ok: false, detail: 'Falta el secreto RESEND_API_KEY' };
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      });
      return { ok: r.ok, detail: r.ok ? 'enviado' : await r.text() };
    }
    if (env.MAIL_PROVIDER === 'gas') {
      if (!env.GAS_URL || !env.GAS_TOKEN) return { ok: false, detail: 'Faltan GAS_URL o GAS_TOKEN' };
      const r = await fetch(env.GAS_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: env.GAS_TOKEN, to: m.to, subject: m.subject, html: m.html, text: m.text, name: env.MAIL_FROM_NAME }),
      });
      const body = await r.text();
      if (r.ok && body.includes('"ok":true')) return { ok: true, detail: 'enviado' };
      // Las fallas típicas de Apps Script, explicadas para quien lo configuró.
      if (/^\s*</.test(body)) return { ok: false, detail: `Apps Script respondió con una página web (HTTP ${r.status}) y no con el resultado del envío. Revisa que GAS_URL termine en /exec y que la implementación esté publicada con acceso "Cualquier persona".` };
      if (/token/i.test(body)) return { ok: false, detail: `Apps Script rechazó el token: GAS_TOKEN en Cloudflare no coincide con el TOKEN del script. (${body.slice(0, 120)})` };
      return { ok: false, detail: `Apps Script (HTTP ${r.status}): ${body.slice(0, 200)}` };
    }
    console.log(`[mail] ${m.to} · ${m.subject}\n${m.text}`);
    return { ok: true, detail: 'registrado en consola' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

// —————————— Plantillas ——————————

const C = { ink: '#141918', ink2: '#56605c', line: '#e6eae8', bg: '#f2f4f3', accent: '#0c6b5c', danger: '#c4321c', warn: '#a05600' };
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmt = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

function layout(env: Env, title: string, inner: string, footer: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:22px 24px 6px;font-size:15px;font-weight:700;color:${C.accent}">${escapeHtml(env.APP_NAME)}</td></tr>
<tr><td style="padding:4px 24px 0;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-0.01em">${escapeHtml(title)}</td></tr>
<tr><td style="padding:12px 24px 24px">${inner}</td></tr>
</table>
<p style="max-width:560px;font-size:12px;color:${C.ink2};line-height:1.5;margin:14px auto 0">${footer}</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">${escapeHtml(label)}</a>`;
}

export function passwordMail(env: Env, to: string, link: string, forgot: boolean): Mail {
  const lead = forgot ? 'Pediste cambiar tu contraseña. Toca el botón para elegir una nueva.' : 'Tu cuenta todavía no tiene contraseña. Toca el botón para crearla y entrar.';
  const inner = `<p style="font-size:15px;line-height:1.5;color:${C.ink2};margin:0 0 18px">${lead} El enlace sirve una vez y vence en 1 hora.</p>${button(link, forgot ? 'Elegir nueva contraseña' : 'Crear mi contraseña')}`;
  return {
    to, subject: forgot ? `Cambia tu contraseña de ${env.APP_NAME}` : `Crea tu contraseña de ${env.APP_NAME}`,
    html: layout(env, forgot ? 'Nueva contraseña' : 'Crea tu contraseña', inner, 'Si no pediste este correo, puedes ignorarlo: tu contraseña sigue igual.'),
    text: `${lead} Enlace (vence en 1 hora): ${link}`,
  };
}

export function welcomeMail(env: Env, to: string, name: string, company: string): Mail {
  const inner = `<p style="font-size:15px;line-height:1.5;color:${C.ink2};margin:0 0 18px">Hola ${escapeHtml(name)}, ya creaste la cuenta de <strong>${escapeHtml(company)}</strong>. El primer paso es importar la RCA de tu proyecto: Vigía arma el calendario de compromisos y te avisa antes de cada vencimiento.</p>${button(env.APP_URL, 'Abrir Vigía')}`;
  return {
    to, subject: `Bienvenido a ${env.APP_NAME}`,
    html: layout(env, 'Tu cuenta está lista', inner, 'Recibes este correo porque creaste una cuenta en Vigía.'),
    text: `Hola ${name}, ya creaste la cuenta de ${company} en ${env.APP_NAME}. Entra en ${env.APP_URL}`,
  };
}

export function inviteMail(env: Env, to: string, link: string, from: string, company: string): Mail {
  const inner = `<p style="font-size:15px;line-height:1.5;color:${C.ink2};margin:0 0 18px">${escapeHtml(from)} te agregó al equipo de <strong>${escapeHtml(company)}</strong> en ${escapeHtml(env.APP_NAME)}, donde llevan los compromisos ambientales de sus proyectos. Para entrar, crea tu contraseña con este botón. El enlace vence en 7 días.</p>${button(link, 'Crear mi contraseña')}`;
  return {
    to, subject: `${from} te invitó a ${company} en ${env.APP_NAME}`,
    html: layout(env, `Te invitaron a ${company}`, inner, 'Si no esperabas esta invitación, puedes ignorar este correo.'),
    text: `${from} te agregó al equipo de ${company} en ${env.APP_NAME}. Entra aquí (vence en 7 días): ${link}`,
  };
}

export interface DigestGroup { label: string; tone: 'danger' | 'warn' | 'plain'; items: Occurrence[] }

export function digestMail(env: Env, to: string, subject: string, title: string, groups: DigestGroup[], why: string): Mail {
  const color = { danger: C.danger, warn: C.warn, plain: C.ink2 };
  const blocks = groups.filter((g) => g.items.length).map((g) => `
    <p style="margin:16px 0 4px;font-size:13px;font-weight:700;color:${color[g.tone]}">${escapeHtml(g.label)}</p>
    ${g.items.map((o) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line}"><tr>
      <td style="padding:10px 0;font-size:15px;line-height:1.35"><strong style="font-weight:600">${escapeHtml(o.obligation.title)}</strong><br><span style="font-size:13px;color:${C.ink2}">${escapeHtml(o.project.shortName)}${o.obligation.recipient !== 'Interno' ? ` · a ${escapeHtml(o.obligation.recipient)}` : ''}</span></td>
      <td align="right" style="padding:10px 0;font-size:13px;font-weight:600;white-space:nowrap;color:${color[g.tone]}">${fmt(o.due)}</td></tr></table>`).join('')}`).join('');
  const text = groups.filter((g) => g.items.length).map((g) => `${g.label}\n${g.items.map((o) => `- ${o.obligation.title} (${o.project.shortName}) · ${fmt(o.due)}`).join('\n')}`).join('\n\n');
  return {
    to, subject,
    html: layout(env, title, `${blocks}<div style="margin-top:22px">${button(env.APP_URL, 'Abrir Vigía')}</div>`, `${escapeHtml(why)} Puedes cambiar los avisos en Ajustes.`),
    text: `${title}\n\n${text}\n\nAbrir: ${env.APP_URL}`,
  };
}
