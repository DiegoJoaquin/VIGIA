// Lectura de una RCA desde la app, usando Workers AI (capa gratuita de Cloudflare).
// Para RCA largas o mejor calidad, usa el extractor local con Ollama (extractor/extract_rca.py).
import { getDocumentProxy } from 'unpdf';
import { EXTRACTION_PROMPT, dedupeObligations, dropUnquoted, mergeBySection, guessProjectMeta, normalizeObligations, parseModelJson, pickChunks, standardObligations } from '../../shared/extraction';
import { ruleObligations } from '../../shared/rules';
import { looksLikePdc, readPdc } from '../../shared/pdc';
import { applyMemory, quoteKey, summarize, type FeedbackItem, type Memory } from '../../shared/learning';
import type { Obligation, Project } from '../../shared/types';
import type { Env } from './env';
import { randomId } from './util';

// Modelo grande para leer bien (y citar textual); el chico solo si el grande falla.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fast';
const ALLOWED_HOSTS = ['firma.sea.gob.cl', 'infofirma.sea.gob.cl', 'seia.sea.gob.cl'];

/** Texto del PDF respetando los saltos de línea (los encabezados "9.3. Compromiso…" quedan en su propia línea). */
export async function pdfText(bytes: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    for (const it of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof it.str !== 'string') continue;
      out += it.str;
      if (it.hasEOL) out += '\n';
    }
    out += '\n\n';
  }
  return out;
}

export async function fetchRca(url: string, hops = 0): Promise<ArrayBuffer> {
  if (hops > 3) throw new Error('El enlace del SEA redirige demasiadas veces.');
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error('El enlace debe ser un documento del SEA (firma.sea.gob.cl).');
  const r = await fetch(u.toString(), { headers: { 'user-agent': 'Mozilla/5.0 Vigia' }, signal: AbortSignal.timeout(25_000), redirect: 'manual' })
    .catch(() => { throw new Error('El SEA no respondió a tiempo. Descarga el PDF de la RCA y usa "Subir PDF".'); });
  // Una redirección a otro sitio no se sigue: solo se aceptan documentos que el SEA entrega directamente.
  if (r.status >= 300 && r.status < 400) {
    const to = new URL(r.headers.get('location') ?? '', u);
    if (to.protocol !== 'https:' || !ALLOWED_HOSTS.includes(to.hostname)) throw new Error('El enlace redirige fuera del SEA. Descarga el PDF y usa "Subir PDF".');
    return fetchRca(to.toString(), hops + 1);
  }
  if (!r.ok) throw new Error(`El SEA respondió ${r.status} al descargar la RCA.`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 25_000_000) throw new Error('La RCA pesa más de 25 MB. Usa el extractor local.');
  return buf;
}

const KIND_HINT: Record<string, string> = {
  rca: 'El documento es una RCA o DIA aprobada.',
  resolucion: 'El documento es una resolución, adenda o pertinencia que modifica o aclara una RCA. Lista solo las obligaciones que este documento agrega o cambia.',
  programa: 'El documento es un Programa de Cumplimiento aprobado por la SMA. Lista cada acción comprometida con su plazo y los reportes de avance.',
};

/**
 * Lee un PDF y propone compromisos. Si se pasa un proyecto existente, los compromisos se agregan a ese
 * proyecto (por ejemplo, una resolución que modifica la RCA); si no, se arma un proyecto nuevo.
 */
