import { describe, expect, it } from 'vitest';
import { COLUMNS, fromSheet, parseCsv, toCsv } from '../shared/standard';
import type { Obligation, Project } from '../shared/types';

const project = { id: 'p', name: 'Planta Los Robles', shortName: 'Los Robles', titular: 'Agrícola Robles SpA', rubro: 'Agroindustria', comuna: 'San Javier', region: 'Maule', instrument: 'DIA', rcaLabel: 'RCA N° 12/2024', sourceUrl: '', phase: 'Operación', trackingStart: '2026-01-01' } as Project;
const obligations: Obligation[] = [
  { id: 'a', projectId: 'p', title: 'Monitoreo de RIL: informe mensual', plain: 'Muestrear el efluente; incluye pH; "caudal"', component: 'Agua', recipient: 'SMA', frequency: { kind: 'monthly', dueDay: 20, lagMonths: 1 }, quote: 'Se remitirá a la SMA;\nmensualmente', section: '9.2 Compromiso voluntario: RIL', evidence: 'Informe', confirmed: true, source: 'rca' },
  { id: 'b', projectId: 'p', title: 'Hallazgo arqueológico', plain: 'Avisar al CMN', component: 'Patrimonio', recipient: 'CMN', frequency: { kind: 'event', hoursAfterEvent: 24 }, section: '8.1 Condición de la RCA', evidence: 'Carta', confirmed: false, source: 'rca' },
];

describe('ficha estándar', () => {
  it('ida y vuelta por CSV sin perder datos', () => {
    const csv = toCsv(project, obligations);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...COLUMNS]);
    const back = fromSheet(rows, 'x');
    expect(back.issues).toEqual([]);
    expect(back.project.name).toBe('Planta Los Robles');
    expect(back.obligations).toHaveLength(2);
    expect(back.obligations[0].quote).toBe('Se remitirá a la SMA;\nmensualmente');
    expect(back.obligations[0].frequency).toMatchObject({ kind: 'monthly', dueDay: 20 });
    expect(back.obligations[0].confirmed).toBe(true);
    expect(back.obligations[1]).toMatchObject({ recipient: 'CMN', frequency: { kind: 'event', hoursAfterEvent: 24 } });
  });

  it('acepta una planilla hecha a mano con otros encabezados y comas', () => {
    const csv = 'Matriz de compromisos\nCompromiso,Periodicidad,Organismo,Medio de verificación,Materia\n"Declaración SINADER",Anual,Superintendencia,Comprobante,Residuos\nCharla de inducción,cada vez que ingrese personal,Interno,Registro de asistencia,Patrimonio\n';
    const r = fromSheet(parseCsv(csv), 'x');
    expect(r.issues).toEqual([]);
    expect(r.obligations.map((o) => [o.title, o.frequency.kind, o.recipient])).toEqual([
      ['Declaración SINADER', 'annual', 'SMA'], ['Charla de inducción', 'event', 'Interno'],
    ]);
  });

  it('avisa por fila lo que no entiende en vez de inventar', () => {
    const csv = 'Obligación;Frecuencia;Día de vencimiento\nInforme;cuando se pueda;\nRegistro;Mensual;45\n';
    const r = fromSheet(parseCsv(csv), 'x');
    expect(r.obligations).toHaveLength(1);
    expect(r.issues.map((i) => i.row)).toEqual([2, 3]);
  });
});
