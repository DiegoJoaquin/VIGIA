/**
 * Lector de compromisos por reglas (sin IA) para RCA con la plantilla actual del SEA.
 *
 * Desde ~2019 las RCA traen los compromisos con una estructura fija:
 *   "8°. Que, para ejecutar el Proyecto deben cumplirse las siguientes condiciones o exigencias…"
 *     8.1 Respecto del Oficio … (exigencias de un servicio)
 *   "9. Que, … el Titular del Proyecto propuso los siguientes compromisos ambientales voluntarios:"
 *     9.1. Compromiso ambiental voluntario 1 - Charlas arqueológicas
 *       Impacto asociado / Fase / Objetivo… / Lugar, forma y oportunidad / Indicador… / Forma de control y seguimiento
 *
 * Cada bloque se lee frase por frase: se buscan las que obligan a algo ("deberá", "se realizará", "remitir…")
 * y su frecuencia ("mensual", "permanente (diario)", "cada vez que se incorpore personal"). Las frases de un
 * mismo bloque con la misma frecuencia forman una sola obligación. Todo sale con cita textual.
 */
import type { Component, Frequency, FrequencyKind, Obligation, Recipient } from './types';

const VALIDATOR = /Para validar las firmas de este documento[^\n]*\n?[^\n]*validador\.sea\.gob\.cl[^\n]*/gi;
const HEAD_WORDS = /^(compromiso|respecto|medida|condici[oó]n|exigencia|en\s+relaci[oó]n|sobre|seg[uú]n|del\s+oficio|oficio|plan\s+de|variable|componente|par[aá]metro)/i;
const BLOCK_HEAD = /^\s*(\d{1,2})\s*[°º]?\.(\d{1,2})\.?\s+(\S.*)$/;

const SECTION_START = /que,?\s+para\s+ejecutar\s+el\s+proyecto\s+deben\s+cumplirse|condiciones\s+o\s+exigencias|compromisos?\s+ambientales?\s+voluntarios?/i;
// Termina en el plan de contingencias o en los considerandos finales (sus avisos se leen con standardObligations).
const SECTION_END = /\n\s*1[0-9]\s*[°º]?\.\s*Que,?\s+(Que,?\s+)?(de\s+acuerdo\s+a\s+los\s+antecedentes|el\s+Titular\s+deber[aá]\s+remitir|para\s+que\s+el\s+Titular|con\s+el\s+objeto)|\n\s*RESUELVO/i;

/** Frases que obligan a hacer algo. */
// Nota: en JavaScript \b no reconoce letras acentuadas ("deberá" no termina en \b), por eso el final de
// palabra se escribe (?![a-záéíóúñ\d]).
const DUTY = /\bdeber[aá]n?(?![a-záéíóúñ\d])|\bdebe(n|r[aá])?(?![a-záéíóúñ\d])|\bse\s+(realizar[aá]n?|implementar[aá]n?|instalar[aá]n?|mantendr[aá]n?|efectuar[aá]n?|ejecutar[aá]n?|dispondr[aá]n?|proceder[aá]|llevar[aá]n?|aplicar[aá]n?|contar[aá])(?![a-záéíóúñ\d])|\bser[aá]n?\s+(realizad|remitid|dictad|entregad|informad|instalad)|\bsolicita\s+que(?![a-záéíóúñ\d])|\bse\s+humectar[aá]n?(?![a-záéíóúñ\d])|\bcontar[aá]\s+con(?![a-záéíóúñ\d])|\bse\s+exigir[aá](?![a-záéíóúñ\d])|\bse\s+prohib|\bel\s+titular\s+(realizar|efectuar|implementar|instalar|remitir|entregar|mantendr|ejecutar)[aá]n?(?![a-záéíóúñ\d])/i;
const REPORT = /\bremiti(r|do|da|dos|das|rse|r[aá]n?)(?![a-záéíóúñ\d])|\binforme(s)?(?![a-záéíóúñ\d])|\breporte(s)?(?![a-záéíóúñ\d])|\binformar(se|[aá]n?)?(?![a-záéíóúñ\d])|\benviar(se|[aá]n?)?(?![a-záéíóúñ\d])|\bentregar(se|[aá]n?)?(?![a-záéíóúñ\d])/i;

