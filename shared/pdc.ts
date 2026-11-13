/**
 * Lector de Programas de Cumplimiento (PdC) aprobados por la SMA. Sin IA: solo reglas.
 *
 * Un PdC no se parece a una RCA: es una lista de acciones numeradas, cada una con su plazo, y un plan de
 * seguimiento con tres reportes (inicial, de avance y final) que se cargan en el SPDC. Los plazos casi
 * siempre corren desde la notificación de la resolución que aprueba el programa, así que el lector
 * necesita esa fecha (`base`) para ponerlos en el calendario. Si no se conoce, usa la fecha de carga y
 * lo dice en cada compromiso.
 *
 * Reconoce los tres formatos que usa la SMA:
 *   1. Guía general: tabla de acciones con "Fecha de Inicio / Fecha de Término" y "3. PLAN DE SEGUIMIENTO".
 *   2. Simplificado por fichas (ruido, D.S. 38): "N° Identificador N", casillas ☒ y "Plazo de Ejecución".
 *   3. Simplificado por tabla (riles, D.S. 90): columnas "ACCIONES | PLAZO DE EJECUCIÓN | …".
 */
import type { Component, Frequency, FrequencyKind, Obligation } from './types';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n - 1) > n * 0.6 ? s.lastIndexOf(' ', n - 1) : n - 1)}…`);

const NUM_WORDS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, dieciocho: 18, diecinueve: 19, veinte: 20, veinticuatro: 24, treinta: 30 };
const MONTH_N: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const TENS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60 };
const UNITS_ES: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
/** "diecinueve" → 19, "veintiséis" → 26, "treinta y cuatro" → 34, "19" → 19, "diez (10)" → 10. */
export function esNumber(raw: string): number | undefined {
  const w = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(\s*\d+\s*\)/g, '').trim();
  if (/^\d{1,3}$/.test(w)) return Number(w);
  const direct = Object.entries(NUM_WORDS).find(([k]) => k === w);
  if (direct) return direct[1];
  const v = w.match(/^veinti(\w+)$/); if (v && UNITS_ES[v[1].replace(/^s(?=e)/, '')] !== undefined) return 20 + UNITS_ES[v[1]];
  if (v && UNITS_ES[v[1]]) return 20 + UNITS_ES[v[1]];
  const t = w.match(/^(\w+)\s+y\s+(\w+)$/); if (t && TENS[t[1]] && UNITS_ES[t[2]]) return TENS[t[1]] + UNITS_ES[t[2]];
  return TENS[w];
}
const NUM = String.raw`(?:(\d{1,3})|(${Object.keys(NUM_WORDS).join('|')})(?:\s*\(\d+\))?)`;
const UNIT = String.raw`(d[ií]as?\s+h[aá]biles|d[ií]as?(?:\s+corridos)?|semanas?|mes(?:es)?)`;
/** "15 días hábiles contados desde la fecha de notificación…", "3 meses a partir de la aprobación…". */
const PLAZO = new RegExp(String.raw`${NUM}\s+${UNIT}[\s,]+(?:contados?\s+)?(?:desde|a\s+partir\s+de|a\s+contar\s+de|del?)\s+(?:el\s+plazo\s+de\s+|la\s+fecha\s+de\s+)?(?:la\s+)?(?:notificaci[oó]n|aprobaci[oó]n)`, 'gi');

export interface Term { n: number; unit: 'habiles' | 'dias' | 'semanas' | 'meses'; text: string; index: number }

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Suma un plazo a una fecha. Los días hábiles de la SMA son de lunes a viernes (no descuenta feriados). */
export function addTerm(base: string, t: Pick<Term, 'n' | 'unit'>): string {
  const d = new Date(`${base}T00:00:00Z`);
  if (t.unit === 'meses') d.setUTCMonth(d.getUTCMonth() + t.n);
  else if (t.unit === 'semanas') d.setUTCDate(d.getUTCDate() + 7 * t.n);
  else if (t.unit === 'dias') d.setUTCDate(d.getUTCDate() + t.n);
  else for (let left = t.n; left > 0;) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() % 6) left--; }
  return iso(d);
}

function terms(text: string): Term[] {
  const out: Term[] = [];
  for (const m of text.matchAll(PLAZO)) {
    const line = text.slice(text.lastIndexOf('\n', m.index!) + 1, m.index!);
    if (line.includes('☐') && !line.includes('☒')) continue; // opción de la plantilla que no se marcó
    const n = m[1] ? Number(m[1]) : NUM_WORDS[m[2].toLowerCase()];
    const u = m[3].toLowerCase();
    out.push({ n, unit: /h[aá]biles/.test(u) ? 'habiles' : u.startsWith('d') ? 'dias' : u.startsWith('s') ? 'semanas' : 'meses', text: clean(m[0]), index: m.index! });
  }
  return out;
}

const COMPONENTS: [RegExp, Component][] = [
  [/SPDC|reporte\s+final|medios\s+de\s+verificaci[oó]n\s+comprometidos|Sistema\s+de\s+Evaluaci[oó]n|RCA|Resoluci[oó]n\s+de\s+Calificaci/i, 'Administrativo'],
  [/ruido|ac[uú]stic|presi[oó]n\s+sonora|silenciador/i, 'Ruido'],
  [/olor|purin|digestato/i, 'Olores'],
  [/\briles?\b|monitoreo|efluente|descarga|D\.?S\.?\s*N?°?\s*90|par[aá]metro/i, 'Agua'],
  [/lodo|residuo/i, 'Residuos'],
  [/polvo|emisi|humect/i, 'Aire'],
  [/cauce|suelo|[aá]ridos|extracci[oó]n/i, 'Suelo y cauce'],
  [/flora|fauna|vegetaci|reforest/i, 'Biodiversidad'],
];
const componentOf = (s: string): Component => COMPONENTS.find(([re]) => re.test(s))?.[1] ?? 'Administrativo';

interface Action { id?: string; text: string; term?: Term; end?: string; whole?: boolean; evidence?: string }

/** ¿Es un programa de cumplimiento? Sirve para elegir el lector aunque el documento se haya cargado con otro tipo. */
export function looksLikePdc(text: string): boolean {
  const head = text.slice(0, 20000);
  return /programa\s+de\s+cumplimiento/i.test(head) && (/ACCIONES\s+COMPROMETIDAS|PLAN\s+DE\s+ACCIONES\s+Y\s+METAS|PLAZO\s+DE\s+EJECUCI[OÓ]N|N[°º]\s*Identificador/i.test(text));
}

const INFINITIVE = /^(?!Lugar|Primer|Tercer|Ayer|Mujer|Taller|Por\s)[A-ZÁÉÍÓÚ][a-záéíóúñ]+(ar|er|ir)(se)?\s+\S/;
const TEMPLATE = /^\[|^\(|Indique|Copie\s+ac[aá]|Seleccione\s+con|Marque\s+una/i;

/** Formato por fichas: cada "N° Identificador N" es una acción. */
function cardActions(text: string): Action[] {
  const parts = text.split(/N[°º]\s*Identificador\s+(\d{1,2})\b/i);
  const out: Action[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const seg = parts[i + 1].split(/\n\s*\d\.\s+[A-ZÁÉÍÓÚ ]{8,}:?\s*\n/)[0];
    const cutAt = seg.search(/Plazo\s+de\s+Ejecuci[oó]n|Costo\s+Estimado/i);
    const head = cutAt > 0 ? seg.slice(0, cutAt) : seg;
    const checked = [...head.matchAll(/☒\s*([^☐☒]+)/g)].map((m) => clean(m[1]));
    let desc = checked.map((c) => {
      const other = c.match(/^Otras\s+medidas[^:]*\):\s*(.+)$/i);
      return other ? other[1] : c.split(/:\s/)[0];
    }).join('; ');
    if (!desc) desc = clean(head.replace(/^[\s\S]*?\(Acci[oó]n\s+obligatoria\)\.?/i, '').replace(/^\s*Acci[oó]n(es)?(\s+y\s+descripci[oó]n\s+de\s+la\s+Acci[oó]n)?\.?/i, ''));
    desc = desc.replace(/^N[úu]meros\s+correlativos\s*\([^)]*\)\s*Acci[oó]n\s+y\s+descripci[oó]n\s+de\s+la\s+Acci[oó]n\s*/i, '');
    if (!desc || TEMPLATE.test(desc)) continue;
    const after = cutAt > 0 ? seg.slice(cutAt) : '';
    const t = terms(after)[0] ?? terms(head)[0];
    const ev = after.match(/Medios\s+de\s+Verificaci[oó]n\.?\s*([\s\S]{20,400}?)(?=Comentarios|N[°º]\s*Identificador|$)/i)?.[1];
    out.push({ id: parts[i], text: desc, term: t, evidence: ev && !/☐|Marque/.test(ev) ? clean(ev) : undefined });
  }
  return out;
}

/** Formato por tabla: la acción es el párrafo que parte con un verbo en infinitivo antes de cada plazo. */
function tableActions(text: string): Action[] {
  const lines = text.split('\n');
  const starts: number[] = []; let pos = 0;
  for (const l of lines) { starts.push(pos); pos += l.length + 1; }
  const lineAt = (idx: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo; };
  const out: Action[] = [];
  let prevLine = 0;
  for (const t of terms(text)) {
    const end = lineAt(t.index);
    let begin = -1;
    for (let k = end - 1; k >= Math.max(prevLine, end - 45); k--) {
      if (/^(ACCIONES\s+PLAZO|MEDIOS\s+DE\s+VERIFICACI|HECHO\s+QUE|EFECTOS\s+NEGATIVOS)/.test(lines[k])) break;
      if (INFINITIVE.test(lines[k]) && !TEMPLATE.test(lines[k])) { begin = k; break; }
    }
    prevLine = end + 1;
    if (begin < 0) continue;
    const body = clean(lines.slice(begin, end).join(' ').split(/Indicador\s+de\s+cumplimiento:/i)[0]);
    if (body.length < 15) continue;
    const ev = clean(lines.slice(end, end + 14).join(' ')).match(/En\s+el\s+reporte\s+final[^.[]{10,300}/i)?.[0];
    out.push({ text: body, term: t, evidence: ev && clean(ev) });
  }
  return out;
}

/** Formato de la guía general: los nombres de las acciones salen limpios en el plan de seguimiento. */
function guideActions(text: string): Action[] {
  const byId = new Map<string, Action>();
  for (const m of text.matchAll(/N[°º]\s*Identificador\s+Acci[oó]n\s+a\s+reportar\s*\n([\s\S]*?)(?=\n\s*3\.\d\s+REPORTE|\n\s*(IV?|VI?)\.\s|\n\s*4\.\s*CRONOGRAMA|$)/gi)) {
    const body = m[1].replace(/\n\s*\d{1,3}\s*\n[\dA-Z-]{6,}[^\n]*v\.\s*\d+[^\n]*/g, ''); // pie de página
    for (const a of body.matchAll(/(?:^|\n)(\d{1,2})\s*\n?\s*([A-ZÁÉÍÓÚ"“][\s\S]*?)(?=\n\d{1,2}\s*\n?\s*[A-ZÁÉÍÓÚ"“]|$)/g)) {
      if (!byId.has(a[1])) byId.set(a[1], { id: a[1], text: clean(a[2]).replace(/\.$/, '') });
    }
  }
  // Plazo de cada acción: lo que sigue a "Fecha de Término:" en la ficha que parte con "<n> Acción".
  for (const m of text.matchAll(/(?:^|\n)(\d{1,2})\s*\n?\s*Acci[oó]n\b([\s\S]{0,700})/g)) {
    const a = byId.get(m[1]); if (!a || a.end || a.whole || a.term) continue;
    const fin = m[2].match(/Fecha\s+(?:de\s*)?\n?\s*T[eé]rmino:?\s*([\s\S]{0,160})/i)?.[1];
    if (!fin) continue;
    const flat = clean(fin);
    const rel = flat.match(new RegExp(String.raw`^${NUM}\s+meses`, 'i'));
    const abs = flat.match(/^(?:(\d{1,2})\s+de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|sep?tiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(20\d\d)/i);
    if (/^Durante\s+toda\s+la\s+vigencia/i.test(flat)) a.whole = true;
    else if (rel) a.term = { n: rel[1] ? Number(rel[1]) : NUM_WORDS[rel[2].toLowerCase()], unit: 'meses', text: clean(flat.match(/^[^.]{0,90}/)![0]), index: m.index! };
    else if (abs) {
      const mo = MONTH_N[abs[2].toLowerCase()], y = Number(abs[3]);
      a.end = `${y}-${pad(mo)}-${pad(abs[1] ? Number(abs[1]) : new Date(Date.UTC(y, mo, 0)).getUTCDate())}`;
    }
  }
  return [...byId.values()].sort((x, y) => Number(x.id) - Number(y.id));
}

const PERIODS: [RegExp, FrequencyKind, string][] = [
  [/Semanal/i, 'weekly', 'semanal'], [/Bimensual/i, 'monthly', 'quincenal'], [/Mensual/i, 'monthly', 'mensual'],
  [/Bimestral/i, 'bimonthly', 'bimestral'], [/Trimestral/i, 'quarterly', 'trimestral'], [/Semestral/i, 'semiannual', 'semestral'],
];

export interface PdcReading { obligations: Obligation[]; format: 'guia' | 'fichas' | 'tabla' | 'ninguno'; actions: number; totalMonths?: number }

/**
 * Lee un PdC y devuelve un compromiso por acción con plazo más los reportes del plan de seguimiento.
 * `base` es la fecha (ISO) de notificación de la resolución que aprueba el programa.
 */
export function readPdc(text: string, projectId: string, base: string, baseKnown = false): PdcReading {
  const guide = guideActions(text);
  const cards = guide.length ? [] : cardActions(text);
  const table = guide.length || cards.length ? [] : tableActions(text);
  const actions = guide.length ? guide : cards.length ? cards : table;
  const format: PdcReading['format'] = guide.length ? 'guia' : cards.length ? 'fichas' : table.length ? 'tabla' : 'ninguno';
  const note = baseKnown ? '' : ' La fecha se calculó desde hoy: ajústala a la fecha en que te notificaron la aprobación del programa.';
  const out: Obligation[] = [];
  const seen = new Set<string>();
  let n = 0;
  const push = (title: string, plain: string, frequency: Frequency, quote: string, section: string, evidence: string, component: Component = 'Administrativo', recipient: Obligation['recipient'] = 'SMA') => {
    const key = `${title.toLowerCase().slice(0, 50)}|${frequency.kind}|${frequency.date ?? ''}`;
    if (seen.has(key)) return; seen.add(key);
    out.push({ id: `${projectId}-c${++n}`, projectId, title: cut(cap(title), 80), plain, component, recipient, frequency, quote: cut(quote, 400), section, evidence, confirmed: false, source: 'rca' });
  };

  let last = '';
  for (const a of actions) {
    const title = a.text.split(/(?<=[a-záéíóúñ)])\.\s|:\s|;\s/)[0];
    const section = a.id ? `PdC acción ${a.id}` : 'PdC';
    const isReport = /reporte\s+final|medios\s+de\s+verificaci[oó]n\s+comprometidos|reportes\s+y\s+medios/i.test(a.text);
    const evidence = a.evidence ? cut(a.evidence, 200) : 'Medios de verificación comprometidos en el PdC';
    const comp = componentOf(a.text);
    const recipient = /SPDC|Superintendencia|SMA/.test(a.text) ? 'SMA' : 'Interno';
    if (a.whole) { push(title, `Acción del programa de cumplimiento que rige durante toda su vigencia. ${cut(a.text, 200)}`, { kind: 'continuous' }, a.text, section, evidence, comp, recipient); continue; }
    const date = a.end ?? (a.term && addTerm(base, a.term));
    if (date && date > last) last = date;
    if (isReport && !a.term) continue; // el reporte final se arma más abajo, con su plazo
    push(title, a.term ? `Plazo: ${a.term.text} del programa de cumplimiento.${note}` : a.end ? 'Fecha de término comprometida en el programa de cumplimiento.' : 'Acción del programa de cumplimiento. El plazo no se pudo leer: revísalo en el PdC y ponle fecha.',
      { kind: 'once', ...(date ? { date } : {}) }, a.term ? `${a.text} — ${a.term.text}` : a.text, section, evidence, comp, recipient);
  }

  // Plan de seguimiento (formato de la guía general).
  const total = text.match(new RegExp(String.raw`(?:duraci[oó]n|plazo)\s+total[^.]{0,80}?${NUM}\s+meses`, 'i'));
  const totalMonths = total ? (total[1] ? Number(total[1]) : NUM_WORDS[total[2].toLowerCase()]) : undefined;
  if (totalMonths) { const d = addTerm(base, { n: totalMonths, unit: 'meses' }); if (d > last) last = d; }
  const ini = text.match(/REPORTE\s+INICIAL[\s\S]{0,200}?PLAZO\s+DEL\s+REPORTE\s*\n?\s*\(en\s+d[ií]as\s+h[aá]biles\)\s*(\d{1,3})/i);
  if (ini) push('Reporte inicial del programa de cumplimiento', `Cargar en el SPDC el reporte de las acciones ya ejecutadas y en ejecución. Plazo: ${ini[1]} días hábiles desde la notificación de la aprobación.${note}`,
    { kind: 'once', date: addTerm(base, { n: Number(ini[1]), unit: 'habiles' }) }, clean(ini[0]), 'PdC 3.1 Reporte inicial', 'Comprobante de carga en el SPDC');
  const av = text.match(/PERIODICIDAD\s+DEL\s+REPORTE[\s\S]{0,400}?(?=N[°º]\s*Identificador)/i)?.[0];
  if (av) {
    const marked = av.split('\n').map((l) => l.trim()).filter((l) => /\sX$|^X\s/.test(l));
    const p = PERIODS.find(([re]) => marked.some((l) => re.test(l)));
    if (p) push(`Reporte de avance ${p[2]} del programa de cumplimiento`, `Cargar en el SPDC el avance de las acciones en ejecución y por ejecutar, con sus medios de verificación. Periodicidad: ${p[2]}.`,
      { kind: p[1] }, clean(av).slice(0, 300), 'PdC 3.2 Reportes de avance', 'Comprobante de carga en el SPDC');
  }
  const fin = text.match(/REPORTE\s+FINAL[\s\S]{0,200}?(\d{1,3})\s+D[ií]as\s+h[aá]biles\s+a\s+partir\s+de\s+la\s+finalizaci[oó]n[^.\n]*/i)
    ?? (format !== 'guia' && /reporte\s+final/i.test(text) ? text.match(/[^.\n]*\b[uú]nico\s+reporte\s+final[^.]*\./i) : null);
  if (fin && !out.some((o) => /reporte\s+final/i.test(o.title) && o.frequency.date)) {
    const days = fin[1] ? Number(fin[1]) : undefined;
    const date = last && days ? addTerm(last, { n: days, unit: 'habiles' }) : last || undefined;
    push('Reporte final del programa de cumplimiento', `Cargar en el SPDC, en un único reporte, todos los medios de verificación de las acciones.${days ? ` Plazo: ${days} días hábiles desde que termina la acción más larga.` : ''}${note}`,
      { kind: 'once', ...(date ? { date } : {}) }, clean(fin[0]), 'PdC Reporte final', 'Comprobante de carga en el SPDC');
  }
  // Carga del programa en el SPDC: obligatoria en todo PdC aprobado, aunque la tabla no la traiga legible.
  if (format !== 'ninguno' && !out.some((o) => /cargar[\s\S]{0,40}(SPDC|programa)/i.test(`${o.title} ${o.quote}`))) {
    const m = text.match(new RegExp(String.raw`[^.\n]*SPDC[^.]{0,200}?plazo\s+de\s+${NUM}\s+d[ií]as\s+h[aá]biles[^.]*`, 'i'));
    const d = m ? (m[1] ? Number(m[1]) : NUM_WORDS[m[2].toLowerCase()]) : 10;
    push('Cargar el programa de cumplimiento aprobado en el SPDC', `Plazo: ${d} días hábiles desde la notificación de la resolución que aprueba el programa.${note}`,
      { kind: 'once', date: addTerm(base, { n: d, unit: 'habiles' }) }, m ? clean(m[0]) : 'Res. Ex. SMA N° 166/2018: el programa aprobado debe cargarse en el SPDC dentro de 10 días hábiles desde la notificación.', 'PdC', 'Comprobante de carga en el SPDC');
  }
  return { obligations: out, format, actions: actions.length, totalMonths };
}

export const pdcObligations = (text: string, projectId: string, base: string, baseKnown = false) => readPdc(text, projectId, base, baseKnown).obligations;

const WORDNUM = String.raw`((?:\d{1,3})|(?:[a-záéíóúñ]+(?:\s+y\s+[a-záéíóúñ]+)?)(?:\s*\(\d+\))?)`;

/** ¿Es la resolución de la SMA que aprueba un programa de cumplimiento? Fija el plazo total y cuándo se reporta. */
export function looksLikeApproval(text: string): boolean {
  return /RESUELVO/.test(text) && /plazo\s+total\s+fijado/i.test(text) && /programa\s+de\s+cumplimiento/i.test(text);
}

/**
 * Lee la resolución que aprueba el programa: de ahí salen el plazo total, la carga en el SPDC y el reporte final.
 * Todo corre desde la notificación de esa resolución (`base`).
 */
export function readApproval(text: string, projectId: string, base: string, baseKnown = false): PdcReading {
  const part = text.slice(Math.max(0, text.search(/RESUELVO/)));
  const note = baseKnown ? '' : ' La fecha se calculó desde hoy: ajústala a la fecha en que te notificaron la resolución.';
  const out: Obligation[] = [];
  let n = 0;
  const push = (title: string, plain: string, date: string, quote: string, section: string) =>
    out.push({ id: `${projectId}-ap${++n}`, projectId, title, plain, component: 'Administrativo', recipient: 'SMA', frequency: { kind: 'once', date }, quote: cut(clean(quote), 400), section, evidence: 'Comprobante de carga en el SPDC', confirmed: false, source: 'rca' });

  const load = part.match(new RegExp(String.raw`cargar\s+el\s+programa[\s\S]{0,500}?\bSPDC\b[\s\S]{0,200}?plazo\s+de\s+${WORDNUM}\s+d[ií]as\s+h[aá]biles\s+contados\s+desde\s+la\s+notificaci[oó]n`, 'i'));
  const loadDays = load && esNumber(load[1]);
  if (load && loadDays) push('Cargar el programa de cumplimiento aprobado en el SPDC', `Plazo: ${loadDays} días hábiles desde la notificación de la resolución que lo aprueba.${note}`, addTerm(base, { n: loadDays, unit: 'habiles' }), load[0], 'Resolución que aprueba el PdC');

  const tot = part.match(new RegExp(String.raw`plazo\s+total\s+fijado[\s\S]{0,200}?(?:es\s+de|corresponde\s+a)\s+${WORDNUM}\s+meses[^.]*\.`, 'i'));
  const months = tot && esNumber(tot[1]);
  let totalMonths: number | undefined;
  if (tot && months) {
    totalMonths = months;
    const end = addTerm(base, { n: months, unit: 'meses' });
    const fin = part.match(new RegExp(String.raw`[^.]*(?:plazo\s+de\s+${WORDNUM}\s+d[ií]as\s+h[aá]biles\s+desde\s+la\s+finalizaci[oó]n|dentro\s+de\s+un\s+mes\s+contado\s+desde\s+el\s+cumplimiento)[^.]*\.`, 'i'));
    const days = fin && fin[1] ? esNumber(fin[1]) : undefined;
    push('Terminan las acciones del programa de cumplimiento', `Plazo total fijado por la SMA: ${months} meses desde la notificación de la resolución.${note}`, end, tot[0], 'Resolución que aprueba el PdC');
    if (fin) push('Reporte final del programa de cumplimiento', days ? `Cargar el reporte final en el SPDC ${days} días hábiles después de terminar la acción más larga.${note}` : `Cargar el reporte final en el SPDC dentro de un mes desde que vence el plazo total.${note}`,
      days ? addTerm(end, { n: days, unit: 'habiles' }) : addTerm(end, { n: 1, unit: 'meses' }), fin[0], 'Resolución que aprueba el PdC');
  }
  return { obligations: out, format: out.length ? 'guia' : 'ninguno', actions: out.length, totalMonths };
}
