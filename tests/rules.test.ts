import { describe, expect, it } from 'vitest';
import { ruleObligations } from '../shared/rules';

// Extracto con la estructura de una RCA actual del SEA (texto inventado, formato real).
const RCA = `
7. Que, el proyecto cumple con la normativa ambiental aplicable.
8°. Que, para ejecutar el Proyecto deben cumplirse las siguientes condiciones o exigencias, en
concordancia con el artículo 25 de la Ley N° 19.300:
8.1 Respecto del Oficio ORD. Nº 100 de Consejo de Monumentos Nacionales.
Sobre el monitoreo paleontológico, solicita que se realice de forma permanente (diario), en todas las
obras que impliquen excavaciones. Los informes de monitoreo paleontológico deberán ser remitidos con
frecuencia mensual al CMN y SMA.
9. Que, durante el procedimiento de evaluación de la DIA el Titular del Proyecto propuso los
siguientes compromisos ambientales voluntarios:
9.1. Compromiso ambiental voluntario 1 - Charlas arqueológicas
Impacto asociado
Alteración al patrimonio cultural
Objetivo, descripción y Objetivo: Velar por la protección del patrimonio.
justificación
Justificación: Durante las actividades de movimiento de tierras podrían reportarse hallazgos, para
ello se debe indicar a los trabajadores los procedimientos.
Lugar, forma y
oportunidad de
implementación
Forma: Se realizarán charlas a los trabajadores previo al inicio de cada obra o frente de trabajo.
Estas charlas deben ser realizadas por un arqueólogo, quien deberá remitir a la Superintendencia del
Medio Ambiente (SMA) un informe de charla de inducción.
Indicador que acredite
su cumplimiento
Registro de charla
Forma de control y
seguimiento
Informe de charla remitido a la SMA.
9.2. Compromiso ambiental voluntario 2 - Plan de control de emisiones
Descripción: Durante la fase de construcción se implementarán las siguientes medidas de control:
• Velocidad máxima de 30 km/h dentro de la obra.
10. Que, de acuerdo a los antecedentes del expediente, las medidas del Plan de Prevención de Contingencias y Emergencias son:
Incendio: se dará aviso a bomberos.
`;

describe('lectura de compromisos por reglas', () => {
  const obs = ruleObligations(RCA, 'p');
  const titles = obs.map((o) => `${o.title} [${o.frequency.kind}]`);

  it('reconoce las condiciones y los compromisos voluntarios', () => {
    expect(titles).toContain('Monitoreo paleontológico [continuous]');
    expect(titles).toContain('Monitoreo paleontológico: informe mensual [monthly]');
    expect(titles).toContain('Charlas arqueológicas [event]');
    expect(titles).toContain('Plan de control de emisiones [continuous]');
  });
  it('el informe mensual va dirigido a quien dice la RCA', () => {
    expect(obs.find((o) => o.frequency.kind === 'monthly')?.recipient).toBe('CMN');
  });
  it('cada compromiso sale con una cita textual que existe en el documento', () => {
    const hay = RCA.replace(/\s+/g, ' ');
    for (const o of obs) expect(hay).toContain(o.quote);
  });
  it('no toma la justificación ni el plan de contingencias como obligaciones', () => {
    expect(obs.some((o) => /podrían reportarse|bomberos/.test(o.quote ?? ''))).toBe(false);
  });
  it('si el documento no tiene la plantilla actual, no inventa nada', () => {
    expect(ruleObligations('Descripción del proyecto. Se construirán 300 viviendas.', 'p')).toEqual([]);
  });
});
