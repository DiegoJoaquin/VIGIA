import { describe, expect, it } from 'vitest';
import { report, scoreAll } from './score';

// Las RCA completas no viven en el repositorio (son PDF públicos del SEA de cientos de páginas):
// se bajan con el flujo "Corpus de RCA" a la rama corpus-rca. Apunta CORPUS_DIR a esa carpeta.
// Sin CORPUS_DIR se mide solo con los textos guardados en tests/eval/texts.
const scores = scoreAll(process.env.CORPUS_DIR ?? 'corpus');

describe.skipIf(!scores.length)('lectura contra RCA revisadas a mano', () => {
  it('informa cobertura y precisión', () => {
    console.log(report(scores));
    expect(scores.length).toBeGreaterThan(0);
  });
  // Umbrales mínimos: si un cambio al lector los rompe, la prueba falla antes de publicarlo.
  it('mantiene la calidad mínima', () => {
    const t = scores.reduce((a, s) => ({ g: a.g + s.gold, f: a.f + s.found, p: a.p + s.proposed, m: a.m + s.matched }), { g: 0, f: 0, p: 0, m: 0 });
    expect(t.f / t.g).toBeGreaterThanOrEqual(Number(process.env.MIN_RECALL ?? 0.8));
    expect(t.m / t.p).toBeGreaterThanOrEqual(Number(process.env.MIN_PRECISION ?? 0.7));
  });
});