export async function extractFromPdf(env: Env, bytes: ArrayBuffer, sourceUrl: string, opts: { project?: Project; kind?: string } = {}) {
  const text = await pdfText(bytes);
  if (text.replace(/\s/g, '').length < 2000) throw new Error('Este PDF es una imagen escaneada, sin texto que leer. Descarga desde el SEIA la versión firmada digitalmente de la resolución (firma.sea.gob.cl) y vuelve a intentarlo.');
  const projectId = opts.project?.id ?? `p-${randomId(6)}`;
  const hint = KIND_HINT[opts.kind ?? 'rca'] ?? KIND_HINT.rca;
  // 1) RCA con la plantilla actual del SEA: los compromisos se leen con reglas, sin IA. Es exacto, gratis e
  //    instantáneo, y cada uno sale con su cita textual.
  // Un programa de cumplimiento tiene otra estructura: lo lee su propio lector (plazos desde la notificación).
  const pdc = opts.kind === 'programa' || looksLikePdc(text) ? readPdc(text, projectId, new Date().toISOString().slice(0, 10)) : undefined;
  const byRules = pdc?.obligations.length ? pdc.obligations : ruleObligations(text, projectId);
  let found: Obligation[];
  if (pdc?.obligations.length) {
    found = byRules;
    console.log('[lectura]', JSON.stringify({ chars: text.length, metodo: 'pdc', formato: pdc.format, found: found.length }));
  } else if (byRules.length >= 3) {
    found = byRules;
    console.log('[lectura]', JSON.stringify({ chars: text.length, metodo: 'reglas', found: found.length }));
  } else {
    // 2) RCA antigua o con otro formato: la IA propone y se descarta lo que no se puede citar.
    if (!env.AI) throw new Error('Esta RCA no tiene el formato actual del SEA y la lectura con IA no está activada en este servidor.');
    // Los trozos se leen en paralelo (de a 4) y cada consulta tiene un tiempo máximo: así una RCA larga
    // tarda lo que tarda un trozo y no la suma de todos. Limitamos a 8 trozos por la capa gratuita diaria,
    // elegidos entre todos según dónde están las obligaciones (ver selectChunks).
    const { chunks, total, focused } = pickChunks(text, 8);
    const ask = async (chunk: string, model = MODEL): Promise<unknown[]> => {
      const run = env.AI!.run(model as Parameters<Ai['run']>[0], {
        messages: [{ role: 'system', content: EXTRACTION_PROMPT }, { role: 'user', content: `${hint}\n\n${chunk}` }],
        max_tokens: 4096, temperature: 0.1,
      } as never) as Promise<{ response?: unknown }>;
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), 60_000));
      try {
        const res = await Promise.race([run, timeout]);
        return parseModelJson(res.response ?? '').obligations ?? [];
      } catch (e) {
        if (model === FALLBACK) throw e;
        console.log('[lectura] modelo grande falló, uso el chico:', String((e as Error)?.message ?? e));
        return ask(chunk, FALLBACK);
      }
    };
    const items: unknown[] = [];
    let failed = 0, lastError = '';
    for (let i = 0; i < chunks.length; i += 4) {
      const results = await Promise.allSettled(chunks.slice(i, i + 4).map((c) => ask(c)));
      for (const r of results) {
        if (r.status === 'fulfilled') items.push(...r.value);
        else { failed++; lastError = String((r.reason as Error)?.message ?? r.reason); }
      }
    }
    console.log('[lectura]', JSON.stringify({ chars: text.length, chunks: `${chunks.length}/${total}`, focused, failed, found: items.length, lastError }));
    if (failed === chunks.length) throw new Error(`La IA no pudo leer el documento (${lastError}). Intenta de nuevo en unos minutos.`);
    found = mergeBySection(dedupeObligations(dropUnquoted(normalizeObligations(items, projectId, text))));
  }
  // 3) Lo aprendido de revisiones anteriores (de cualquier empresa, sobre frases públicas de RCA).
  found = applyMemory(found, await loadMemories(env, found), text, projectId);
  const batch = randomId(4); // los ids no chocan con compromisos ya cargados en el proyecto
  const std = pdc?.obligations.length ? [] : standardObligations(text, projectId).filter((s) => !found.some((f) => f.quote && s.quote && f.quote.slice(0, 40) === s.quote.slice(0, 40)));
  const obligations = [...found, ...std].map((o) => (opts.project ? { ...o, id: `${o.id}-${batch}` } : o));
  if (opts.project) return { project: opts.project, obligations };
  const meta = guessProjectMeta(text);
  const name = meta.name ?? 'Proyecto importado';
  const project: Project = {
    id: projectId, name, shortName: name.length > 34 ? `${name.slice(0, 32)}…` : name,
    titular: meta.titular ?? 'Titular por confirmar', rubro: 'Otro',
    comuna: meta.comuna ?? 'Por confirmar', region: '', instrument: /estudio de impacto/i.test(text) ? 'EIA' : 'DIA',
    rcaLabel: 'RCA importada', sourceUrl, phase: 'Operación',
    trackingStart: new Date().toISOString().slice(0, 8) + '01',
  };
  return { project, obligations };
}

/** Memorias de las frases de esta lectura, más las frases que alguien agregó a mano (pueden estar en esta RCA). */
async function loadMemories(env: Env, found: Obligation[]): Promise<Memory[]> {
  try {
    const keys = [...new Set(found.map((o) => quoteKey(o.quote)).filter((k) => k.length >= 20))].slice(0, 90);
    const q = keys.length
      ? `SELECT action, quote_key, quote, section, before_json, after_json FROM reading_feedback WHERE quote_key IN (${keys.map(() => '?').join(',')}) OR action = 'added' ORDER BY created_at DESC LIMIT 2000`
      : `SELECT action, quote_key, quote, section, before_json, after_json FROM reading_feedback WHERE action = 'added' ORDER BY created_at DESC LIMIT 2000`;
    const { results } = await env.DB.prepare(q).bind(...keys).all<{ action: FeedbackItem['action']; quote_key: string; quote: string; section: string | null; before_json: string | null; after_json: string | null }>();
    return summarize(results.map((r) => ({
      action: r.action, quoteKey: r.quote_key, quote: r.quote, section: r.section ?? undefined,
      before: r.before_json ? JSON.parse(r.before_json) : undefined, after: r.after_json ? JSON.parse(r.after_json) : undefined,
    })));
  } catch (e) {
    console.log('[lectura] sin memoria:', String((e as Error)?.message ?? e)); // nunca bloquea la lectura
    return [];
  }
}
