/**
 * Validación de lo que llega desde fuera (la app, el extractor local, una planilla): solo se guarda
 * lo que tiene la forma del modelo, con largos acotados. Así un cliente modificado no puede guardar
 * campos extra, textos gigantes ni enlaces peligrosos.
 */
import type { Component, Frequency, FrequencyKind, Obligation, Project, Recipient } from './types';

const KINDS: FrequencyKind[] = ['weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'once', 'event', 'continuous'];
const COMPONENTS: Component[] = ['Aire', 'Agua', 'Ruido', 'Residuos', 'Suelo y cauce', 'Olores', 'Biodiversidad', 'Patrimonio', 'Administrativo', 'Ventanilla Única'];
const RECIPIENTS: Recipient[] = ['SMA', 'DOH', 'SEA', 'SEREMI de Salud', 'Ventanilla Única', 'CMN', 'Interno'];
const RUBROS = ['Áridos', 'Vitivinícola', 'Agroindustria', 'Plantel', 'Industria', 'Otro'] as const;
const PHASES = ['Construcción', 'Operación', 'Cierre'] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list as readonly unknown[]).includes(v) ? (v as T) : undefined;
const isoDate = (v: unknown): string | undefined => (typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);

/** Solo enlaces https. Evita `javascript:` y similares en cualquier href que se arme con datos guardados. */
export function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  try { const u = new URL(v.trim()); return u.protocol === 'https:' && v.length <= 600 ? u.toString() : ''; } catch { return ''; }
}

export function cleanFrequency(f: unknown): Frequency | null {
  if (!f || typeof f !== 'object') return null;
  const x = f as Record<string, unknown>;
  const kind = oneOf(x.kind, KINDS);
  if (!kind) return null;
  const out: Frequency = { kind };
  const dueDay = int(x.dueDay, 1, 31), dueMonth = int(x.dueMonth, 1, 12), lag = int(x.lagMonths, 0, 24), hours = int(x.hoursAfterEvent, 0, 24 * 365), wd = int(x.weekday, 0, 6);
  if (dueDay) out.dueDay = dueDay;
  if (dueMonth) out.dueMonth = dueMonth;
  if (lag !== undefined) out.lagMonths = lag;
  if (hours !== undefined) out.hoursAfterEvent = hours;
  if (wd !== undefined) out.weekday = wd;
  const date = isoDate(x.date);
  if (date) out.date = date;
  return out;
}

/** Devuelve el compromiso limpio, o null si no tiene lo mínimo (id, título y frecuencia válida). */
export function cleanObligation(o: unknown): Obligation | null {
  if (!o || typeof o !== 'object') return null;
  const x = o as Record<string, unknown>;
  const id = str(x.id, 120), title = str(x.title, 200), projectId = str(x.projectId, 120);
  const frequency = cleanFrequency(x.frequency);
  if (!id || !title || !projectId || !frequency) return null;
  const details = Array.isArray(x.details) ? x.details.slice(0, 20).map((d) => str(d, 100)).filter(Boolean) : undefined;
  return {
    id, projectId, title,
    plain: str(x.plain, 800) || title,
    component: oneOf(x.component, COMPONENTS) ?? 'Administrativo',
    recipient: oneOf(x.recipient, RECIPIENTS) ?? 'Interno',
    frequency,
    ...(str(x.quote, 800) ? { quote: str(x.quote, 800) } : {}),
    ...(str(x.section, 120) ? { section: str(x.section, 120) } : {}),
    evidence: str(x.evidence, 400) || 'Registro fechado con fotos',
    ...(details?.length ? { details } : {}),
    ...(str(x.responsible, 120) ? { responsible: str(x.responsible, 120) } : {}),
    confirmed: x.confirmed === true,
    source: x.source === 'ventanilla' ? 'ventanilla' : 'rca',
  };
}

export function cleanProject(p: unknown): Project | null {
  if (!p || typeof p !== 'object') return null;
  const x = p as Record<string, unknown>;
  const id = str(x.id, 120), name = str(x.name, 200);
  const trackingStart = isoDate(x.trackingStart);
  if (!id || !name || !trackingStart) return null;
  return {
    id, name, shortName: str(x.shortName, 60) || name.slice(0, 34),
    titular: str(x.titular, 200) || 'Titular por confirmar',
    rubro: oneOf(x.rubro, RUBROS) ?? 'Otro',
    comuna: str(x.comuna, 80) || 'Por confirmar', region: str(x.region, 80),
    instrument: x.instrument === 'EIA' ? 'EIA' : 'DIA',
    rcaLabel: str(x.rcaLabel, 120) || 'RCA importada',
    sourceUrl: safeUrl(x.sourceUrl) || str(x.sourceUrl, 160).replace(/^(?!archivo:|documento:).*/s, ''),
    phase: oneOf(x.phase, PHASES) ?? 'Operación',
    ...(isoDate(x.operationStart) ? { operationStart: isoDate(x.operationStart) } : {}),
    ...(isoDate(x.operationEnd) ? { operationEnd: isoDate(x.operationEnd) } : {}),
    trackingStart,
  };
}
