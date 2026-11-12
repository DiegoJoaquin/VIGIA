/**
 * Mide la lectura automática contra RCA revisadas a mano (tests/eval/gold).
 *
 * Una obligación de referencia cuenta como encontrada si el lector propone algo en el mismo numeral
 * (o en uno equivalente) con la misma frecuencia. Así se mide lo que importa para el calendario:
 * que esté la obligación y que vuelva cuando corresponde, sin exigir el mismo título palabra por palabra.
 *
 *   cobertura = referencias encontradas / referencias
 *   precisión = propuestas que calzan con alguna referencia / propuestas (solo en los numerales anotados)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ruleObligations } from '../../shared/rules';
import type { FrequencyKind, Obligation } from '../../shared/types';

/** `kind` puede listar alternativas cuando la RCA admite dos lecturas razonables. */
export interface GoldItem { num: string[]; kind: FrequencyKind | FrequencyKind[]; que: string }
/** set: 'ajuste' = usada para afinar el lector; 'prueba' = el lector nunca se ajustó mirándola (medición honesta). */
export interface Gold { doc: string; tipo: string; set?: 'ajuste' | 'prueba'; items: GoldItem[] }
const kindOk = (g: GoldItem, k: FrequencyKind) => (Array.isArray(g.kind) ? g.kind.includes(k) : g.kind === k);
export interface DocScore {
  doc: string; tipo: string; set: 'ajuste' | 'prueba'; gold: number; found: number; proposed: number; matched: number;
  recall: number; precision: number; missed: GoldItem[]; extra: Obligation[];
}

const GOLD_DIR = join(__dirname, 'gold');
const numOf = (o: Obligation) => (o.section ?? '').split(' ')[0];

export function scoreDoc(gold: Gold, found: Obligation[]): DocScore {
  const annotated = new Set(gold.items.flatMap((g) => g.num));
  const inScope = found.filter((o) => annotated.has(numOf(o)));
  const hits = gold.items.map((g) => inScope.some((o) => g.num.includes(numOf(o)) && kindOk(g, o.frequency.kind)));
  const good = inScope.filter((o) => gold.items.some((g) => g.num.includes(numOf(o)) && kindOk(g, o.frequency.kind)));
  const foundN = hits.filter(Boolean).length;
  return {
    doc: gold.doc, tipo: gold.tipo, set: gold.set ?? 'ajuste', gold: gold.items.length, found: foundN, proposed: inScope.length, matched: good.length,
    recall: foundN / gold.items.length, precision: inScope.length ? good.length / inScope.length : 1,
    missed: gold.items.filter((_, i) => !hits[i]), extra: inScope.filter((o) => !good.includes(o)),
  };
}

export function loadGold(): Gold[] {
  return readdirSync(GOLD_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(GOLD_DIR, f), 'utf8')) as Gold);
}

/** Corre el lector sobre cada RCA de referencia que esté disponible en `corpusDir`. */
export function scoreAll(corpusDir: string): DocScore[] {
  // Los textos chicos viven en tests/eval/texts; el resto se baja a la rama corpus-rca.
  const pathOf = (doc: string) => [join(__dirname, 'texts', `${doc}.txt`), join(corpusDir, `${doc}.txt`)].find((p) => existsSync(p));
  return loadGold()
    .filter((g) => pathOf(g.doc))
    .map((g) => scoreDoc(g, ruleObligations(readFileSync(pathOf(g.doc)!, 'utf8'), 'p')));
}

export const totals = (list: DocScore[]) => list.reduce((a, s) => ({ gold: a.gold + s.gold, found: a.found + s.found, proposed: a.proposed + s.proposed, matched: a.matched + s.matched }), { gold: 0, found: 0, proposed: 0, matched: 0 });

export function report(scores: DocScore[]): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  const lines = scores.map((s) => `${s.doc.padEnd(26)} cobertura ${pct(s.recall)} (${s.found}/${s.gold})  precisión ${pct(s.precision)} (${s.matched}/${s.proposed})`);
  for (const [label, list] of [['AJUSTE', scores.filter((s) => s.set === 'ajuste')], ['PRUEBA (no vistas)', scores.filter((s) => s.set === 'prueba')], ['TOTAL', scores]] as const) {
    if (!list.length) continue;
    const t = totals(list);
    lines.push(`${label.padEnd(26)} cobertura ${pct(t.found / t.gold)} (${t.found}/${t.gold})  precisión ${pct(t.matched / (t.proposed || 1))} (${t.matched}/${t.proposed})`);
  }
  for (const s of scores) {
    for (const m of s.missed) lines.push(`  falta  ${s.doc} ${m.num[0]} ${[m.kind].flat().join('/')}: ${m.que}`);
    for (const e of s.extra) lines.push(`  sobra  ${s.doc} ${numOf(e)} ${e.frequency.kind}: ${e.title}`);
  }
  return lines.join('\n');
}
