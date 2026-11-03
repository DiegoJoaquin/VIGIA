// Datos de demostración construidos desde RCA públicas del SEIA (firma.sea.gob.cl).
// Las citas marcadas en `quote` fueron verificadas contra el texto del documento.
// La Tablada se deja "sin revisar" a propósito: muestra el flujo de revisión humana.

import type { Completion, EventLog, Obligation, Project } from './types';
import { addDays, buildOccurrences, daysBetween } from './recurrence';
import { ventanillaObligations } from './ventanilla';

export const SEED_PROJECTS: Project[] = [
  {
    id: 'guerrico',
    name: 'Extracción de Áridos Km -6,0 al -7,0 Río Cachapoal',
    shortName: 'Áridos Río Cachapoal',
    titular: 'Áridos Guerrico Chile Ltda.',
    rubro: 'Áridos',
    comuna: 'Machalí', region: "O'Higgins",
    instrument: 'DIA',
    rcaLabel: 'RCA Comisión de Evaluación O’Higgins, 2020',
    sourceUrl: 'https://firma.sea.gob.cl/publicaciones/09/cf/2146153249.pdf',
    phase: 'Operación',
    operationStart: '2020-07-01', operationEnd: '2028-01-15',
    trackingStart: '2025-11-01',
  },
  {
    id: 'estampa',
    name: 'Modificación Sistema de Tratamiento Riles Viña y Bodega Estampa',
    shortName: 'Viña Estampa · Riles',
    titular: 'Viña y Bodega Estampa S.A.',
    rubro: 'Vitivinícola',
    comuna: 'Palmilla', region: "O'Higgins",
    instrument: 'DIA',
    rcaLabel: 'RCA Comisión de Evaluación O’Higgins, 2019',
    sourceUrl: 'https://firma.sea.gob.cl/publicaciones/eb/39/2145128410.pdf',
    phase: 'Operación',
    trackingStart: '2025-11-01',
  },
  {
    id: 'tablada',
    name: 'Regularización Bodega de Vinos La Tablada',
    shortName: 'Bodega La Tablada',
    titular: 'Servicios y Gestiones Vitivinícolas Ltda.',
    rubro: 'Vitivinícola',
    comuna: 'Río Claro', region: 'Maule',
    instrument: 'DIA',
    rcaLabel: 'RCA Comisión de Evaluación del Maule, 2019',
    sourceUrl: 'https://firma.sea.gob.cl/publicaciones/d6/19/2143717915.pdf',
    phase: 'Operación',
    trackingStart: '2026-10-01',
  },
];

const G = 'guerrico', E = 'estampa', T = 'tablada';

