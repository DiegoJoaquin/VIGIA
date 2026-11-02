// Obligaciones generales de la Ventanilla Única del RETC.
// No dependen de la RCA: dependen de lo que hace el establecimiento.
// Se activan con un cuestionario corto. Fechas según el calendario VU y manuales del MMA;
// el usuario puede ajustar cualquier fecha si la autoridad la cambia.

import type { Obligation } from './types';

export interface VentanillaAnswers {
  residuos12t: boolean;     // genera o recibe > 12 t/año de residuos no peligrosos
  fuentesFijas: boolean;    // calderas, grupos electrógenos, hornos
  respel: boolean;          // genera residuos peligrosos
  sustPeligrosas: boolean;  // almacena sustancias peligrosas sobre el umbral del DS 43
  envases300kg: boolean;    // introduce > 300 kg/año de envases (Ley REP)
}

export const VENTANILLA_QUESTIONS: { key: keyof VentanillaAnswers; label: string; help: string }[] = [
  { key: 'residuos12t', label: 'Genera más de 12 toneladas de residuos al año', help: 'Cartón, plástico, chatarra, lodos, orujo. Activa la declaración SINADER.' },
  { key: 'fuentesFijas', label: 'Tiene calderas o grupos electrógenos', help: 'Cualquier fuente fija de emisiones. Activa la declaración anual de emisiones.' },
  { key: 'respel', label: 'Genera residuos peligrosos', help: 'Aceites usados, envases de químicos, baterías. Activa SIDREP y el plazo de 6 meses de bodega.' },
  { key: 'sustPeligrosas', label: 'Almacena sustancias peligrosas', help: 'Combustibles, ácidos o químicos sobre el umbral del DS 43. Activa DASUSPEL.' },
  { key: 'envases300kg', label: 'Vende o importa más de 300 kg de envases al año', help: 'Botellas, cajas, film. Activa la declaración de la Ley REP.' },
];

type Template = Omit<Obligation, 'id' | 'projectId' | 'confirmed' | 'source'>;

const VU: Record<string, Template> = {
  dja: {
    title: 'Declaración Jurada Anual (DJA)',
    plain: 'Confirmar que todo lo declarado durante el año en la Ventanilla Única es correcto.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'annual', dueMonth: 10, dueDay: 31 },
    section: 'Res. Ex. 144/2020 MMA, art. 11',
    evidence: 'Comprobante de envío de la DJA',
  },
  sinaderMensual: {
    title: 'Declaración mensual SINADER',
    plain: 'Declarar los residuos no peligrosos del mes anterior y a quién se entregaron.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'monthly', lagMonths: 1, dueDay: 14 },
    section: 'DS 1/2013 MMA, art. 26 · plazo de 10 días hábiles',
    evidence: 'Comprobante de declaración SINADER y certificados del receptor',
  },
  sinaderAnual: {
    title: 'Consolidado anual SINADER',
    plain: 'Revisar y confirmar el consolidado anual de residuos que propone el sistema.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'annual', dueMonth: 3, dueDay: 30 },
    section: 'DS 1/2013 MMA',
    evidence: 'Comprobante del consolidado anual',
  },
  f138: {
    title: 'Declaración anual de emisiones (DS 138)',
    plain: 'Declarar el consumo y funcionamiento de calderas y generadores del año anterior.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'annual', dueMonth: 4, dueDay: 30 },
    section: 'DS 138/2005 MINSAL · sistema RUEA',
    evidence: 'Certificado de declaración F138',
  },
  sidrep: {
    title: 'Declaración SIDREP del retiro de residuos peligrosos',
    plain: 'Cada vez que un transportista retira residuos peligrosos, declarar el movimiento.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'event', hoursAfterEvent: 48 },
    section: 'DS 148/2003 MINSAL',
    evidence: 'Folio SIDREP y guía del transportista',
  },
  respel6m: {
    title: 'Retiro de residuos peligrosos de la bodega',
    plain: 'Los residuos peligrosos no pueden quedar más de 6 meses almacenados.',
    component: 'Residuos', recipient: 'Interno',
    frequency: { kind: 'semiannual', dueMonth: 6 },
    section: 'DS 148/2003 MINSAL, art. 31',
    evidence: 'Comprobante de retiro y destino',
  },
  dasuspel: {
    title: 'Declaración de sustancias peligrosas (DASUSPEL)',
    plain: 'Declarar las sustancias peligrosas almacenadas en el semestre.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'semiannual', dueMonth: 6, dueDay: 20 },
    section: 'DS 43/2015 MINSAL, art. 5',
    evidence: 'Comprobante DASUSPEL',
  },
  rep: {
    title: 'Declaración Ley REP de envases',
    plain: 'Declarar los kilos de envases y embalajes puestos en el mercado el año anterior.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'annual', dueMonth: 12, dueDay: 15 },
    section: 'Ley 20.920 · la fecha exacta la fija cada año el MMA',
    evidence: 'Comprobante de declaración REP',
  },
  dae: {
    title: 'Desempeño Ambiental Empresarial (DAE)',
    plain: 'Responder el formulario anual de desempeño ambiental del establecimiento.',
    component: 'Ventanilla Única', recipient: 'Ventanilla Única',
    frequency: { kind: 'annual', dueMonth: 6, dueDay: 30 },
    section: 'Res. Ex. 144/2020 MMA, art. 10',
    evidence: 'Comprobante DAE',
  },
};

/** Genera los compromisos de Ventanilla Única que corresponden a un establecimiento. */
export function ventanillaObligations(projectId: string, a: VentanillaAnswers): Obligation[] {
  const keys: string[] = [];
  if (a.residuos12t) keys.push('sinaderMensual', 'sinaderAnual');
  if (a.fuentesFijas) keys.push('f138');
  if (a.respel) keys.push('sidrep', 'respel6m');
  if (a.sustPeligrosas) keys.push('dasuspel');
  if (a.envases300kg) keys.push('rep');
  if (keys.length) keys.push('dae', 'dja');
  return keys.map((k) => ({
    ...VU[k], id: `${projectId}-vu-${k}`, projectId, confirmed: true, source: 'ventanilla' as const,
  }));
}
