import { describe, expect, it } from 'vitest';
import { buildOccurrences, dueDates, onTimeRate, statusFor } from '../shared/recurrence';
import { SEED_OBLIGATIONS, SEED_PROJECTS, SEED_VENTANILLA, seedCompletions } from '../shared/seed';

const p = SEED_PROJECTS[0];
const ob = (id: string) => [...SEED_OBLIGATIONS, ...SEED_VENTANILLA].find((o) => o.id === id)!;

describe('dueDates', () => {
  it('mensual vence el último día del mes', () => {
    expect(dueDates(ob('g-topo-mensual'), p, '2026-01-01', '2026-03-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('trimestral cierra en mar/jun/sep/dic', () => {
    expect(dueDates(ob('g-doh-volumen'), p, '2026-01-01', '2026-12-31')).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']);
  });
  it('mensual con desfase: reporte del mes anterior', () => {
    const e = SEED_PROJECTS[1];
    expect(dueDates(ob('e-ril-sma'), e, '2026-01-01', '2026-03-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(dueDates(ob('estampa-vu-sinaderMensual'), e, '2026-01-01', '2026-02-28')).toEqual(['2026-01-14', '2026-02-14']);
  });
  it('semanal cae en domingo', () => {
    const d = dueDates(ob('g-humectacion'), p, '2026-11-02', '2026-11-20');
    expect(d).toEqual(['2026-11-08', '2026-11-15']);
  });
  it('anual en el mes indicado', () => {
    expect(dueDates(ob('guerrico-vu-dja'), p, '2026-01-01', '2027-12-31')).toEqual(['2026-10-31', '2027-10-31']);
  });
  it('se detiene al terminar la operación', () => {
    expect(dueDates(ob('g-topo-mensual'), p, '2027-12-01', '2028-06-30')).toEqual(['2027-12-31']);
  });
  it('permanentes y eventos no generan fechas', () => {
    expect(dueDates(ob('g-cuota'), p, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(dueDates(ob('g-alerta'), p, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('estado', () => {
  it('clasifica por días', () => {
    expect(statusFor('2026-11-01', '2026-11-02', false)).toBe('overdue');
    expect(statusFor('2026-11-02', '2026-11-02', false)).toBe('today');
    expect(statusFor('2026-11-08', '2026-11-02', false)).toBe('soon');
    expect(statusFor('2026-11-30', '2026-11-02', false)).toBe('upcoming');
    expect(statusFor('2026-11-01', '2026-11-02', true)).toBe('done');
  });
});

describe('semilla', () => {
  it('deja exactamente un vencido y un cumplimiento alto', () => {
    const today = '2026-11-02';
    const { completions } = seedCompletions(today);
    const occ = buildOccurrences({
      projects: SEED_PROJECTS, obligations: [...SEED_OBLIGATIONS, ...SEED_VENTANILLA].filter((o) => o.confirmed),
      completions, today, from: '2025-11-01', to: '2027-01-31',
    });
    const overdue = occ.filter((o) => o.status === 'overdue');
    expect(overdue.map((o) => o.obligation.id)).toEqual(['e-ril-sma']);
    const r = onTimeRate(occ, today);
    expect(r.rate).toBeGreaterThan(0.9);
    expect(r.rate).toBeLessThan(1);
  });
});
