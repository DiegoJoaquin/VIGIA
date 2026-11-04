// Lectura de una RCA desde la app, usando Workers AI (capa gratuita de Cloudflare).
// Para RCA largas o mejor calidad, usa el extractor local con Ollama (extractor/extract_rca.py).
import { extractText, getDocumentProxy } from 'unpdf';
import { EXTRACTION_PROMPT, chunkText, guessProjectMeta, normalizeObligations, parseModelJson } from '../../shared/extraction';
import type { Project } from '../../shared/types';
import type { Env } from './env';
import { randomId } from './util';

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const ALLOWED_HOSTS = ['firma.sea.gob.cl', 'infofirma.sea.gob.cl', 'seia.sea.gob.cl'];

export async function pdfText(bytes: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n\n') : text;
}

export async function fetchRca(url: string): Promise<ArrayBuffer> {
  const u = new URL(url);
  if (!ALLOWED_HOSTS.includes(u.hostname)) throw new Error('El enlace debe ser un documento del SEA (firma.sea.gob.cl).');
  const r = await fetch(u.toString(), { headers: { 'user-agent': 'Mozilla/5.0 Vigia' } });
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
  if (!env.AI) throw new Error('La lectura automática no está activada en este servidor. Usa el extractor local.');
  const text = await pdfText(bytes);
  if (text.replace(/\s/g, '').length < 2000) throw new Error('El PDF no tiene texto seleccionable (parece escaneado). Usa el extractor local con OCR.');
  const projectId = opts.project?.id ?? `p-${randomId(6)}`;
  const hint = KIND_HINT[opts.kind ?? 'rca'] ?? KIND_HINT.rca;
  const items: unknown[] = [];
  // Limitamos a 8 trozos para quedar dentro de la capa gratuita diaria.
  for (const chunk of chunkText(text, 10_000).slice(0, 8)) {
    const res = (await env.AI.run(MODEL as Parameters<Ai['run']>[0], {
      messages: [{ role: 'system', content: EXTRACTION_PROMPT }, { role: 'user', content: `${hint}\n\n${chunk}` }],
      max_tokens: 2048, temperature: 0.1,
    } as never)) as { response?: string };
    items.push(...(parseModelJson(res.response ?? '').obligations ?? []));
  }
  const batch = randomId(4); // los ids no chocan con compromisos ya cargados en el proyecto
  const obligations = normalizeObligations(items, projectId, text).map((o) => (opts.project ? { ...o, id: `${o.id}-${batch}` } : o));
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
