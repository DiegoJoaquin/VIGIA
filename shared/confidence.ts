/**
 * Modelo de confianza: un clasificador estadístico (regresión logística) que estima qué tan probable es
 * que un compromiso propuesto por el lector sea correcto. No es IA generativa: son pesos aprendidos de
 * RCA revisadas a mano (tests/eval/gold) y de las correcciones de los usuarios, guardados en model.json.
 *
 * Se entrena con `npm run train`. Usa solo datos del propio compromiso (cita, frecuencia, tipo, destinatario),
 * así que también puede aprender de las correcciones guardadas en reading_feedback.
 */
import { saysKind } from './rules';
import type { Obligation } from './types';

export interface Model {
  bias: number;
  weights: Record<string, number>;
  /** Bajo este puntaje el compromiso llega desmarcado, como "dudoso". */
  threshold: number;
  info?: Record<string, unknown>;
}

const plainText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const typeOf = (section = '') => /compromiso/i.test(section) ? 'compromiso' : /seguimiento/i.test(section) ? 'seguimiento' : /norma/i.test(section) ? 'norma' : /medida/i.test(section) ? 'medida' : /condici/i.test(section) ? 'condicion' : 'otro';

export type Scorable = Pick<Obligation, 'title' | 'frequency' | 'recipient' | 'quote' | 'section'>;

/** Rasgos de un compromiso propuesto. */
export function features(o: Scorable): string[] {
  const q = plainText(o.quote ?? '');
  const k = o.frequency.kind, t = typeOf(o.section);
  const says = saysKind(o.quote ?? '', k);
  const f = [`kind:${k}`, `type:${t}`, `kt:${k}|${t}`, `says:${says}`, `ks:${k}|${says}`, `rec:${o.recipient === 'Interno' ? 'interno' : 'autoridad'}`];
  if (/: (informe|una vez|si hay|informe final)/.test(o.title)) f.push(`suffix:${/: ([a-z ]+)/.exec(o.title)![1].trim()}`);
  if (!q) f.push('noquote');
  else f.push(`len:${q.length < 80 ? 'corta' : q.length < 200 ? 'media' : 'larga'}`);
  if (/\b(debera|deberan|debe)\b/.test(q)) f.push('q:debera');
  if (/\bse (realizara|remitira|mantendra|efectuara|enviara|entregara|informara|presentara|revisara|registrara)n?\b/.test(q)) f.push('q:futuro');
  if (/\b(sma|superintendencia|cmn|seremi|monumentos)\b/.test(q)) f.push('q:autoridad');
  if (/\b(informe|reporte|registro|monitoreo|medicion|muestreo|inspeccion|capacitacion|charla)/.test(q)) f.push('q:control');
  if (/^(objetivo|justificacion|descripcion|lugar|indicador)/.test(q)) f.push(`q:rotulo:${/^[a-z]+/.exec(q)![0]}`);
  if (/\b(sugiere|recomienda|podra|podria|se estima|aproximadamente|toneladas|m3|litros)\b/.test(q)) f.push('q:descriptivo');
  for (const w of new Set(q.match(/[a-zñ]{5,}/g) ?? [])) f.push(`w:${w}`);
  return f;
}

export function score(o: Scorable, m: Model): number {
  let z = m.bias;
  for (const f of features(o)) z += m.weights[f] ?? 0;
  return 1 / (1 + Math.exp(-z));
}

/** Regresión logística con descenso de gradiente y regularización L2. Determinista. */
export function train(rows: { x: string[]; y: 0 | 1 }[], opts = { epochs: 400, lr: 0.3, l2: 0.02, minCount: 3 }): Model {
  const count = new Map<string, number>();
  for (const r of rows) for (const f of new Set(r.x)) count.set(f, (count.get(f) ?? 0) + 1);
  // Las palabras sueltas solo entran si aparecen en varios ejemplos: evita memorizar una RCA.
  const keep = (f: string) => !f.startsWith('w:') || (count.get(f) ?? 0) >= opts.minCount;
  const w: Record<string, number> = {};
  let b = 0;
  const n = rows.length || 1;
  const pos = rows.filter((r) => r.y === 1).length;
  const wPos = n / (2 * Math.max(1, pos)), wNeg = n / (2 * Math.max(1, n - pos)); // clases balanceadas
  for (let e = 0; e < opts.epochs; e++) {
    const g: Record<string, number> = {}; let gb = 0;
    for (const r of rows) {
      const xs = r.x.filter(keep);
      let z = b; for (const f of xs) z += w[f] ?? 0;
      const err = (1 / (1 + Math.exp(-z)) - r.y) * (r.y ? wPos : wNeg);
      gb += err; for (const f of xs) g[f] = (g[f] ?? 0) + err;
    }
    b -= (opts.lr * gb) / n;
    for (const f of Object.keys(g)) w[f] = (w[f] ?? 0) - opts.lr * (g[f] / n + opts.l2 * (w[f] ?? 0));
  }
  for (const f of Object.keys(w)) { if (Math.abs(w[f]) < 0.01) delete w[f]; else w[f] = Math.round(w[f] * 1000) / 1000; }
  return { bias: Math.round(b * 1000) / 1000, weights: w, threshold: 0.5 };
}
