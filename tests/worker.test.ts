import { describe, expect, it } from 'vitest';
import { planNotifications, DEFAULT_NOTIFY } from '../worker/src/notify';
import { buildIcs } from '../worker/src/ics';
import { normalizeObligations, parseModelJson, chunkText } from '../shared/extraction';
import { SEED_OBLIGATIONS, SEED_PROJECTS, SEED_VENTANILLA, seedCompletions } from '../shared/seed';

const today = '2026-11-02'; // lunes
const data = () => {
  const { completions, events } = seedCompletions(today);
  return { projects: SEED_PROJECTS, obligations: [...SEED_OBLIGATIONS, ...SEED_VENTANILLA], completions, events };
};

describe('avisos', () => {
  it('el lunes manda resumen semanal con el vencido', () => {
    const plan = planNotifications(data(), today, DEFAULT_NOTIFY, 'u1', new Set())!;
    expect(plan.subject).toContain('vencido');
    expect(plan.groups[0].items.map((o) => o.obligation.id)).toEqual(['e-ril-sma']);
    expect(plan.groups[2].items.length).toBeGreaterThan(0);
  });
  it('no repite lo ya enviado', () => {
    const first = planNotifications(data(), today, DEFAULT_NOTIFY, 'u1', new Set())!;
    expect(planNotifications(data(), today, DEFAULT_NOTIFY, 'u1', new Set(first.keys))).toBeNull();
  });
  it('agrupa varias fechas vencidas del mismo compromiso', () => {
    const d = data();
    d.completions = d.completions.filter((c) => c.obligationId !== 'g-humectacion' || c.due < '2026-10-01');
    const plan = planNotifications(d, today, DEFAULT_NOTIFY, 'u1', new Set())!;
    const ph = plan.groups[0].items.filter((o) => o.obligation.id === 'g-humectacion');
    expect(ph).toHaveLength(1);
    expect(ph[0].obligation.title).toMatch(/fechas pendientes/);
  });
  it('respeta avisos apagados', () => {
    const off = { weeklyDigest: false, before7: false, before1: false, overdue: false, push: false };
    expect(planNotifications(data(), today, off, 'u1', new Set())).toBeNull();
  });
});

describe('calendario .ics', () => {
  it('es válido y pliega líneas largas', () => {
    const ics = buildIcs(data(), today, 'https://vigia.example', 'Vigía');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe((ics.match(/END:VEVENT/g) ?? []).length);
  });
});

describe('extracción', () => {
  const text = 'Considerando 4.3.2. Se considera como mínimo una humectación de 2 veces al día. Se realiza un monitoreo semestral aguas arriba y aguas abajo.';
  it('lee JSON aunque venga con texto alrededor', () => {
    expect(parseModelJson('Claro: {"obligations":[{"title":"x"}]} listo').obligations).toHaveLength(1);
    expect(parseModelJson('sin json')).toEqual({});
  });
  it('descarta citas inventadas y normaliza valores', () => {
    const out = normalizeObligations([
      { title: 'Humectación de caminos', frequency: 'weekly', quote: 'Se considera como mínimo una humectación de 2 veces al día.', component: 'Aire' },
      { title: 'Monitoreo de agua', frequency: 'semiannual', quote: 'texto que no existe en la RCA', component: 'Inventado', recipient: 'Nadie' },
      { title: 'Humectación de caminos', frequency: 'weekly' },
    ], 'p1', text);
    expect(out).toHaveLength(2);
    expect(out[0].quote).toBeTruthy();
    expect(out[1].quote).toBeUndefined();
    expect(out[1].component).toBe('Administrativo');
    expect(out[1].recipient).toBe('Interno');
    expect(out.every((o) => !o.confirmed)).toBe(true);
  });
  it('corta el texto en trozos', () => {
    const chunks = chunkText(('párrafo '.repeat(200) + '\n\n').repeat(30), 5000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 5000)).toBe(true);
  });
});