export const SEED_OBLIGATIONS: Obligation[] = [
  // ——— Áridos Río Cachapoal ———
  {
    id: 'g-topo-mensual', projectId: G, source: 'rca', confirmed: true,
    title: 'Autocontrol topográfico mensual',
    plain: 'Medir cada mes la topografía del área de extracción para controlar volumen y profundidad.',
    component: 'Suelo y cauce', recipient: 'Interno',
    frequency: { kind: 'monthly' },
    quote: 'se debe realizar un autocontrol topográfico mensual',
    section: '4.3.2 Fase de Operación · Producción',
    evidence: 'Levantamiento topográfico firmado por el topógrafo',
    responsible: 'Jefe de faena',
  },
  {
    id: 'g-doh-volumen', projectId: G, source: 'rca', confirmed: true,
    title: 'Registro de volúmenes extraídos a la DOH',
    plain: 'Entregar cada trimestre a la Dirección de Obras Hidráulicas el registro de metros cúbicos extraídos.',
    component: 'Suelo y cauce', recipient: 'DOH',
    frequency: { kind: 'quarterly', dueMonth: 3 },
    quote: 'presenta de forma trimestral a la Dirección de Obras Hidráulicas',
    section: '4.3.2 Fase de Operación · Plan de Monitoreo',
    evidence: 'Carta conductora con timbre de recepción DOH',
    responsible: 'Encargado ambiental',
  },
  {
    id: 'g-doh-topo', projectId: G, source: 'rca', confirmed: true,
    title: 'Controles topográficos a la DOH',
    plain: 'Enviar cada trimestre a la DOH los controles topográficos del período.',
    component: 'Suelo y cauce', recipient: 'DOH',
    frequency: { kind: 'quarterly', dueMonth: 3 },
    quote: 'se entrega en forma trimestral los controles topográficos a la DOH',
    section: '4.3.2 Fase de Operación · Plan de Monitoreo',
    evidence: 'Informe topográfico y comprobante de envío',
    responsible: 'Encargado ambiental',
  },
  {
    id: 'g-agua-semestral', projectId: G, source: 'rca', confirmed: true,
    title: 'Monitoreo de agua aguas arriba y aguas abajo',
    plain: 'Tomar muestras del río antes y después del proyecto, dos veces al año.',
    component: 'Agua', recipient: 'Interno',
    frequency: { kind: 'semiannual', dueMonth: 6 },
    quote: 'un monitoreo semestral aguas arriba y aguas abajo en relación con la ubicación del Proyecto.',
    section: '4.3.2 Fase de Operación · Plan de Monitoreo',
    details: ['pH', 'Conductividad', 'Sólidos suspendidos', 'Sólidos totales', 'Temperatura', 'Oxígeno disuelto'],
    evidence: 'Informe de laboratorio con cadena de custodia',
    responsible: 'Encargado ambiental',
  },
  {
    id: 'g-horometro-sma', projectId: G, source: 'rca', confirmed: true,
    title: 'Horas de funcionamiento del generador a la SMA',
    plain: 'Informar una vez al año a la Superintendencia las horas que funcionó el generador, según el horómetro.',
    component: 'Aire', recipient: 'SMA',
    frequency: { kind: 'annual', dueMonth: 1, dueDay: 31 },
    quote: 'anualmente el Titular informa a la Superintendencia del Medio Ambiente',
    section: '5.1 a) Emisiones atmosféricas · Etapa de Operación',
    evidence: 'Foto del horómetro y comprobante del Sistema de Seguimiento Ambiental',
    responsible: 'Encargado ambiental',
  },
  {
    id: 'g-humectacion', projectId: G, source: 'rca', confirmed: true,
    title: 'Registro de humectación de caminos',
    plain: 'Mojar los caminos al menos dos veces al día y respaldar el registro cada semana.',
    component: 'Aire', recipient: 'Interno',
    frequency: { kind: 'weekly', weekday: 0 },
    quote: 'Se considera como mínimo una humectación de 2 veces al día.',
    section: '5.1 a) Emisiones atmosféricas · Etapa de Operación',
    evidence: 'Planilla diaria de humectación con fotos del camión aljibe',
    responsible: 'Jefe de faena',
  },
  {
    id: 'g-compensacion', projectId: G, source: 'rca', confirmed: true,
    title: 'Plan de compensación de emisiones MP10',
    plain: 'Presentar el plan para compensar el 120% de las emisiones de MP10, un mes después de la RCA.',
    component: 'Aire', recipient: 'SEREMI de Salud',
    frequency: { kind: 'once', date: '2020-05-04' },
    quote: 'El plan de compensación es entregado 1 mes después de obtenida la RCA del Proyecto',
    section: '4.3.2 Fase de Operación · Emisiones y efluentes',
    evidence: 'Resolución que aprueba el plan',
  },
  {
    id: 'g-cuota', projectId: G, source: 'rca', confirmed: true,
    title: 'Cuota máxima de 8.000 m³ al mes',
    plain: 'No extraer más de 8.000 metros cúbicos en un mes.',
    component: 'Suelo y cauce', recipient: 'Interno',
    frequency: { kind: 'continuous' },
    quote: 'una cuota mensual de extracción de 8.000 m3',
    section: '4.3.2 Fase de Operación · Producción',
    evidence: 'Autocontrol topográfico mensual',
  },
  {
    id: 'g-profundidad', projectId: G, source: 'rca', confirmed: true,
    title: 'No extraer bajo el lecho actual del río',
    plain: 'La extracción no puede superar la profundidad actual del lecho.',
    component: 'Suelo y cauce', recipient: 'Interno',
    frequency: { kind: 'continuous' },
    quote: 'no supera la profundidad actual del lecho del río',
    section: '4.3.2 Fase de Operación',
    evidence: 'Señalética de profundidad y controles topográficos',
  },
  {
    id: 'g-alerta', projectId: G, source: 'rca', confirmed: true,
    title: 'Reforzar control de polvo en alerta ambiental',
    plain: 'Si la autoridad declara alerta ambiental, reforzar todas las medidas de control de polvo.',
    component: 'Aire', recipient: 'Interno',
    frequency: { kind: 'event', hoursAfterEvent: 24 },
    quote: 'En el caso de alerta ambiental se refuerzan los controles de todas estas medidas.',
    section: '5.1 a) Emisiones atmosféricas',
    evidence: 'Registro de humectación reforzada del día de alerta',
  },

  // ——— Viña Estampa ———
  {
    id: 'e-ril-muestra', projectId: E, source: 'rca', confirmed: true,
    title: 'Monitoreo mensual del RIL',
    plain: 'Llevar la planilla diaria de pH y caudal, y tomar una muestra al mes antes del riego para un laboratorio autorizado (caudal, pH, temperatura y parámetros químicos).',
    component: 'Agua', recipient: 'Interno',
    frequency: { kind: 'monthly', dueDay: 20 },
    quote: 'los cuales se realizarán 1 muestra puntual mensual, siendo tomada desde la válvula de monitoreo antes de salir al riego.',
    section: '4.3.2.2 Acciones · Programa de autocontrol',
    details: ['Caudal', 'pH', 'Temperatura', 'DBO5', 'Sólidos suspendidos biodegradables', 'Sólidos suspendidos totales', 'Aceites y grasas', 'Detergentes SAAM', 'Fenoles'],
    evidence: 'Certificado del laboratorio y planilla diaria de pH y caudal',
    responsible: 'Jefe de bodega',
  },
  {
    id: 'e-ril-sma', projectId: E, source: 'rca', confirmed: true,
    title: 'Reporte del autocontrol RIL a la SMA',
    plain: 'Subir a la plataforma de la SMA los resultados del laboratorio, a más tardar un mes después del certificado.',
    component: 'Agua', recipient: 'SMA',
    frequency: { kind: 'monthly', lagMonths: 1 },
    quote: 'con un desfase máximo de 1 mes a partir del momento de emisión de los certificados.',
    section: '4.3.2.2 Acciones · Programa de autocontrol',
    evidence: 'Comprobante de carga en la plataforma de la SMA',
    responsible: 'Encargado ambiental',
  },
  {
    id: 'e-suelo', projectId: E, source: 'rca', confirmed: true,
    title: 'Análisis de suelo anual',
    plain: 'Analizar el suelo regado una vez al año, antes de la temporada alta.',
    component: 'Suelo y cauce', recipient: 'Interno',
    frequency: { kind: 'annual', dueMonth: 2, dueDay: 15 },
    quote: 'Se realiza de manera anual antes de entrar en temporada alta, un análisis del suelo',
    section: 'Monitoreo de suelos',
    evidence: 'Informe de análisis de suelo',
    responsible: 'Agrónomo',
  },
  {
    id: 'e-tranque', projectId: E, source: 'rca', confirmed: true,
    title: 'Limpieza anual del tranque',
    plain: 'Limpiar el tranque de acumulación una vez al año, antes de la vendimia.',
    component: 'Agua', recipient: 'Interno',
    frequency: { kind: 'annual', dueMonth: 1, dueDay: 31 },
    quote: 'La limpieza del tranque se efectúa anualmente, antes de la vendimia de cada año,',
    section: '4.3.2.1 viii. Sistema de acumulación',
    evidence: 'Fotos antes y después, y orden de trabajo',
    responsible: 'Jefe de bodega',
  },
  {
    id: 'e-respel', projectId: E, source: 'rca', confirmed: true,
    title: 'Retiro de residuos peligrosos',
    plain: 'Retirar los residuos peligrosos de la bodega antes de cumplir 6 meses almacenados.',
    component: 'Residuos', recipient: 'Interno',
    frequency: { kind: 'semiannual', dueMonth: 6 },
    quote: 'son retirados cada antes de 6 meses.',
    section: '4.3.2.6 Emisiones, efluentes, residuos',
    evidence: 'Comprobante de retiro de la empresa autorizada',
    responsible: 'Encargado ambiental',
  },
  {
    id: 'e-dbo', projectId: E, source: 'rca', confirmed: true,
    title: 'Carga máxima de 112 kg/ha/día de DBO5',
    plain: 'El riego con RIL nunca puede aplicar más de 112 kg de DBO5 por hectárea al día.',
    component: 'Agua', recipient: 'Interno',
    frequency: { kind: 'continuous' },
    section: 'Programa de autocontrol · cargas máximas',
    evidence: 'Cálculo de carga en la planilla de control',
  },

  // ——— Bodega La Tablada (extraído automáticamente, pendiente de revisión) ———
  {
    id: 't-olores-mensual', projectId: T, source: 'rca', confirmed: false,
    title: 'Informe mensual de reclamos por olores',
    plain: 'Preparar cada mes un informe con los reclamos de olor recibidos y cómo se respondieron.',
    component: 'Olores', recipient: 'SEREMI de Salud',
    frequency: { kind: 'monthly' },
    section: '9.1 Plan de manejo de olores',
    evidence: 'Informe mensual y registro de reclamos',
  },
  {
    id: 't-olores-sma', projectId: T, source: 'rca', confirmed: false,
    title: 'Informe semestral de olores a la SMA',
    plain: 'Enviar a la SMA el informe de olores dos veces al año.',
    component: 'Olores', recipient: 'SMA',
    frequency: { kind: 'semiannual', dueMonth: 6 },
    section: '9.1 Plan de manejo de olores',
    evidence: 'Comprobante del Sistema de Seguimiento Ambiental',
  },
  {
    id: 't-ril-semestral', projectId: T, source: 'rca', confirmed: false,
    title: 'Ensayos de RIL, uno en vendimia y otro fuera',
    plain: 'Muestrear el RIL a la salida del filtro y en el punto de riego, dos veces al año.',
    component: 'Agua', recipient: 'Interno',
    frequency: { kind: 'semiannual', dueMonth: 4 },
    section: '6.1.2',
    evidence: 'Informe de laboratorio',
  },
  {
    id: 't-tranque-marzo', projectId: T, source: 'rca', confirmed: false,
    title: 'Bajar el tranque al 20% al terminar el riego',
    plain: 'En marzo, dejar el tranque con solo un 20% de su capacidad.',
    component: 'Agua', recipient: 'Interno',
    frequency: { kind: 'annual', dueMonth: 3, dueDay: 31 },
    section: '10.1.1',
    evidence: 'Registro del volumen almacenado',
  },
  {
    id: 't-contingencia', projectId: T, source: 'rca', confirmed: false,
    title: 'Informe preliminar de contingencia a la SMA',
    plain: 'Si ocurre una emergencia o contingencia, avisar a la SMA en un máximo de 48 horas.',
    component: 'Administrativo', recipient: 'SMA',
    frequency: { kind: 'event', hoursAfterEvent: 48 },
    section: '8.1 Programa de control de contingencias',
    evidence: 'Comprobante de envío del informe preliminar',
  },
  {
    id: 't-hallazgo', projectId: T, source: 'rca', confirmed: false,
    title: 'Aviso de hallazgo arqueológico',
    plain: 'Si aparece un hallazgo arqueológico o paleontológico, detener obras y avisar de inmediato al Consejo de Monumentos Nacionales.',
    component: 'Patrimonio', recipient: 'CMN',
    frequency: { kind: 'event', hoursAfterEvent: 24 },
    section: '7.9 Ley 17.288',
    evidence: 'Carta al CMN',
  },
];

