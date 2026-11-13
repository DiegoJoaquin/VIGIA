import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addTerm, esNumber, looksLikeApproval, looksLikePdc, readApproval, readPdc } from '../shared/pdc';

const txt = (n: string) => readFileSync(`${__dirname}/eval/texts/${n}.txt`, 'utf8');
const BASE = '2026-01-05'; // lunes

describe('plazos del PdC', () => {
  it('suma días hábiles sin contar fines de semana y meses calendario', () => {
    expect(addTerm(BASE, { n: 10, unit: 'habiles' })).toBe('2026-01-19');
    expect(addTerm(BASE, { n: 3, unit: 'meses' })).toBe('2026-04-05');
  });
});

describe('lector de programas de cumplimiento', () => {
  it('guía general (Leñadura): acciones con fecha, reportes inicial, de avance y final', () => {
    const t = txt('pdc-lenadura');
    expect(looksLikePdc(t)).toBe(true);
    const r = readPdc(t, 'p', BASE, true);
    expect(r.format).toBe('guia');
    const by = (re: RegExp) => r.obligations.find((o) => re.test(o.title));
    expect(by(/Retiro de lodos/)?.frequency).toEqual({ kind: 'once', date: '2025-05-31' });
    expect(by(/Encapsulamiento/)?.frequency.date).toBe('2025-01-31');
    expect(by(/Plan de Gestión de Olores/)?.frequency.kind).toBe('continuous');
    expect(by(/Reporte inicial/)?.frequency.date).toBe(addTerm(BASE, { n: 20, unit: 'habiles' }));
    expect(by(/avance/)?.frequency.kind).toBe('quarterly');
    expect(by(/Reporte final/)?.frequency.kind).toBe('once');
    expect(by(/Cargar el programa/)?.frequency.date).toBe('2026-01-19');
  });

  it('ficha simplificada de ruido (Minuta Verde): acción marcada, plazo en meses y carga en SPDC', () => {
    const r = readPdc(txt('pdc-minutoverde'), 'p', BASE, true);
    expect(r.format).toBe('fichas');
    expect(r.obligations.some((o) => /Encierros acústicos/.test(o.title) && o.frequency.date === '2026-04-05')).toBe(true);
    expect(r.obligations.some((o) => /SPDC/.test(o.title) && o.frequency.date === '2026-01-12')).toBe(true);
    expect(r.obligations.every((o) => o.quote && o.section)).toBe(true);
  });

  it('avisa cuando la fecha base no se conoce', () => {
    const r = readPdc(txt('pdc-minutoverde'), 'p', BASE, false);
    expect(r.obligations.find((o) => o.frequency.date)?.plain).toMatch(/ajústala/);
  });

  it('un texto que no es PdC no inventa compromisos', () => {
    const r = readPdc('Resolución de calificación ambiental favorable. El titular deberá informar.', 'p', BASE);
    expect(r.obligations).toEqual([]);
    expect(looksLikePdc('hola')).toBe(false);
  });
});

describe('números en palabras', () => {
  it('entiende los plazos que escribe la SMA', () => {
    expect(esNumber('veintiséis')).toBe(26);
    expect(esNumber('diecinueve')).toBe(19);
    expect(esNumber('treinta y cuatro')).toBe(34);
    expect(esNumber('diez (10)')).toBe(10);
    expect(esNumber('20')).toBe(20);
    expect(esNumber('veintiuno')).toBe(21);
    expect(esNumber('hola')).toBeUndefined();
  });
});

describe('resolución que aprueba el programa', () => {
  it('Leñadura: 19 meses, carga en 10 días hábiles y reporte final 20 días hábiles después', () => {
    const t = txt('pdc-aprueba-lenadura');
    expect(looksLikeApproval(t)).toBe(true);
    const r = readApproval(t, 'p', BASE, true);
    expect(r.totalMonths).toBe(19);
    const by = (re: RegExp) => r.obligations.find((o) => re.test(o.title))!;
    expect(by(/Cargar/).frequency.date).toBe('2026-01-19');
    expect(by(/Terminan/).frequency.date).toBe('2027-08-05');
    expect(by(/Reporte final/).frequency.date).toBe(addTerm('2027-08-05', { n: 20, unit: 'habiles' }));
  });
  it('Guerrico: veintiséis meses y reporte final dentro de un mes', () => {
    const r = readApproval(txt('pdc-aprueba-guerrico'), 'p', BASE, true);
    expect(r.totalMonths).toBe(26);
    expect(r.obligations.find((o) => /Reporte final/.test(o.title))!.frequency.date).toBe('2028-04-05');
  });
  it('un programa o una RCA no se confunden con la resolución', () => {
    expect(looksLikeApproval(txt('pdc-lenadura'))).toBe(false);
  });
});
