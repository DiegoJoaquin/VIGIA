/**
 * Aprendizaje con las correcciones de las personas.
 *
 * Cada vez que alguien revisa una lectura automática y quita, corrige o agrega un compromiso,
 * esa decisión se guarda asociada a la frase de la RCA (no a la empresa). La próxima vez que
 * cualquier RCA traiga la misma frase —pasa mucho: las consultoras y el SEA repiten redacciones—
 * Vigía aplica la corrección por adelantado y la marca para que la persona la vea.
 *
 * Las RCA son documentos públicos: lo único que se comparte entre empresas es "esta frase pública
 * significa tal frecuencia", nunca datos de la empresa, sus fechas ni su evidencia.
 */
import type { Component, FrequencyKind, Obligation, Recipient } from './types';

export type FeedbackAction = 'kept' | 'removed' | 'edited' | 'added';

export interface FeedbackItem {
  action: FeedbackAction;
  quoteKey: string;
  quote: string;
  section?: string;
  /** Lo que propuso la lectura (vacío si la persona lo agregó). */
  before?: Pick<Obligation, 'title' | 'frequency' | 'recipient' | 'component'>;
  /** Cómo quedó después de la revisión (vacío si lo quitó). */
  after?: Pick<Obligation, 'title' | 'frequency' | 'recipient' | 'component'>;
}

/** Huella de una cita: igual aunque cambien tildes, mayúsculas, espacios o saltos de línea del PDF. */
export function quoteKey(quote?: string): string {
  return (quote ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160);
}

const pick = (o: Obligation) => ({ title: o.title, frequency: o.frequency, recipient: o.recipient, component: o.component });

/** Compara lo propuesto con lo guardado y devuelve qué hizo la persona con cada compromiso. */
export function diffReview(proposed: Obligation[], final: Obligation[], keep: string[]): FeedbackItem[] {
  const out: FeedbackItem[] = [];
  const byId = new Map(final.map((o) => [o.id, o]));
  for (const p of proposed) {
    if (!p.quote) continue; // sin cita no hay frase de la cual aprender
    const f = byId.get(p.id);
    const base = { quoteKey: quoteKey(p.quote), quote: p.quote.slice(0, 400), section: p.section };
    if (!f || !keep.includes(p.id)) { out.push({ ...base, action: 'removed', before: pick(p) }); continue; }
    const changed = f.title !== p.title || f.frequency.kind !== p.frequency.kind || f.recipient !== p.recipient || f.component !== p.component;
    out.push({ ...base, action: changed ? 'edited' : 'kept', before: pick(p), after: pick(f) });
  }
  const proposedIds = new Set(proposed.map((p) => p.id));
  for (const f of final) {
    if (proposedIds.has(f.id) || !keep.includes(f.id) || !f.quote) continue;
    out.push({ action: 'added', quoteKey: quoteKey(f.quote), quote: f.quote.slice(0, 400), section: f.section, after: pick(f) });
  }
  return out.filter((x) => x.quoteKey.length >= 20);
}

/** Lo aprendido de una frase, resumido de todas las revisiones que la tocaron. */
export interface Memory {
  quoteKey: string;
  quote: string;
  section?: string;
  removed: number;
  kept: number;
  /** La corrección más repetida, si la hay. */
  correction?: { title: string; kind: FrequencyKind; recipient: Recipient; component: Component; votes: number };
  added: number;
}

/** Junta las filas de retroalimentación de una misma frase en una memoria. */
export function summarize(items: FeedbackItem[]): Memory[] {
  const by = new Map<string, FeedbackItem[]>();
  for (const it of items) by.set(it.quoteKey, [...(by.get(it.quoteKey) ?? []), it]);
  return [...by.entries()].map(([k, list]) => {
    const votes = new Map<string, { n: number; a: NonNullable<FeedbackItem['after']> }>();
    for (const it of list) if ((it.action === 'edited' || it.action === 'added') && it.after) {
      const key = `${it.after.frequency.kind}|${it.after.recipient}|${it.after.title}`;
      votes.set(key, { n: (votes.get(key)?.n ?? 0) + 1, a: it.after });
    }
    const best = [...votes.values()].sort((a, b) => b.n - a.n)[0];
    return {
      quoteKey: k, quote: list[0].quote, section: list.find((x) => x.section)?.section,
      removed: list.filter((x) => x.action === 'removed').length,
      kept: list.filter((x) => x.action === 'kept').length,
      added: list.filter((x) => x.action === 'added').length,
      correction: best && { title: best.a.title, kind: best.a.frequency.kind, recipient: best.a.recipient, component: best.a.component, votes: best.n },
    };
  });
}

/**
 * Aplica lo aprendido a una lectura nueva:
 * - una frase que las personas quitan más de lo que dejan llega desmarcada (learned: 'removed');
 * - una frase que corrigieron llega ya corregida (learned: 'edited');
 * - un compromiso que alguien agregó a mano aparece si su frase está en esta RCA (learned: 'added').
 */
export function applyMemory(found: Obligation[], memories: Memory[], text: string, projectId: string): Obligation[] {
  const mem = new Map(memories.map((m) => [m.quoteKey, m]));
  const out = found.map((o) => {
    const m = mem.get(quoteKey(o.quote));
    if (!m) return o;
    if (m.removed > m.kept + (m.correction?.votes ?? 0)) return { ...o, learned: 'removed' as const };
    if (m.correction && m.correction.votes >= m.kept) {
      const c = m.correction;
      return { ...o, title: c.title, frequency: { ...o.frequency, kind: c.kind }, recipient: c.recipient, component: c.component, learned: 'edited' as const };
    }
    return o;
  });
  const present = new Set(out.map((o) => quoteKey(o.quote)));
  const flat = quoteKey(text).length ? ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')} ` : '';
  let n = 0;
  for (const m of memories) {
    if (!m.added || !m.correction || present.has(m.quoteKey) || !flat.includes(` ${m.quoteKey} `)) continue;
    const c = m.correction;
    out.push({
      id: `${projectId}-m${++n}`, projectId, title: c.title, plain: m.quote.slice(0, 240), component: c.component, recipient: c.recipient,
      frequency: { kind: c.kind, ...(c.kind === 'event' ? { hoursAfterEvent: 24 } : {}) }, quote: m.quote, section: m.section,
      evidence: c.recipient === 'Interno' ? 'Registro fechado con fotos' : 'Informe y comprobante de envío',
      confirmed: false, source: 'rca', learned: 'added',
    });
  }
  return out;
}
