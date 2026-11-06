/**
 * Ficha estándar de compromisos de Vigía.
 *
 * Es el mismo formato para todo: lo que lee el sistema automáticamente, lo que una persona
 * levanta a mano desde la RCA en una planilla, y lo que se exporta para la consultora o la SMA.
 * Una fila = una obligación con fecha (o permanente). Las columnas y sus valores están fijos
 * para que dos personas distintas lleguen a la misma matriz.
 */
import type { Component, FrequencyKind, Obligation, Project, Recipient } from './types';

export const COLUMNS = [
  'N°', 'Proyecto', 'Titular', 'Comuna', 'RCA', 'Numeral', 'Tipo', 'Componente', 'Obligación', 'Qué hay que hacer',
  'Frecuencia', 'Día de vencimiento', 'Mes de vencimiento', 'Fecha única', 'Plazo en horas', 'Destinatario',
  'Evidencia', 'Responsable', 'Cita textual de la RCA', 'Revisado',
] as const;
export type Column = (typeof COLUMNS)[number];

/** Qué significa cada columna y qué valores acepta (va en la hoja de instrucciones de la planilla). */
export const COLUMN_HELP: Record<Column, string> = {
  'N°': 'Correlativo. Opcional.',
  Proyecto: 'Nombre del proyecto tal como aparece en la RCA. Igual en todas las filas.',
  Titular: 'Razón social del titular. Igual en todas las filas.',
  Comuna: 'Comuna del proyecto.',
  RCA: 'Número y año de la resolución, ej. "RCA N° 45/2024".',
  Numeral: 'Dónde está en la RCA, ej. "9.3" o "Considerando 7, D.S. 38/2011".',
  Tipo: 'Condición | Compromiso voluntario | Medida | Plan de seguimiento | Norma aplicable | Aviso a la autoridad',
  Componente: 'Aire | Agua | Ruido | Residuos | Suelo y cauce | Olores | Biodiversidad | Patrimonio | Administrativo',
  Obligación: 'Nombre corto (máx. 60 caracteres), ej. "Monitoreo de ruido: informe semestral".',
  'Qué hay que hacer': 'En palabras simples, qué se hace y cómo.',
  Frecuencia: 'Permanente | Semanal | Mensual | Bimestral | Trimestral | Semestral | Anual | Una vez | Cada vez que ocurra',
  'Día de vencimiento': 'Opcional. Día del mes en que vence (1–28). Vacío = último día del período.',
  'Mes de vencimiento': 'Opcional. Para anual: mes en que vence (1–12). Para semestral/trimestral: primer mes del ciclo.',
  'Fecha única': 'Solo para "Una vez": fecha límite AAAA-MM-DD.',
  'Plazo en horas': 'Solo para "Cada vez que ocurra": horas para avisar o actuar (ej. 24).',
  Destinatario: 'SMA | SEA | CMN | SEREMI de Salud | DOH | Interno (si solo se guarda el registro)',
  Evidencia: 'Qué demuestra que se cumplió: informe, comprobante de envío, registro fotográfico…',
  Responsable: 'Opcional. Persona a cargo.',
  'Cita textual de la RCA': 'Copia exacta del párrafo que obliga. Es lo que se muestra al fiscalizador.',
  Revisado: 'Sí / No. "Sí" si una persona ya lo confirmó contra la RCA.',
};

export const FREQUENCY_LABEL: Record<FrequencyKind, string> = {
  continuous: 'Permanente', weekly: 'Semanal', monthly: 'Mensual', bimonthly: 'Bimestral', quarterly: 'Trimestral',
  semiannual: 'Semestral', annual: 'Anual', once: 'Una vez', event: 'Cada vez que ocurra',
};

const COMPONENTS: Component[] = ['Aire', 'Agua', 'Ruido', 'Residuos', 'Suelo y cauce', 'Olores', 'Biodiversidad', 'Patrimonio', 'Administrativo', 'Ventanilla Única'];
const RECIPIENTS: Recipient[] = ['SMA', 'DOH', 'SEA', 'SEREMI de Salud', 'Ventanilla Única', 'CMN', 'Interno'];
export const TYPES = ['Condición', 'Compromiso voluntario', 'Medida', 'Plan de seguimiento', 'Norma aplicable', 'Aviso a la autoridad'] as const;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

/** Tipo de la obligación según dónde está en la RCA. */
export function typeOf(o: Obligation): (typeof TYPES)[number] {
  const s = norm(o.section);
  if (/compromiso/.test(s)) return 'Compromiso voluntario';
  if (/seguimiento/.test(s)) return 'Plan de seguimiento';
  if (/norma aplicable/.test(s)) return 'Norma aplicable';
  if (/medida/.test(s)) return 'Medida';
  if (/condicion/.test(s)) return 'Condición';
  return 'Aviso a la autoridad';
}