// Ventanilla Única: Guerrico tiene generador y residuos; Estampa genera lodos, residuos peligrosos y vende botellas.
export const SEED_VENTANILLA: Obligation[] = [
  ...ventanillaObligations(G, { residuos12t: false, fuentesFijas: true, respel: false, sustPeligrosas: false, envases300kg: false }),
  ...ventanillaObligations(E, { residuos12t: true, fuentesFijas: false, respel: true, sustPeligrosas: false, envases300kg: true }),
];

const EVIDENCE_NAMES: Record<string, (due: string) => string> = {
  'g-topo-mensual': (d) => `Topografia_${d.slice(0, 7)}.pdf`,
  'g-doh-volumen': (d) => `Carta_DOH_volumenes_${d.slice(0, 7)}.pdf`,
  'g-doh-topo': (d) => `Controles_topograficos_${d.slice(0, 7)}.pdf`,
  'g-agua-semestral': (d) => `Informe_lab_agua_${d.slice(0, 7)}.pdf`,
  'g-horometro-sma': () => 'Horometro_generador.jpg',
  'g-humectacion': (d) => `Humectacion_semana_${d}.jpg`,
  'e-ril-muestra': (d) => `Certificado_ETFA_${d.slice(0, 7)}.pdf`,
  'e-ril-sma': (d) => `Comprobante_SMA_${d.slice(0, 7)}.pdf`,
};

