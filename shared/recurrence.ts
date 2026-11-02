// Motor de fechas: convierte la frecuencia de cada compromiso en fechas concretas.
// Trabaja con fechas ISO (yyyy-mm-dd) en UTC para no depender de la zona horaria.

import type {
  Completion, EventLog, Frequency, Obligation, Occurrence, OccurrenceStatus, Project,
} from './types';

const DAY = 86_400_000;

export function toUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return toISO(toUTC(iso) + n * DAY);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUTC(toIso) - toUTC(fromIso)) / DAY);
}

export function lastDayOfMonth(y: number, m: number): number {
  // m: 1-12
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Fecha de hoy en Chile continental (America/Santiago), como ISO. */
export function todayInChile(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA entrega yyyy-mm-dd
}

function ym(y: number, m: number, add: number): [number, number] {
  const total = y * 12 + (m - 1) + add;
  return [Math.floor(total / 12), (total % 12) + 1];
}

function dueIn(y: number, m: number, f: Frequency): string {
  const [yy, mm] = ym(y, m, f.lagMonths ?? 0);
  const last = lastDayOfMonth(yy, mm);
  const day = Math.min(f.dueDay ?? last, last);
  return `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Meses del ciclo (1-12) en que cierra cada período, según la frecuencia. */
function cycleMonths(f: Frequency): number[] {
  switch (f.kind) {
    case 'monthly': return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case 'bimonthly': { const s = f.dueMonth ?? 2; return [0, 2, 4, 6, 8, 10].map((o) => ((s - 1 + o) % 12) + 1); }
    case 'quarterly': { const s = f.dueMonth ?? 3; return [0, 3, 6, 9].map((o) => ((s - 1 + o) % 12) + 1); }
    case 'semiannual': { const s = f.dueMonth ?? 6; return [0, 6].map((o) => ((s - 1 + o) % 12) + 1); }
    case 'annual': return [f.dueMonth ?? 12];
    default: return [];
  }
}

/** Todas las fechas de vencimiento de un compromiso entre `from` y `to` (inclusive). */
export function dueDates(ob: Obligation, project: Project, from: string, to: string): string[] {
  const f = ob.frequency;
  const start = project.trackingStart > from ? project.trackingStart : from;
  // El compromiso deja de generar fechas cuando termina la operación (más el desfase de reporte).
  let end = to;
  if (project.operationEnd) {
    const hardEnd = f.lagMonths ? dueIn(Number(project.operationEnd.slice(0, 4)), Number(project.operationEnd.slice(5, 7)), f) : project.operationEnd;
    if (hardEnd < end) end = hardEnd;
  }
  if (start > end) return [];
  const out: string[] = [];

  if (f.kind === 'once') {
    if (f.date && f.date >= from && f.date <= to) out.push(f.date);
    return out;
  }
  if (f.kind === 'event' || f.kind === 'continuous') return out;

  if (f.kind === 'weekly') {
    const wd = f.weekday ?? 0;
    let cursor = toUTC(start);
    const shift = (wd - new Date(cursor).getUTCDay() + 7) % 7;
    cursor += shift * DAY;
    const endMs = toUTC(end);
    while (cursor <= endMs) { out.push(toISO(cursor)); cursor += 7 * DAY; }
    return out;
  }

  const months = cycleMonths(f);
  // Recorremos períodos desde un poco antes del inicio para capturar reportes con desfase.
  const lag = f.lagMonths ?? 0;
  let [y, m] = ym(Number(start.slice(0, 4)), Number(start.slice(5, 7)), -lag - 1);
  const [ey, em] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];
  while (y * 12 + m <= ey * 12 + em) {
    if (months.includes(m)) {
      const due = dueIn(y, m, f);
      if (due >= start && due <= end) out.push(due);
    }
    [y, m] = ym(y, m, 1);
  }
  return out;
}

export function statusFor(due: string, today: string, done: boolean): OccurrenceStatus {
  if (done) return 'done';
  const d = daysBetween(today, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'soon';
  return 'upcoming';
}

export interface BuildInput {
  projects: Project[];
  obligations: Obligation[];
  completions: Completion[];
  events?: EventLog[];
  today: string;
  from: string;
  to: string;
}

/** Arma la lista de ocurrencias de todos los proyectos en una ventana de fechas. */
export function buildOccurrences(input: BuildInput): Occurrence[] {
  const byProject = new Map(input.projects.map((p) => [p.id, p]));
  const doneMap = new Map(input.completions.map((c) => [`${c.obligationId}|${c.due}`, c]));
  const out: Occurrence[] = [];

  for (const ob of input.obligations) {
    const project = byProject.get(ob.projectId);
    if (!project) continue;
    for (const due of dueDates(ob, project, input.from, input.to)) {
      const key = `${ob.id}|${due}`;
      const completion = doneMap.get(key);
      out.push({
        key, obligation: ob, project, due, completion,
        status: statusFor(due, input.today, !!completion),
        daysLeft: daysBetween(input.today, due),
      });
    }
  }

  // Eventos registrados: generan una ocurrencia con plazo en horas.
  for (const ev of input.events ?? []) {
    const ob = input.obligations.find((o) => o.id === ev.obligationId);
    const project = ob && byProject.get(ob.projectId);
    if (!ob || !project) continue;
    const hours = ob.frequency.hoursAfterEvent ?? 24;
    const dueMs = Date.parse(ev.occurredAt) + hours * 3_600_000;
    const due = toISO(dueMs);
    const key = `${ob.id}|${due}`;
    const completion = doneMap.get(key);
    out.push({
      key, obligation: ob, project, due, completion, eventAt: ev.occurredAt,
      status: statusFor(due, input.today, !!completion),
      daysLeft: daysBetween(input.today, due),
    });
  }

  return out.sort((a, b) => (a.due === b.due ? a.obligation.title.localeCompare(b.obligation.title) : a.due < b.due ? -1 : 1));
}

/**
 * Porcentaje de cumplimiento a tiempo en los últimos `days` días:
 * ocurrencias vencidas o cumplidas, cumplidas en o antes de su fecha.
 */
export function onTimeRate(occ: Occurrence[], today: string, days = 365): { rate: number; due: number; onTime: number } {
  const since = addDays(today, -days);
  const past = occ.filter((o) => o.due >= since && o.due <= today);
  const onTime = past.filter((o) => o.completion && o.completion.completedAt.slice(0, 10) <= o.due).length;
  return { rate: past.length ? onTime / past.length : 1, due: past.length, onTime };
}

/** Texto corto para la frecuencia, en español de Chile. */
export function frequencyLabel(f: Frequency): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  switch (f.kind) {
    case 'weekly': return 'Cada semana';
    case 'monthly': return f.lagMonths ? 'Mensual, del mes anterior' : 'Mensual';
    case 'bimonthly': return 'Cada dos meses';
    case 'quarterly': return 'Trimestral';
    case 'semiannual': return 'Semestral';
    case 'annual': return `Anual, en ${months[(f.dueMonth ?? 12) - 1]}`;
    case 'once': return 'Una vez';
    case 'event': return f.hoursAfterEvent ? `Si ocurre, en ${f.hoursAfterEvent} h` : 'Si ocurre';
    case 'continuous': return 'Permanente';
  }
}
