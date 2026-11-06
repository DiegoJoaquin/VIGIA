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

// Formatos más antiguos y EIA (textos inventados con la estructura real de esas RCA).
const OLD = `
7°. Que, de acuerdo a los antecedentes que constan en el expediente de evaluación, la forma de
cumplimiento de la normativa de carácter ambiental aplicable al Proyecto es la siguiente:
7.2 Normas de carácter general
7.2.1 Decreto Supremo Nº 38, de 2011, del Ministerio del Medio Ambiente.
Tabla: Decreto Supremo Nº 38, de 2011, del Ministerio del Medio Ambiente.
Componente/materia: Ruido
Fase del proyecto a la que
aplica
Operación
Forma de cumplimiento Se instalarán barreras acústicas en el perímetro.
Indicador que acredita su
cumplimiento
Informe de medición.
Forma de control y
seguimiento
Programa de seguimiento acústico a través de un monitoreo semestral (marzo y noviembre)
durante la operación del proyecto.
7.2.2 Ley N° 19.300 sobre Bases Generales del Medio Ambiente.
Tabla: Ley N° 19.300 sobre Bases Generales del Medio Ambiente.
Componente/materia: Institucionalidad
Forma de cumplimiento El proyecto se somete al SEIA.
Forma de control y
seguimiento
Los antecedentes de la evaluación.
9°. Que, durante el procedimiento de evaluación el Titular propuso los siguientes compromisos
ambientales voluntarios:
COMPROMISO AMBIENTAL VOLUNTARIO: MONITOREO DE CALIDAD DE AGUA
Componente/Impacto Calidad de agua del río.
Objetivo, descripción y
justificación
Descripción: Se realizarán monitoreos de calidad de agua en cuatro puntos del río.
Lugar, forma y
oportunidad de
implementación
Oportunidad: El monitoreo se desarrollará en los meses de diciembre, enero, febrero y marzo.
12. Que, durante el procedimiento de evaluación del EIA el Titular del Proyecto propuso los siguientes
compromisos ambientales voluntarios:
12.1. Monitoreo de ruido en el receptor R7.
Objetivo, descripción y
justificación
Descripción: Ejecución de una campaña de monitoreo de ruido en el receptor R7.
Forma control y de
seguimiento
Control de la SMA: Envío del respectivo Informe de Monitoreo a la Superintendencia del Medio
Ambiente (SMA) en un plazo no mayor a un mes posterior a la realización del monitoreo.
13. Que, las medidas relevantes del Plan de Prevención de Contingencias y del Plan de Emergencias, son
las siguientes:
13.1. Riesgo de incendio.
Se deberá mantener extintores revisados de forma mensual.
RESUELVO:
`;

describe('lectura de RCA antiguas y EIA', () => {
  const list = ruleObligations(OLD, 'p');
  const titles = list.map((o) => o.title);

  it('lee la forma de control de una norma solo cuando tiene frecuencia', () => {
    const ds38 = list.find((o) => o.title.startsWith('D.S. N° 38/2011'));
    expect(ds38?.frequency.kind).toBe('semiannual');
    expect(titles.some((t) => t.startsWith('Ley N° 19.300'))).toBe(false);
  });

  it('reconoce compromisos sin número y la frecuencia por meses', () => {
    const agua = list.find((o) => o.title.startsWith('Monitoreo de calidad de agua'));
    expect(agua?.frequency.kind).toBe('monthly');
  });

  it('una campaña con informe a la SMA es una entrega única', () => {
    const ruido = list.find((o) => o.title.startsWith('Monitoreo de ruido'));
    expect(ruido?.frequency.kind).toBe('once');
    expect(ruido?.recipient).toBe('SMA');
  });

  it('salta las contingencias', () => {
    expect(list.some((o) => /extintores/i.test(o.plain))).toBe(false);
  });
});
