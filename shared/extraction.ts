// Extracción de compromisos desde el texto de una RCA.
// El mismo prompt lo usan el Worker (Workers AI) y el extractor local (Ollama).
// La IA propone; una persona confirma. Todo lo extraído entra con confirmed=false.

import type { Component, Frequency, FrequencyKind, Obligation, Recipient } from './types';

export const EXTRACTION_PROMPT = `Eres un ingeniero ambiental chileno que revisa una Resolución de Calificación Ambiental (RCA) o una resolución que la modifica.
Tu tarea: listar SOLO las obligaciones que el titular DEBE cumplir y que se pueden fiscalizar.

Dónde están en una RCA moderna:
- "Condiciones o exigencias" (considerando 8° o similar): exigencias de los servicios (CMN, SEREMI, SAG...).
- "Compromisos ambientales voluntarios": cada uno tiene "Lugar, forma y oportunidad", "Indicador que acredite su cumplimiento" y "Forma de control y seguimiento". De ahí salen informes, monitoreos, charlas, registros y sus plazos.
- "Plan de seguimiento de las variables ambientales" y "Medidas de mitigación, reparación o compensación".
- Considerandos finales: avisos a la SMA (inicio de obras, inicio de fases, impactos no previstos).
En RCA antiguas también aparecen dentro de la descripción del proyecto con frases como "se realizará un monitoreo trimestral", "se informará anualmente a la SMA".

NO incluyas:
- La descripción del proyecto (viviendas, estacionamientos, áreas verdes, redes de agua o electricidad) si no dice que hay que hacer, medir o informar algo.
- Listas de normas aplicables, permisos sectoriales, ni la lista de contingencias del plan de emergencias.
- Nada que no esté escrito en el texto. Si en este trozo no hay obligaciones, responde {"obligations":[]}.

Reglas:
- Un compromiso con varias acciones distintas (por ejemplo, monitoreo diario + informe mensual a la SMA) se separa en obligaciones distintas.
- "frequency": weekly (registros diarios o semanales, se respaldan cada semana), monthly, bimonthly, quarterly, semiannual, annual, once (una sola vez), event (cada vez que ocurre algo: charlas al ingresar personal, hallazgos, avisos), continuous (condición permanente sin fecha: límites de velocidad, monitoreo permanente en obra).
- "N días hábiles luego de terminado el mes": frequency monthly, lag_months 1, due_day 21 (15 días hábiles ≈ día 21).
- "quote": frase COPIADA EXACTAMENTE del texto, palabra por palabra (máximo 200 caracteres). Es obligatoria: si no puedes citar, no incluyas la obligación.
- "section": número del considerando o compromiso (ej. "9.3 Compromiso voluntario 3").
- No inventes parámetros, plazos ni destinatarios.

Responde SOLO con JSON válido, sin texto adicional:
{"obligations":[{
  "title": "nombre corto en español, máximo 60 caracteres",
  "plain": "qué hay que hacer, en una frase simple",
  "component": "Agua|Aire|Ruido|Residuos|Suelo y cauce|Olores|Biodiversidad|Patrimonio|Administrativo",
  "recipient": "SMA|DOH|SEA|SEREMI de Salud|CMN|Interno",
  "frequency": "weekly|monthly|bimonthly|quarterly|semiannual|annual|once|event|continuous",
  "due_day": null,
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
/**
 * Lee la respuesta del modelo. Algunos modelos de Workers AI devuelven el JSON ya convertido en objeto;
 * otros devuelven texto, a veces cortado si la lista es larga. En ese caso se rescatan los compromisos completos.
 */
export function parseModelJson(raw: unknown): { obligations?: unknown[] } {
  if (raw && typeof raw === 'object') {
    const o = raw as { obligations?: unknown };
    return Array.isArray(o.obligations) ? { obligations: o.obligations } : Array.isArray(raw) ? { obligations: raw as unknown[] } : {};
  }
  if (typeof raw !== 'string') return {};
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return parseModelJson(JSON.parse(raw.slice(start, end + 1))); } catch { /* respuesta cortada: se rescata abajo */ }
  }
  const list = raw.indexOf('[', raw.indexOf('"obligations"'));
  if (list < 0) return {};
  const items: unknown[] = [];
  let depth = 0, from = -1, inStr = false, esc = false;
  for (let i = list + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth++ === 0) from = i; }
    else if (ch === '}' && depth > 0 && --depth === 0) { try { items.push(JSON.parse(raw.slice(from, i + 1))); } catch { /* objeto incompleto */ } }
  }
  return { obligations: items };
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
    frequency.dueDay = num(r.due_day, 1, 31);
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


// Marcadores de la plantilla actual del SEA: desde aquí hasta "RESUELVO" están casi todas las obligaciones.
const FOCUS_START = /que,?\s+para\s+ejecutar\s+el\s+proyecto\s+deben\s+cumplirse|condiciones\s+o\s+exigencias|compromisos?\s+ambientales?\s+voluntarios?|plan\s+de\s+seguimiento\s+de\s+las\s+variables|medidas\s+de\s+mitigaci[oó]n,?\s+reparaci[oó]n/i;

/**
 * Elige qué trozos del documento leer. En las RCA con la plantilla actual, primero la parte de
 * condiciones, compromisos y seguimiento (hasta "RESUELVO"); el resto de los cupos se llena con los
 * trozos de la descripción que más hablan de monitoreos, informes y plazos.
 */
export function pickChunks(text: string, max = 8, size = 10_000): { chunks: string[]; total: number; focused: boolean } {
  const all = chunkText(text, size);
  const m = FOCUS_START.exec(text);
  const end = text.search(/\n\s*RESUELVO\s*:?/);
  if (!m || m.index < text.length * 0.2) return { chunks: selectChunks(all, max), total: all.length, focused: false };
  const focus = chunkText(text.slice(Math.max(0, m.index - 300), end > m.index ? end + 2000 : undefined), size);
  if (focus.length >= max) return { chunks: focus.slice(0, max), total: all.length, focused: true };
  const before = chunkText(text.slice(0, m.index), size);
  return { chunks: [...selectChunks(before, max - focus.length), ...focus], total: all.length, focused: true };
}

/** Obligaciones estándar de toda RCA actual, encontradas por su texto exacto (sin IA). */
const STANDARD: { re: RegExp; title: string; plain: string; recipient: Obligation['recipient']; frequency: Frequency; evidence: string }[] = [
  { re: /informar\s+a\s+la\s+Superintendencia\s+del\s+Medio\s+Ambiente\s+la\s+realizaci[oó]n\s+de\s+la\s+gesti[oó]n,?\s+acto\s+o\s+faena\s+m[ií]nima[^.]{0,160}/i,
    title: 'Avisar a la SMA el inicio de la ejecución', plain: 'Informar a la SMA cuando se realice la gestión, acto o faena mínima que marca el inicio de las obras.', recipient: 'SMA', frequency: { kind: 'event', hoursAfterEvent: 24 }, evidence: 'Comprobante de aviso a la SMA' },
  { re: /informar\s+a\s+la\s+Superintendencia\s+del\s+Medio\s+Ambiente,?\s+al\s+menos\s+con\s+una\s+semana\s+de\s+anticipaci[oó]n,?\s+el\s+inicio\s+de\s+cada\s+una\s+de\s+las\s+fases[^.]{0,120}/i,
    title: 'Avisar a la SMA el inicio de cada fase', plain: 'Informar a la SMA, al menos una semana antes, el inicio de cada fase del proyecto (construcción, operación, cierre).', recipient: 'SMA', frequency: { kind: 'event', hoursAfterEvent: 168 }, evidence: 'Comprobante de aviso a la SMA' },
  { re: /informar\s+inmediatamente\s+a\s+la\s+Secretar[ií]a\s+de\s+la\s+Comisi[oó]n\s+de\s+Evaluaci[oó]n[^.]{0,200}impactos\s+ambientales\s+no\s+previstos[^.]{0,120}/i,
    title: 'Avisar impactos ambientales no previstos', plain: 'Si ocurre un impacto ambiental no previsto, avisar de inmediato al SEA y a la SMA y tomar las acciones necesarias.', recipient: 'SMA', frequency: { kind: 'event', hoursAfterEvent: 24 }, evidence: 'Carta al SEA y a la SMA' },
  { re: /comunicar\s+inmediatamente\s+y\s+por\s+escrito\s+a\s+la\s+Direcci[oó]n\s+Regional[^.]{0,200}cambios\s+de\s+titularidad[^.]{0,160}/i,
    title: 'Avisar cambios de titular o de contacto', plain: 'Si cambia el titular, el representante legal, el domicilio o el correo, comunicarlo por escrito al SEA.', recipient: 'SEA', frequency: { kind: 'event', hoursAfterEvent: 24 }, evidence: 'Carta al SEA' },
];

export function standardObligations(text: string, projectId: string): Obligation[] {
  return STANDARD.flatMap((s, i) => {
    const m = s.re.exec(text);
    if (!m) return [];
    const quote = m[0].replace(/\s+/g, ' ').trim().slice(0, 200);
    return [{ id: `${projectId}-std-${i + 1}`, projectId, title: s.title, plain: s.plain, component: 'Administrativo' as const, recipient: s.recipient,
      frequency: s.frequency, quote, section: 'Considerandos finales', evidence: s.evidence, confirmed: false, source: 'rca' as const }];
  });
}

/** Con un modelo que inventa, lo que no se puede citar se descarta si hay suficientes obligaciones citadas. */
export function dropUnquoted(obs: Obligation[]): Obligation[] {
  const quoted = obs.filter((o) => o.quote);
  return quoted.length >= 3 ? quoted : obs;
}
