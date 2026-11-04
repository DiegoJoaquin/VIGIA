// Extracción de compromisos desde el texto de una RCA.
// El mismo prompt lo usan el Worker (Workers AI) y el extractor local (Ollama).
// La IA propone; una persona confirma. Todo lo extraído entra con confirmed=false.

import type { Component, Frequency, FrequencyKind, Obligation, Recipient } from './types';

export const EXTRACTION_PROMPT = `Eres un ingeniero ambiental chileno que revisa una Resolución de Calificación Ambiental (RCA).
Tu tarea: listar CADA obligación que el titular debe cumplir durante la operación del proyecto.

Incluye: monitoreos y su frecuencia, reportes o informes a autoridades (SMA, DOH, SEREMI, SEA, CMN),
registros que se deben llevar, mantenciones periódicas, plazos únicos, límites permanentes y obligaciones
que se activan si ocurre un evento (contingencias, hallazgos, cambios de titular).

Reglas:
- Usa SOLO lo que dice el texto. Si no hay frecuencia explícita, usa "continuous" si es un límite o condición, o "event" si depende de que algo ocurra.
- "quote" debe ser una frase COPIADA EXACTAMENTE del texto (máximo 220 caracteres). Si no puedes copiarla exacta, deja "".
- "section" es el número o título de la sección donde aparece (ej. "4.3.2 Fase de Operación").
- No inventes parámetros, plazos ni destinatarios.
- Los registros diarios se informan como frecuencia "weekly" (se respaldan cada semana).

Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"obligations":[{
  "title": "nombre corto en español, máximo 60 caracteres",
  "plain": "qué hay que hacer, en una frase simple",
  "component": "Agua|Aire|Ruido|Residuos|Suelo y cauce|Olores|Biodiversidad|Patrimonio|Administrativo",
  "recipient": "SMA|DOH|SEA|SEREMI de Salud|CMN|Interno",
  "frequency": "weekly|monthly|bimonthly|quarterly|semiannual|annual|once|event|continuous",
  "due_month": null,
  "lag_months": null,
  "hours_after_event": null,
  "quote": "",
  "section": "",
  "evidence": "qué documento prueba el cumplimiento",
  "details": []
}]}`;

const COMPONENTS: Component[] = ['Aire', 'Agua', 'Ruido', 'Residuos', 'Suelo y cauce', 'Olores', 'Biodiversidad', 'Patrimonio', 'Administrativo'];
const RECIPIENTS: Recipient[] = ['SMA', 'DOH', 'SEA', 'SEREMI de Salud', 'CMN', 'Interno'];
const KINDS: FrequencyKind[] = ['weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'once', 'event', 'continuous'];

/** Divide el texto de la RCA en trozos que caben en el contexto del modelo, cortando en límites de párrafo. */
export function chunkText(text: string, max = 12_000): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const paras = clean.split(/\n\n/);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > max && cur) { out.push(cur); cur = ''; }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); continue; }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Saca el primer objeto JSON de una respuesta de modelo, aunque venga con texto alrededor. */
export function parseModelJson(raw: string): { obligations?: unknown[] } {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return {}; }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Convierte la salida del modelo en compromisos válidos.
 * Descarta citas que no aparecen en el documento (la IA a veces las parafrasea).
 */
export function normalizeObligations(items: unknown[], projectId: string, sourceText: string): Obligation[] {
  const haystack = norm(sourceText);
  const seen = new Set<string>();
  const out: Obligation[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = String(r.title ?? '').trim().slice(0, 80);
    if (!title) continue;
    const key = norm(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = KINDS.includes(r.frequency as FrequencyKind) ? (r.frequency as FrequencyKind) : 'continuous';
    const frequency: Frequency = { kind };
    const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && v >= lo && v <= hi ? Math.round(v) : undefined);
    frequency.dueMonth = num(r.due_month, 1, 12);
    frequency.lagMonths = num(r.lag_months, 1, 12);
    if (kind === 'event') frequency.hoursAfterEvent = num(r.hours_after_event, 1, 720) ?? 24;
    let quote = String(r.quote ?? '').trim();
    if (quote && !haystack.includes(norm(quote))) quote = '';
    out.push({
      id: `${projectId}-${out.length + 1}-${key.replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      projectId,
      title,
      plain: String(r.plain ?? title).trim(),
      component: COMPONENTS.includes(r.component as Component) ? (r.component as Component) : 'Administrativo',
      recipient: RECIPIENTS.includes(r.recipient as Recipient) ? (r.recipient as Recipient) : 'Interno',
      frequency,
      quote: quote || undefined,
      section: String(r.section ?? '').trim() || undefined,
      evidence: String(r.evidence ?? 'Registro del cumplimiento').trim(),
      details: Array.isArray(r.details) ? r.details.map(String).slice(0, 12) : undefined,
      confirmed: false,
      source: 'rca',
    });
  }
  return out;
}

/** Intenta leer los datos de la portada de la RCA (nombre, titular, comuna). */
export function guessProjectMeta(text: string): { name?: string; titular?: string; comuna?: string } {
  const pick = (re: RegExp) => text.match(re)?.[1]?.replace(/\s+/g, ' ').trim();
  return {
    name: pick(/proyecto\s+[“"«]([^”"»]{8,160})[”"»]/i),
    titular: pick(/titular[^,\n]{0,40}?,?\s+([A-ZÁÉÍÓÚÑ][^,\n]{3,80}?(?:S\.A\.|SpA|Ltda\.|Limitada|S\.A))/),
    comuna: pick(/comuna\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/),
  };
}

/**
 * Cuando el documento tiene más trozos de los que se pueden leer, elige los que concentran obligaciones.
 * Las RCA nuevas ponen los compromisos al final (condiciones, compromisos voluntarios, seguimiento),
 * y las antiguas los mezclan con la descripción del proyecto: por eso se puntúa cada trozo en vez de
 * leer solo los primeros. Los trozos elegidos se devuelven en su orden original.
 */
export function selectChunks(chunks: string[], max: number): string[] {
  if (chunks.length <= max) return chunks;
  const MUST = /condiciones o exigencias|compromisos? ambientales? voluntarios?|plan de seguimiento|seguimiento de las variables|medidas de (mitigaci[oó]n|reparaci[oó]n|compensaci[oó]n)|superintendencia del medio ambiente/i;
  const WORDS = /monitoreo|informe|reporte|registro|mensual|trimestral|semestral|anual|semanal|diari[oa]|plazo|d[ií]as h[aá]biles|deber[aá]|remitir|compromiso|fiscalizaci[oó]n|SMA\b/gi;
  const scored = chunks.map((c, i) => ({ i, score: (c.match(WORDS)?.length ?? 0) / (c.length / 1000) + (MUST.test(c) ? 100 : 0) }));
  const keep = new Set(scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.i));
  return chunks.filter((_, i) => keep.has(i));
}
