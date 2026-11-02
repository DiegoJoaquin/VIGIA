import { toUTC } from '../../shared/recurrence';
import type { Occurrence } from '../../shared/types';

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MON_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

function parts(iso: string) {
  const d = new Date(toUTC(iso));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
}

/** "Lunes 2 de noviembre" */
export function longDate(iso: string): string {
  const p = parts(iso);
  const s = `${DOW[p.w]} ${p.d} de ${MONTHS[p.m]}`;
  return s[0].toUpperCase() + s.slice(1);
}

/** "lun 2 nov" o "2 nov 2027" si no es este año */
export function shortDate(iso: string, today?: string): string {
  const p = parts(iso);
  const sameYear = !today || Number(today.slice(0, 4)) === p.y;
  return sameYear ? `${DOW_SHORT[p.w]} ${p.d} ${MON_SHORT[p.m]}` : `${p.d} ${MON_SHORT[p.m]} ${p.y}`;
}

export function dayMonth(iso: string): string {
  const p = parts(iso);
  return `${p.d} ${MON_SHORT[p.m]}`;
}

export function monthYear(y: number, m: number): string {
  const s = `${MONTHS[m]} ${y}`;
  return s[0].toUpperCase() + s.slice(1);
}

/** Tiempo relativo para una ocurrencia: "vence hoy", "en 3 días", "hace 2 días". */
export function relative(o: Occurrence): string {
  if (o.completion) return `Cumplido el ${dayMonth(o.completion.completedAt.slice(0, 10))}`;
  const n = o.daysLeft;
  if (n === 0) return 'Vence hoy';
  if (n === 1) return 'Vence mañana';
  if (n === -1) return 'Venció ayer';
  if (n < 0) return `Venció hace ${-n} días`;
  if (n < 14) return `En ${n} días`;
  if (n < 60) return `En ${Math.round(n / 7)} semanas`;
  return `En ${Math.round(n / 30)} meses`;
}

export function fileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