/** Una fila de la ficha por obligación. */
export function toRows(project: Project, obligations: Obligation[]): string[][] {
  return obligations.map((o, i) => {
    const f = o.frequency;
    const row: Record<Column, string> = {
      'N°': String(i + 1), Proyecto: project.name, Titular: project.titular, Comuna: project.comuna, RCA: project.rcaLabel,
      Numeral: (o.section ?? '').split(' ')[0], Tipo: typeOf(o), Componente: o.component, Obligación: o.title,
      'Qué hay que hacer': o.plain, Frecuencia: FREQUENCY_LABEL[f.kind],
      'Día de vencimiento': f.dueDay ? String(f.dueDay) : '', 'Mes de vencimiento': f.dueMonth ? String(f.dueMonth) : '',
      'Fecha única': f.date ?? '', 'Plazo en horas': f.hoursAfterEvent ? String(f.hoursAfterEvent) : '',
      Destinatario: o.recipient, Evidencia: o.evidence, Responsable: o.responsible ?? '',
      'Cita textual de la RCA': o.quote ?? '', Revisado: o.confirmed ? 'Sí' : 'No',
    };
    return COLUMNS.map((c) => row[c]);
  });
}

/** CSV que Excel abre bien en Chile: separador ";" y BOM para los acentos. */
export function toCsv(project: Project, obligations: Obligation[]): string {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [COLUMNS as readonly string[], ...toRows(project, obligations)].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}

/** Lee CSV con ";" o "," (Excel en español usa ";"), con comillas y saltos de línea dentro de celdas. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  // El separador se decide con las primeras líneas (la primera puede ser un título sin separadores).
  const head = t.split(/\r?\n/, 6).join('\n');
  const count = (ch: string) => head.split(ch).length - 1;
  const sep = [';', '\t', ','].reduce((a, b) => (count(b) > count(a) ? b : a));
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Encabezados que la gente escribe distinto: todos llevan a la misma columna.
const HEADER_ALIASES: [RegExp, Column][] = [
  [/^(n|no|nro|numero|#|item)\.?°?$/, 'N°'], [/^proyecto|nombre del proyecto/, 'Proyecto'], [/^titular|empresa|razon social/, 'Titular'],
  [/^comuna/, 'Comuna'], [/^rca|resolucion/, 'RCA'], [/^numeral|considerando|seccion|ubicacion/, 'Numeral'], [/^tipo/, 'Tipo'],
  [/^componente|materia/, 'Componente'], [/^obligacion|compromiso$|nombre|titulo/, 'Obligación'],
  [/^que hay que hacer|descripcion|detalle|accion/, 'Qué hay que hacer'], [/^frecuencia|periodicidad/, 'Frecuencia'],
  [/^dia/, 'Día de vencimiento'], [/^mes/, 'Mes de vencimiento'], [/^fecha/, 'Fecha única'], [/^plazo/, 'Plazo en horas'],
  [/^destinatario|a quien|organismo|autoridad/, 'Destinatario'], [/^evidencia|medio de verificacion|indicador|verificador/, 'Evidencia'],
  [/^responsable|encargado/, 'Responsable'], [/^cita|texto|extracto/, 'Cita textual de la RCA'], [/^revisad|confirmad|validad/, 'Revisado'],
];

const FREQ_FROM: [RegExp, FrequencyKind][] = [
  [/permanente|continu|siempre|diari|todo momento/, 'continuous'], [/semanal/, 'weekly'], [/bimestral/, 'bimonthly'],
  [/trimestral/, 'quarterly'], [/semestral/, 'semiannual'], [/mensual|cada mes/, 'monthly'], [/anual|cada ano/, 'annual'],
  [/una vez|unica|unico/, 'once'], [/cada vez|evento|si ocurre|ante|contingencia/, 'event'],
];

export interface SheetIssue { row: number; column?: Column; message: string }

export interface SheetResult {
  project: Pick<Project, 'name' | 'titular' | 'comuna' | 'rcaLabel'>;
  obligations: Obligation[];
  issues: SheetIssue[];
}

/**
 * Convierte una planilla (filas ya leídas) en obligaciones. No descarta en silencio:
 * cada problema queda en `issues` con su fila, y las filas con errores graves no se importan.
 */