/**
 * Historial plausible para la demo: casi todo lo vencido está cumplido a tiempo,
 * con una excepción deliberada (el reporte RIL a la SMA del período anterior).
 */
export function seedCompletions(today: string): { completions: Completion[]; events: EventLog[] } {
  const obligations = [...SEED_OBLIGATIONS, ...SEED_VENTANILLA].filter((o) => o.confirmed);
  const occ = buildOccurrences({
    projects: SEED_PROJECTS, obligations, completions: [], today,
    from: addDays(today, -400), to: today,
  });
  const pastByOb = new Map<string, string[]>();
  for (const o of occ) {
    if (o.due >= today) continue;
    const list = pastByOb.get(o.obligation.id) ?? [];
    list.push(o.due);
    pastByOb.set(o.obligation.id, list);
  }
  const lastSmaReport = (pastByOb.get('e-ril-sma') ?? []).at(-1);
  const completions: Completion[] = [];
  let n = 0;
  for (const o of occ) {
    if (o.due >= today) continue;
    if (o.obligation.id === 'e-ril-sma' && o.due === lastSmaReport) continue; // vencido a propósito
    n += 1;
    const early = 1 + (n * 7) % 6;
    const late = o.obligation.id === 'g-horometro-sma' && daysBetween(o.due, today) > 200 ? -3 : 0; // un atraso histórico
    const completedAt = addDays(o.due, -early - late);
    const name = EVIDENCE_NAMES[o.obligation.id]?.(o.due);
    completions.push({
      obligationId: o.obligation.id, due: o.due, completedAt: `${completedAt}T12:00:00`,
      by: o.obligation.responsible ?? 'Encargado ambiental',
      evidence: name ? [{ id: `ev-${n}`, name, kind: name.endsWith('.pdf') ? 'pdf' : name.endsWith('.jpg') ? 'image' : 'other' }] : [],
    });
  }
  return { completions, events: [] };
}
