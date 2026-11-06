import { describe, expect, it } from 'vitest';
import { applyMemory, diffReview, quoteKey, summarize } from '../shared/learning';
import type { Obligation } from '../shared/types';

const ob = (id: string, quote: string, kind: Obligation['frequency']['kind'], title = 'Monitoreo'): Obligation =>
  ({ id, projectId: 'p', title, plain: '', component: 'Agua', recipient: 'Interno', frequency: { kind }, quote, section: '9.1 Compromiso', evidence: '', confirmed: false, source: 'rca' });

const Q1 = 'El monitoreo se desarrollará en los meses de diciembre, enero, febrero y marzo.';
const Q2 = 'Una vez recibido el reclamo, el encargado deberá registrarlo en la planilla.';
const Q3 = 'Se remitirá a la SMA la declaración anual de residuos en el sistema SINADER.';

describe('aprendizaje con correcciones', () => {
  it('la huella ignora tildes, mayúsculas y saltos de línea', () => {
    expect(quoteKey('Se REMITIRÁ\na la  SMA')).toBe(quoteKey('se remitira a la sma'));
  });

  it('registra lo que la persona quitó, corrigió y agregó', () => {
    const proposed = [ob('a', Q1, 'continuous'), ob('b', Q2, 'once')];
    const final = [{ ...proposed[0], frequency: { kind: 'monthly' as const } }, ob('c', Q3, 'annual', 'Declaración SINADER')];
    const fb = diffReview(proposed, final, ['a', 'c']);
    expect(fb.map((f) => f.action)).toEqual(['edited', 'removed', 'added']);
  });

  it('la próxima lectura llega corregida, sin lo descartado y con lo que faltaba', () => {
    const proposed = [ob('a', Q1, 'continuous'), ob('b', Q2, 'once')];
    const final = [{ ...proposed[0], frequency: { kind: 'monthly' as const } }, { ...ob('c', Q3, 'annual', 'Declaración SINADER'), recipient: 'SMA' as const }];
    const memory = summarize(diffReview(proposed, final, ['a', 'c']));
    const text = `9. Compromisos\n${Q1}\n${Q2}\nAdemás, ${Q3}`;
    const next = applyMemory([ob('x', Q1, 'continuous'), ob('y', Q2, 'once')], memory, text, 'q');
    expect(next.find((o) => o.id === 'x')).toMatchObject({ frequency: { kind: 'monthly' }, learned: 'edited' });
    expect(next.find((o) => o.id === 'y')?.learned).toBe('removed');
    expect(next.find((o) => o.learned === 'added')).toMatchObject({ title: 'Declaración SINADER', recipient: 'SMA', frequency: { kind: 'annual' } });
  });

  it('una corrección aislada no pisa a muchas personas que dejaron la lectura tal cual', () => {
    const p = [ob('a', Q1, 'monthly')];
    const many = [...Array(3)].flatMap(() => diffReview(p, p, ['a']));
    const one = diffReview(p, [{ ...p[0], frequency: { kind: 'annual' as const } }], ['a']);
    const next = applyMemory([ob('x', Q1, 'monthly')], summarize([...many, ...one]), Q1, 'q');
    expect(next[0].frequency.kind).toBe('monthly');
    expect(next[0].learned).toBeUndefined();
  });
});