export function fromSheet(rows: string[][], projectId: string): SheetResult {
  const issues: SheetIssue[] = [];
  const headerAt = rows.findIndex((r) => r.filter((c) => HEADER_ALIASES.some(([re]) => re.test(norm(c)))).length >= 3);
  if (headerAt < 0) return { project: { name: '', titular: '', comuna: '', rcaLabel: '' }, obligations: [], issues: [{ row: 1, message: 'No encontré la fila de encabezados. Usa la planilla modelo de Vigía.' }] };
  const map = new Map<Column, number>();
  rows[headerAt].forEach((h, i) => {
    const col = HEADER_ALIASES.find(([re]) => re.test(norm(h)))?.[1];
    if (col && !map.has(col)) map.set(col, i);
  });
  for (const need of ['Obligación', 'Frecuencia'] as Column[]) if (!map.has(need)) issues.push({ row: headerAt + 1, column: need, message: `Falta la columna "${need}".` });
  const get = (r: string[], c: Column) => (map.has(c) ? (r[map.get(c)!] ?? '').trim() : '');

  const body = rows.slice(headerAt + 1);
  const project = {
    name: body.map((r) => get(r, 'Proyecto')).find(Boolean) ?? '',
    titular: body.map((r) => get(r, 'Titular')).find(Boolean) ?? '',
    comuna: body.map((r) => get(r, 'Comuna')).find(Boolean) ?? '',
    rcaLabel: body.map((r) => get(r, 'RCA')).find(Boolean) ?? '',
  };
  const obligations: Obligation[] = [];
  body.forEach((r, k) => {
    const n = headerAt + k + 2; // número de fila como lo ve Excel
    const title = get(r, 'Obligación');
    if (!title) { if (r.some((c) => c.trim())) issues.push({ row: n, column: 'Obligación', message: 'Fila sin nombre de obligación: no se importó.' }); return; }
    const fText = norm(get(r, 'Frecuencia'));
    const kind = FREQ_FROM.find(([re]) => re.test(fText))?.[1];
    if (!kind) { issues.push({ row: n, column: 'Frecuencia', message: `Frecuencia "${get(r, 'Frecuencia')}" no reconocida: no se importó.` }); return; }

    const num = (c: Column, min: number, max: number) => {
      const v = get(r, c);
      if (!v) return undefined;
      const x = Number(v.replace(',', '.'));
      if (!Number.isInteger(x) || x < min || x > max) { issues.push({ row: n, column: c, message: `"${v}" debe ser un número entre ${min} y ${max}; se ignoró.` }); return undefined; }
      return x;
    };
    const frequency: Obligation['frequency'] = { kind };
    const dueDay = num('Día de vencimiento', 1, 31); if (dueDay) frequency.dueDay = Math.min(28, dueDay);
    const dueMonth = num('Mes de vencimiento', 1, 12); if (dueMonth) frequency.dueMonth = dueMonth;
    if (kind === 'event') frequency.hoursAfterEvent = num('Plazo en horas', 1, 8760) ?? 24;
    if (kind === 'once') {
      const d = get(r, 'Fecha única');
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.test(d) ? d.replace(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/, (_, a, b, y) => `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`) : '';
      if (iso) frequency.date = iso; else if (d) issues.push({ row: n, column: 'Fecha única', message: `Fecha "${d}" no válida (usa AAAA-MM-DD); quedará sin fecha.` });
    }
    const compText = norm(get(r, 'Componente'));
    const component = COMPONENTS.find((c) => norm(c) === compText) ?? COMPONENTS.find((c) => compText && compText.includes(norm(c).split(' ')[0])) ?? 'Administrativo';
    if (compText && norm(component) !== compText && !compText.includes(norm(component).split(' ')[0])) issues.push({ row: n, column: 'Componente', message: `Componente "${get(r, 'Componente')}" no reconocido; quedó como Administrativo.` });
    const recText = norm(get(r, 'Destinatario'));
    const recipient = RECIPIENTS.find((x) => norm(x) === recText) ?? (/superintendencia|sma/.test(recText) ? 'SMA' : /monumentos|cmn/.test(recText) ? 'CMN' : /seremi|salud/.test(recText) ? 'SEREMI de Salud' : /evaluacion|sea/.test(recText) ? 'SEA' : /doh|obras hidraulicas/.test(recText) ? 'DOH' : 'Interno');
    const tipo = get(r, 'Tipo');
    const numeral = get(r, 'Numeral');
    obligations.push({
      id: `${projectId}-p${k + 1}`, projectId,
      title: title.slice(0, 80), plain: get(r, 'Qué hay que hacer') || title,
      component, recipient, frequency,
      quote: get(r, 'Cita textual de la RCA') || undefined,
      section: [numeral, tipo].filter(Boolean).join(' ') || undefined,
      evidence: get(r, 'Evidencia') || (recipient === 'Interno' ? 'Registro fechado con fotos' : 'Informe y comprobante de envío'),
      responsible: get(r, 'Responsable') || undefined,
      confirmed: /^(si|s|x|ok|1|true)$/.test(norm(get(r, 'Revisado'))),
      source: 'rca',
    });
  });
  if (!obligations.length && !issues.length) issues.push({ row: headerAt + 2, message: 'La planilla no tiene filas con obligaciones.' });
  return { project, obligations, issues };
}