const FREQ: { kind: FrequencyKind; re: RegExp; adj: string }[] = [
  { kind: 'monthly', re: /mensual|cada\s+mes(?![a-záéíóúñ\d])|una\s+vez\s+al\s+mes|d[ií]as\s+h[aá]biles\s+(luego|despu[eé]s)\s+de\s+terminado\s+el\s+mes/i, adj: 'mensual' },
  { kind: 'bimonthly', re: /bimestral|cada\s+dos\s+meses/i, adj: 'bimestral' },
  { kind: 'quarterly', re: /trimestral|cada\s+tres\s+meses/i, adj: 'trimestral' },
  { kind: 'semiannual', re: /semestral|cada\s+seis\s+meses/i, adj: 'semestral' },
  { kind: 'annual', re: /\banual(mente)?(?![a-záéíóúñ\d])|cada\s+a[nñ]o(?![a-záéíóúñ\d])|una\s+vez\s+al\s+a[nñ]o/i, adj: 'anual' },
  { kind: 'weekly', re: /semanal(mente)?|cada\s+semana/i, adj: 'semanal' },
  { kind: 'event', re: /cada\s+vez\s+que|en\s+caso\s+de|previo\s+al\s+inicio\s+de\s+cada|se\s+incorpore\s+personal|ante\s+(la|el|un|una)\s+(ocurrencia|hallazgo|reclamo)|frente\s+a\s+(un|una)\s+hallazgo/i, adj: 'cada vez' },
  { kind: 'continuous', re: /permanente(mente)?|\(diario\)|diariamente|\bdiari[oa]s?(?![a-záéíóúñ\d])|todos\s+los\s+d[ií]as|en\s+todo\s+momento|durante\s+toda\s+la\s+(fase|etapa)|una\s+vez\s+al\s+d[ií]a|\bkm\/h(?![a-záéíóúñ\d])|en\s+buen\s+estado/i, adj: 'permanente' },
  { kind: 'once', re: /una\s+(sola\s+)?vez(?!\s+al\s+(mes|a[nñ]o|d[ií]a|semestre|trimestre|semana))|al\s+(t[eé]rmino|finalizar|final\s+de)|informe\s+final|previo\s+al\s+inicio\s+de\s+(las\s+)?obras|antes\s+del\s+inicio|posterior\s+a\s+la\s+(obtenci[oó]n\s+de\s+la\s+)?RCA|luego\s+del\s+despeje/i, adj: 'una vez' },
];

const RECIPIENTS: [RegExp, Recipient][] = [
  [/Superintendencia\s+del\s+Medio\s+Ambiente/i, 'SMA'],
  [/\bSMA\b/, 'SMA'],
  [/Consejo\s+de\s+Monumentos|\bCMN\b/, 'CMN'],
  [/SEREMI\s+de\s+Salud|Secretar[ií]a\s+Regional\s+Ministerial\s+de\s+Salud/i, 'SEREMI de Salud'],
  [/Direcci[oó]n\s+de\s+Obras\s+Hidr[aá]ulicas|\bDOH\b/i, 'DOH'],
  [/Servicio\s+de\s+Evaluaci[oó]n\s+Ambiental/i, 'SEA'],
  [/\bSEA\b/, 'SEA'], // en mayúsculas: "sea" también es un verbo ("que sea acorde")
];

