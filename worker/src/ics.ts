// Calendario suscribible (.ics). Funciona en iPhone, Google Calendar y Outlook sin costo.
import { addDays, buildOccurrences, frequencyLabel } from '../../shared/recurrence';
import type { OrgData } from './repo';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// Las líneas de un .ics no deben superar 75 octetos: se pliegan con un espacio al inicio.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(data: OrgData, today: string, appUrl: string, appName: string): string {
  const occ = buildOccurrences({
    projects: data.projects, obligations: data.obligations.filter((o) => o.confirmed),
    completions: data.completions, events: data.events, today,
    from: addDays(today, -60), to: addDays(today, 400),
  });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${appName}//Compromisos RCA//ES`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(appName)} · compromisos ambientales`, 'X-WR-TIMEZONE:America/Santiago', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
  ];
  for (const o of occ) {
    const d = o.due.replace(/-/g, '');
    const next = addDays(o.due, 1).replace(/-/g, '');
    const done = o.status === 'done';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${o.key.replace(/[^a-zA-Z0-9-]/g, '-')}@vigia`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(`${done ? '✓ ' : ''}${o.obligation.title} · ${o.project.shortName}`)}`,
      `DESCRIPTION:${esc(`${o.obligation.plain}\n\n${frequencyLabel(o.obligation.frequency)}${o.obligation.recipient !== 'Interno' ? ` · se entrega a ${o.obligation.recipient}` : ''}\nPrueba: ${o.obligation.evidence}\n\n${appUrl}`)}`,
      `URL:${appUrl}`,
      'TRANSP:TRANSPARENT',
    );
    if (!done) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(o.obligation.title)}`, 'TRIGGER:-P3D', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
