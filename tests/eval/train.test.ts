/**
 * Entrena el modelo de confianza (shared/model.json) y dice, con validación cruzada dejando una RCA
 * completa afuera cada vez, si de verdad mejora la precisión sin perder cobertura.
 *   TRAIN=1 CORPUS_DIR=… npx vitest run tests/eval/train.test.ts     (o: npm run train)
 * Si existe tests/eval/feedback.json (exportado de /api/extractor/feedback), también aprende de las
 * correcciones de los usuarios.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ruleObligationsRaw } from '../../shared/rules';
import { features, score, train, type Model, type Scorable } from '../../shared/confidence';
import { loadGold, type Gold } from './score';

const dir = process.env.CORPUS_DIR ?? 'corpus';
const pathOf = (doc: string) => [join(__dirname, 'texts', `${doc}.txt`), join(dir, `${doc}.txt`)].find((p) => existsSync(p));
const numOf = (o: Scorable) => (o.section ?? '').split(' ')[0];
const ok = (g: Gold, o: Scorable) => g.items.some((it) => it.num.includes(numOf(o)) && [it.kind].flat().includes(o.frequency.kind));

interface Row { doc: string; o: Scorable; x: string[]; y: 0 | 1 }

describe.skipIf(!process.env.TRAIN)('entrenamiento del modelo de confianza', () => {
  const golds = loadGold().filter((g) => pathOf(g.doc));
  const rows: Row[] = [];
  for (const g of golds) {
    const annotated = new Set(g.items.flatMap((i) => i.num));
    for (const o of ruleObligationsRaw(readFileSync(pathOf(g.doc)!, 'utf8'), 'p')) {
      if (!annotated.has(numOf(o))) continue;
      rows.push({ doc: g.doc, o, x: features(o), y: ok(g, o) ? 1 : 0 });
    }
  }
  // Correcciones de usuarios: lo que dejaron tal cual es positivo; lo que quitaron, negativo.
  const fbPath = join(__dirname, 'feedback.json');
  if (existsSync(fbPath)) {
    for (const r of JSON.parse(readFileSync(fbPath, 'utf8')) as { action: string; quote: string; section?: string; before_json?: string }[]) {
      if (!r.before_json || !['kept', 'removed'].includes(r.action)) continue;
      const o = { ...JSON.parse(r.before_json), quote: r.quote, section: r.section } as Scorable;
      rows.push({ doc: 'usuarios', o, x: features(o), y: r.action === 'kept' ? 1 : 0 });
    }
  }

  it('valida dejando una RCA afuera y guarda el modelo si ayuda', () => {
    const docs = [...new Set(rows.map((r) => r.doc))];
    // Puntaje de cada ejemplo dado por un modelo que nunca vio su RCA.
    const held = rows.map((r) => ({ r, p: score(r.o, train(rows.filter((x) => x.doc !== r.doc))) }));
    const pos = rows.filter((r) => r.y).length;
    const at = (t: number) => {
      const kept = held.filter((h) => h.p >= t);
      const tp = kept.filter((h) => h.r.y).length;
      return { t, kept: kept.length, precision: tp / (kept.length || 1), recallKept: tp / pos };
    };
    const base = { precision: pos / rows.length, recallKept: 1 };
    // Umbral: el que más sube la precisión perdiendo como máximo 3% de los correctos.
    const best = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6].map(at).filter((x) => x.recallKept >= 0.97).sort((a, b) => b.precision - a.precision)[0] ?? at(0);
    const lines = [
      `ejemplos: ${rows.length} (${pos} correctos, ${rows.length - pos} incorrectos) de ${docs.length} documentos`,
      `sin modelo:  precisión ${(base.precision * 100).toFixed(0)}%`,
      `con modelo:  precisión ${(best.precision * 100).toFixed(0)}% conservando ${(best.recallKept * 100).toFixed(0)}% de los correctos (umbral ${best.t})`,
      ...[0.3, 0.4, 0.5].map(at).map((x) => `  umbral ${x.t}: precisión ${(x.precision * 100).toFixed(0)}%, conserva ${(x.recallKept * 100).toFixed(0)}%, marca dudosos ${rows.length - x.kept}`),
    ];
    console.log('ENTRENAMIENTO\n' + lines.join('\n'));
    const model: Model = { ...train(rows), threshold: best.t };
    model.info = { ejemplos: rows.length, correctos: pos, documentos: docs.length, precisionSinModelo: +base.precision.toFixed(3), precisionValidada: +best.precision.toFixed(3), conservaCorrectos: +best.recallKept.toFixed(3), util: best.precision - base.precision >= 0.03 };
    writeFileSync(join(__dirname, '../../shared/model.json'), JSON.stringify(model, null, 1) + '\n');
    const top = Object.entries(model.weights).sort((a, b) => a[1] - b[1]);
    console.log('PESOS más negativos:', top.slice(0, 10).map(([k, v]) => `${k}=${v}`).join('  '));
    console.log('PESOS más positivos:', top.slice(-10).map(([k, v]) => `${k}=${v}`).join('  '));
    expect(rows.length).toBeGreaterThan(50);
  });
});