const COMPONENT_RULES: [RegExp, Component][] = [
  [/arqueol|paleontol|patrimonio|monumento/i, 'Patrimonio'],
  [/ruido|vibraci/i, 'Ruido'],
  [/emisi[oó]n|polvo|MP\s?10|MP\s?2,?5|humect|material\s+particulado|calidad\s+del\s+aire|gases/i, 'Aire'],
  [/\bril(es)?\b|efluente|aguas?\s+servidas|calidad\s+del\s+agua|napa|acu[ií]fero/i, 'Agua'],
  [/residuo|escombro|basura/i, 'Residuos'],
  [/flora|fauna|vegetaci|especie|nidific|reforest/i, 'Biodiversidad'],
  [/olor/i, 'Olores'],
  [/suelo|cauce|erosi/i, 'Suelo y cauce'],
];

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n - 1) > n * 0.6 ? s.lastIndexOf(' ', n - 1) : n - 1)}…`);

interface Block { num: string; title: string; kind: 'condicion' | 'compromiso'; body: string }

/** Divide la sección de condiciones y compromisos en bloques numerados (8.1, 9.1, 9.2…). */
export function findBlocks(text: string): Block[] {
  const start = text.search(SECTION_START);
  if (start < 0) return [];
  const rest = text.slice(start);
  const endRel = rest.slice(200).search(SECTION_END);
  const section = rest.slice(0, endRel >= 0 ? endRel + 200 : undefined);
  const lines = section.split('\n');
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of lines) {
    const h = BLOCK_HEAD.exec(line);
    // Encabezado real: "9.3. Compromiso…" o "8.1 Respecto del…", no un número dentro de una frase o tabla.
    if (h && HEAD_WORDS.test(h[3])) {
      if (cur) blocks.push(cur);
      const isCav = /^compromiso/i.test(h[3]);
      const t = isCav ? (h[3].replace(/^compromiso\s+ambiental\s+voluntario\s*(n[°º]?\s*)?\d*\s*[-–:.]?\s*/i, '') || h[3]) : h[3];
      cur = { num: `${h[1]}.${h[2]}`, title: clean(t).replace(/\.$/, ''), kind: isCav ? 'compromiso' : 'condicion', body: '' };
      continue;
    }
    if (cur) cur.body += `${line}\n`;
  }
  if (cur) blocks.push(cur);
  return blocks;
}

/** Frases del bloque, sin cruzar los pies de página de validación de firmas (así la cita existe tal cual). */
const LABELS = /Impacto\s+asociado|Fase\s+del\s+Proyecto\s+a\s+la\s*(\n\s*\S+\s*\n)?\s*que\s+aplica|Objetivo,\s+descripci[oó]n\s+y\s+(\n\s*)?justificaci[oó]n|Lugar,\s+forma\s+y\s*\n?\s*oportunidad\s+de\s*\n?\s*implementaci[oó]n|Indicador\s+que\s+acredite\s*\n?\s*su\s+cumplimiento|Forma\s+de\s+control\s+y\s*\n?\s*seguimiento|Referencia\s+a(l\s+ICE|\s+los\s+ICSARA)[^\n]*(\n[^\n]*detalles)?/gi;

/** Quita la justificación: explica por qué, no qué hay que hacer. */
const dropJustification = (body: string) => body.replace(/Justificaci[oó]n:[\s\S]*?(?=Lugar,\s+forma|Lugar:|Forma:|Oportunidad:|Indicador\s+que|$)/i, '¶');

function sentences(body: string): string[] {
  return dropJustification(body)
    .replace(VALIDATOR, '¶')
    .replace(LABELS, '¶')
    .replace(/(?=\b(Lugar|Forma|Oportunidad|Descripci[oó]n|Objetivo):)/g, '¶')
    .split(/¶|(?<=[.;:])\s*\n|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])|\n\s*(?=[-•]\s?[A-ZÁÉÍÓÚÑa-z])|\n\s*(?=[ivx]+\.-)|\n\s*(?=[a-h]\)\s)/)
    .map(clean)
    .filter((s) => s.length > 25 && !/https?:\/\//.test(s));
}

/** Cita textual: el tramo de la frase alrededor de lo que obliga (máximo 200 caracteres, palabras completas). */
function quoteOf(s: string, around?: RegExp): string {
  if (s.length <= 200) return s;
  const m = around ? around.exec(s) : null;
  const center = m ? m.index + m[0].length / 2 : 0;
  let a = Math.max(0, Math.round(center - 100));
  if (a > 0) { const sp = s.indexOf(' ', a); a = sp > 0 ? sp + 1 : a; }
  let b = Math.min(s.length, a + 200);
  if (b < s.length) { const sp = s.lastIndexOf(' ', b); b = sp > a ? sp : b; }
  return s.slice(a, b).trim();
}

/** Nombre corto de lo que se hace en una frase: "Monitoreo paleontológico", "Charlas de inducción paleontológica"… */
function subject(s: string): string | undefined {
  const W = '(?!de\\b|del\\b|que\\b|para\\b|en\\b|debe|deber|ser\\b|ser[aá]\\b|se\\b)[a-záéíóúñ]{4,}';
  const ordered = [
    `monitoreos?\\s+(de\\s+)?${W}`, `charlas?\\s+(de\\s+)?(inducci[oó]n\\s+)?${W}`, `inspecci[oó]n\\s+visual(\\s+${W})?`,
    `plan\\s+de\\s+${W}(\\s+de\\s+${W})?`, `programa\\s+de\\s+${W}`, `registro\\s+de\\s+${W}`, 'humectaci[oó]n', 'libro\\s+de\\s+reclamos',
    `(rescate|relocalizaci[oó]n|reforestaci[oó]n|capacitaci[oó]n|mantenci[oó]n)(\\s+de\\s+${W})?`,
  ];
  for (const p of ordered) {
    const m = new RegExp(p, 'i').exec(s);
    if (m) return cap(clean(m[0]).toLowerCase().replace(/\bmonitoreos\b/, 'monitoreo'));
  }
  return undefined;
}

function frequencyOf(s: string): { kind: FrequencyKind; adj: string } | undefined {
  return kindsOf(s)[0];
}

/** Todas las frecuencias de una frase ("diario… informes mensuales" = permanente + mensual). */
function kindsOf(s: string) {
  const ks = FREQ.filter((f) => f.re.test(s));
  // "previo al inicio de obras y cada vez que se incorpore personal" es un evento, no "una vez".
  return ks.some((k) => k.kind === 'event') ? ks.filter((k) => k.kind !== 'once') : ks;
}

const DUE_DAY = /(\d{1,2})\s*d[ií]as\s+h[aá]biles\s+(luego|despu[eé]s)\s+de\s+terminado\s+el\s+mes/i;

/**
 * Lee las condiciones y compromisos voluntarios de una RCA con la plantilla actual.
 * Devuelve [] si el documento no tiene esa estructura (entonces se usa la IA).
 */
export function ruleObligations(text: string, projectId: string): Obligation[] {
  const out: Obligation[] = [];
  for (const b of findBlocks(text)) {
    const all = sentences(b.body);
    const fieldText = (label: RegExp, next: RegExp) => {
      const body = b.body.replace(VALIDATOR, ' ');
      const i = body.search(label);
      if (i < 0) return '';
      const after = body.slice(i).replace(label, '');
      const j = after.search(next);
      return clean(after.slice(0, j > 0 ? j : 400));
    };
    const indicador = fieldText(/Indicador\s+que\s+acredite\s+(su\s+)?cumplimiento/i, /Forma\s+de\s+control|Referencia\s+a\s+los|$/i);
    const component = COMPONENT_RULES.find(([re]) => re.test(`${b.title} ${b.body}`))?.[1] ?? 'Administrativo';

    // Cuándo se hace según el campo "Oportunidad:", para las frases que no dicen su propia frecuencia.
    const oportunidad = fieldText(/Oportunidad:/i, /\n\s*(Indicador|Forma\s+de\s+control|Se\s+deber[aá])|\.\s*\n/i);
    const inherited = oportunidad ? kindsOf(oportunidad)[0] : undefined;

    // Frases que obligan a algo, con su frecuencia.
    const duties = all
      .filter((s) => DUTY.test(s) || (REPORT.test(s) && frequencyOf(s)))
      .filter((s) => !/^(Objetivo:|Oportunidad:)/i.test(s))
      // Los ítems de una lista de contenidos ("a) Superficie prospectada…") describen el informe, no son tareas.
      .filter((s) => !/^([a-h]\)|[-•])/.test(s) || /\bdeber[aá]n?\b/i.test(s))
      .map((s) => ({ s, kinds: kindsOf(s), report: REPORT.test(s) && /remit|SMA|Superintendencia|CMN|Consejo|SEREMI/i.test(s) }));

    const groups = new Map<FrequencyKind, { s: string; report: boolean; re?: RegExp }[]>();
    const periodicKind = duties.flatMap((d) => (d.report ? d.kinds : [])).find((k) => !['event', 'continuous', 'once'].includes(k.kind));
    for (const d of duties) {
      // Un informe sin frecuencia propia va con el informe periódico del mismo compromiso, si lo hay.
      const ks = d.kinds.length ? d.kinds : d.report && periodicKind ? [periodicKind] : inherited ? [inherited] : [];
      for (const k of ks) groups.set(k.kind, [...(groups.get(k.kind) ?? []), { s: d.s, report: d.report, re: d.kinds.length ? k.re : undefined }]);
    }
    // Si el nombre del compromiso ya dice su frecuencia ("Monitoreo arqueológico permanente"), esa obligación existe.
    const titleKind = kindsOf(b.title)[0];
    if (titleKind && !groups.has(titleKind.kind)) {
      const d = duties.find((x) => !x.report) ?? duties[0];
      if (d) groups.set(titleKind.kind, [{ s: d.s, report: false }]);
    }
    // Un compromiso sin frecuencia escrita es una condición que se cumple mientras dure la fase.
    if (!groups.size) {
      const first = duties[0]?.s ?? all.find((x) => /^(Descripci[oó]n|Forma):/i.test(x)) ?? all[0];
      if (first) groups.set('continuous', [{ s: first, report: false }]);
    }

    let n = 0;
    for (const [kind, ds] of groups) {
      if (n >= 4) break;
      const lead = ds.find((d) => d.report && kind !== 'continuous') ?? ds.find((d) => d.re) ?? ds[0];
      // Destinatario: el primero que nombra la frase del informe ("al CMN y SMA" → CMN).
      const reportText = (ds.find((d) => d.report) ?? lead).s;
      const named = RECIPIENTS.map(([re, r]) => ({ r, at: reportText.search(re) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
      const recipient: Recipient = named[0]?.r ?? (ds.some((d) => d.report) ? 'SMA' : 'Interno');
      const leadSubject = subject(quoteOf(lead.s, lead.re ?? REPORT)) ?? subject(lead.s);
      // En un compromiso manda su nombre, salvo que la frase hable de otra cosa (una charla dentro del monitoreo).
      const sameThing = leadSubject && b.title.toLowerCase().startsWith(leadSubject.split(' ')[0].toLowerCase().replace(/s$/, ''));
      const base = b.kind === 'compromiso' && b.title.length <= 48 && (!leadSubject || sameThing || kind !== 'event') ? cap(b.title)
        : (leadSubject ?? subject(b.title) ?? cap(b.title));
      const adj = FREQ.find((f) => f.kind === kind)!.adj;
      const periodic = !['event', 'continuous', 'once'].includes(kind);
      const hallazgo = kind === 'event' && /hallazgo|restos\s+arqueol|materiales\s+arqueol|identificaci[oó]n\s+y\s+recuperaci[oó]n/i.test(lead.s) && !/charla/i.test(base);
      const title = cut(
        periodic && lead.report ? `${base}: informe ${adj}` :
        hallazgo ? `${base}: si hay hallazgos` :
        kind === 'once' ? `${base}: ${/final/i.test(lead.s) ? 'informe final' : lead.report ? 'informe' : 'una vez'}` : base, 60);

      const frequency: Frequency = { kind };
      if (kind === 'event') frequency.hoursAfterEvent = 24;
      const dd = DUE_DAY.exec(ds.map((d) => d.s).join(' '));
      if (kind === 'monthly' && (dd || /mes\s+(anterior|siguiente)/i.test(ds.map((d) => d.s).join(' ')))) {
        frequency.lagMonths = 1;
        frequency.dueDay = dd ? Math.min(28, Math.round(Number(dd[1]) * 1.4)) : undefined;
      }

      out.push({
        id: `${projectId}-r${b.num.replace('.', '-')}-${kind}`,
        projectId, title,
        plain: cut(lead.s, 240),
        component, recipient, frequency,
        quote: quoteOf(lead.s, lead.re ?? (lead.report ? REPORT : DUTY)),
        section: `${b.num} ${b.kind === 'compromiso' ? `Compromiso voluntario: ${cut(b.title, 40)}` : 'Condición de la RCA'}`,
        evidence: cut(indicador || (lead.report ? 'Informe y comprobante de envío' : 'Registro fechado con fotos'), 120),
        details: ds.length > 1 ? ds.filter((d) => d !== lead).slice(0, 5).map((d) => cut(d.s, 140)) : undefined,
        confirmed: false, source: 'rca',
      });
      n++;
    }
  }
  return dedupeRules(out);
}

/** Quita repetidos entre bloques: una condición del CMN y el compromiso que complementa dicen lo mismo. */
function dedupeRules(list: Obligation[]): Obligation[] {
  const key = (o: Obligation) => o.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return list.filter((o, i) => !list.some((x, j) => j !== i && x.frequency.kind === o.frequency.kind && (
    (key(x) === key(o) && j < i) || (key(x).startsWith(key(o)) && key(x).length > key(o).length)
  )));
}
