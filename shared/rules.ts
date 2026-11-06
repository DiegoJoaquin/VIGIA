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
const BLOCK_HEAD = /^\s*(\d{1,2})\s*[°º]?\.(\d{1,2})\.?\s+(\S.*)$/;

const SECTION_START = /que,?\s+para\s+ejecutar\s+el\s+proyecto\s+deben\s+cumplirse|condiciones\s+o\s+exigencias|compromisos?\s+ambiental(es)?\s+voluntarios?/i;
// Termina en el plan de contingencias o en los considerandos finales (sus avisos se leen con standardObligations).
const SECTION_END = /\n\s*1[0-9]\s*[°º]?\.\s*Que,?\s+(Que,?\s+)?(de\s+acuerdo\s+a\s+los\s+antecedentes|el\s+Titular\s+deber[aá]\s+remitir|para\s+que\s+el\s+Titular|con\s+el\s+objeto)|\n\s*RESUELVO/i;

/** Frases que obligan a hacer algo. */
// Nota: en JavaScript \b no reconoce letras acentuadas ("deberá" no termina en \b), por eso el final de
// palabra se escribe (?![a-záéíóúñ\d]).
const DUTY = /\bdeber[aá]n?(?![a-záéíóúñ\d])|\bdebe(n|r[aá])?(?![a-záéíóúñ\d])|\bse\s+(realizar[aá]n?|implementar[aá]n?|instalar[aá]n?|mantendr[aá]n?|efectuar[aá]n?|ejecutar[aá]n?|dispondr[aá]n?|proceder[aá]|llevar[aá]n?|aplicar[aá]n?|contar[aá])(?![a-záéíóúñ\d])|\bser[aá]n?\s+(realizad|remitid|dictad|entregad|informad|instalad)|\bsolicita\s+que(?![a-záéíóúñ\d])|\bse\s+humectar[aá]n?(?![a-záéíóúñ\d])|\bcontar[aá]\s+con(?![a-záéíóúñ\d])|\bse\s+exigir[aá](?![a-záéíóúñ\d])|\bse\s+prohib|\bel\s+titular\s+(realizar|efectuar|implementar|instalar|remitir|entregar|mantendr|ejecutar)[aá]n?(?![a-záéíóúñ\d])/i;
const TO_AUTHORITY = /\b(a|al|ante)\s+(la\s+)?(SMA|Superintendencia|CMN|Consejo\s+de\s+Monumentos|SEREMI)/;
const MONITOR = /monitoreo|medici[oó]n|muestreo|registro|informe|reporte|declaraci[oó]n|declarar|frecuencia|inspecci[oó]n|campa[nñ]a|charla|capacitaci[oó]n|an[aá]lisis|caracterizaci[oó]n|auditor[ií]a|autorizaci[oó]n|permiso|tramit|humectaci[oó]n|aviso|avis(ar|o)|inform(en|ar)/i;
const REPORT = /\bremiti(r|do|da|dos|das|rse|r[aá]n?)(?![a-záéíóúñ\d])|\binforme(s)?(?![a-záéíóúñ\d])|\breporte(s)?(?![a-záéíóúñ\d])|\binformar(se|[aá]n?)?(?![a-záéíóúñ\d])|\benviar(se|[aá]n?)?(?![a-záéíóúñ\d])|\bentregar(se|[aá]n?)?(?![a-záéíóúñ\d])/i;

const FREQ: { kind: FrequencyKind; re: RegExp; adj: string }[] = [
  { kind: 'monthly', re: /mensual|cada\s+mes(?![a-záéíóúñ\d])|una\s+vez\s+al\s+mes|d[ií]as\s+h[aá]biles\s+(luego|despu[eé]s)\s+de\s+terminado\s+el\s+mes/i, adj: 'mensual' },
  { kind: 'bimonthly', re: /bimestral|bimensual|cada\s+(dos|2)\s+meses|periodicidad\s+de\s+(dos|2)\s+meses/i, adj: 'bimestral' },
  { kind: 'quarterly', re: /trimestral|cada\s+tres\s+meses/i, adj: 'trimestral' },
  { kind: 'semiannual', re: /semestral|cada\s+seis\s+meses/i, adj: 'semestral' },
  { kind: 'annual', re: /\banual(mente)?(?![a-záéíóúñ\d])|cada\s+a[nñ]o(?![a-záéíóúñ\d])|una\s+vez\s+al\s+a[nñ]o|cada\s+uno\s+de\s+los\s+\d+\s+a[nñ]os|(la|cada)\s+(temporada|[eé]poca)\s+estival/i, adj: 'anual' },
  { kind: 'weekly', re: /semanal(mente)?|cada\s+semana/i, adj: 'semanal' },
  { kind: 'event', re: /cada\s+vez\s+que|en\s+caso\s+de|previo\s+al\s+inicio\s+de\s+cada|se\s+incorpore\s+personal|ante\s+(la|el|un|una)\s+(ocurrencia|hallazgo|reclamo)|frente\s+a\s+(un|una)\s+hallazgo|(desde|de)\s+(la\s+)?ocurr(encia|ido)\s+(de\s+)?(un|el)\s+evento|antes\s+de\s+iniciar\s+cualquier|previo\s+a\s+(cada|cualquier)\s/i, adj: 'cada vez' },
  { kind: 'continuous', re: /permanente(mente)?|\(diario\)|diariamente|\bdiari[oa]s?(?![a-záéíóúñ\d])|todos\s+los\s+d[ií]as|en\s+todo\s+momento|durante\s+toda\s+la\s+(fase|etapa)|una\s+vez\s+al\s+d[ií]a|\d+\s+veces\s+al\s+d[ií]a|\bkm\/h(?![a-záéíóúñ\d])|en\s+buen\s+estado/i, adj: 'permanente' },
  { kind: 'once', re: /una\s+(sola\s+)?vez(?!\s+(al\s+(mes|a[nñ]o|d[ií]a|semestre|trimestre|semana)|que|[a-záéíóúñ]+(ad|id)[oa]s?(?![a-záéíóúñ])))|al\s+(t[eé]rmino|finalizar|final\s+de)|informe\s+final|previo\s+al\s+inicio\s+de\s+(las?\s+)?(obras|operaci[oó]n|construcci[oó]n|faenas)|antes\s+del\s+inicio|posterior\s+a\s+la\s+(obtenci[oó]n\s+de\s+la\s+)?RCA|luego\s+del\s+despeje|una\s+vez\s+(obtenida|aprobada|notificada|otorgada)\s+(la\s+)?(RCA|resoluci)|\buna\s+(\(1\)\s+)?(campa[nñ]a|medici[oó]n|muestra)\b(?!\s+(anual|semestral|mensual|trimestral))/i, adj: 'una vez' },
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

type BlockKind = 'condicion' | 'compromiso' | 'medida' | 'seguimiento' | 'norma';
interface Block { num: string; title: string; kind: BlockKind; body: string }

// "7°. Que,", "10. Que,", "12.- Que,"
const CONSIDERANDO = /^\s*(\d{1,2})\s*[°º]?\s*\.?-?\s*Que\b/;
const RELEVANT = /normativa|condiciones|exigencias|compromisos?\s+(ambiental(es)?|voluntarios?)|medidas\s+de\s+(mitigaci|reparaci|compensaci)|plan(es)?\s+de\s+seguimiento|seguimiento\s+de\s+las\s+variables/i;
const SKIP = /contingencias|emergencias|participaci[oó]n\s+ciudadana|observaciones\s+ciudadanas|permisos\s+ambientales\s+sectoriales|pronunciamiento/i;
// Una tabla de norma empieza con el nombre de la norma y, pocas líneas después, uno de estos rótulos.
const TABLE_LABEL = /Relaci[oó]n\s+con\s+el\s+proyecto|Componente\s*\/\s*materia|^\s*Materia\b|Fase\s+del\s+Proyecto|Parte,?\s+obra|Impacto\s+asociado|Forma\s+de\s+cumplimiento|Objetivo/i;
const NORM_PREFIX = /^\s*(Tabla\s*(N[°º]?\s*[\d.]+)?\s*[:.\-–]\s*|\d{1,2}(\.\d{1,2}){2,3}\.?\s+)/i;
const NORM_TITLE = /^\s*(Constituci[oó]n|D\.?\s?S\.?|D\.?\s?F\.?\s?L\.?|Decreto|Ley\b|Resoluci[oó]n\s+(Exenta|N|Sanitaria)|NCh|Norma\s+Chilena|C[oó]digo|Ordenanza|Reglamento)/i;
const CAV_LINE = /^\s*(Tabla[^\n]{0,40}?)?(Compromiso\s+ambiental\s+voluntario|CAV)\s*(N[°º]?\s*)?\d*\s*[:\-–.]?\s*(?<name>[^\n]{0,120})$/i;

function headKind(words: string): BlockKind | 'skip' | 'group' | undefined {
  if (/^(riesgo|contingencia|plan\s+de\s+(prevenci|emergencia))/i.test(words)) return 'skip';
  if (/^(fase|etapa)s?\s+(de\s+)?\S+\.?$|^planes\s+de\s+seguimiento|^medidas\s+de\s/i.test(words)) return 'group';
  if (/^compromiso|^compromisos\s+voluntarios/i.test(words)) return 'compromiso';
  if (/^medida/i.test(words)) return 'medida';
  if (/^(seguimiento|plan\s+de\s+seguimiento|variable|par[aá]metro|componente\s+ambiental|monitoreo)/i.test(words)) return 'seguimiento';
  if (/^(componente\s*\/\s*materia)/i.test(words)) return 'norma';
  if (/^(normas?\b|normativa|otr[oa]s\s+(cuerpos|normativas))/i.test(words)) return 'group';
  if (/^(respecto|condici[oó]n|exigencia|en\s+relaci[oó]n|sobre\s+(el|la|los|las)|seg[uú]n|del\s+oficio|oficio|plan\s+de)/i.test(words)) return 'condicion';
  return undefined;
}

/** Título legible: sin mayúsculas sostenidas y completo si el PDF lo cortó en "zona de conservación para". */
function titleOf(t: string, next = ''): string {
  let x = clean(t).replace(/\.$/, '');
  if (/\s(para|de|del|la|el|los|las|y|o|y\/o|en|a|con|al|por)$/i.test(x) && next && next.length < 80 && !TABLE_LABEL.test(next)) x = `${x} ${clean(next)}`;
  if (x.length > 6 && x === x.toUpperCase()) x = x.charAt(0) + x.slice(1).toLowerCase().replace(/\b(sma|cmn|seremi|ril(es)?|nch|d\.s\.)\b/g, (m) => m.toUpperCase());
  // "Medida 1 MM01 - Rescate…", "Seguimiento 3: Habilitación…", "Variable ambiental: Carga de polvo": queda el nombre.
  const named = x.replace(/^(medida(\s+de\s+(mitigaci[oó]n|reparaci[oó]n|compensaci[oó]n))?|seguimiento|condici[oó]n(\s+o\s+exigencia)?|exigencia|variable(\s+ambiental)?)\s*(n[°º]?\s*)?\d*\s*([A-Z]{2,4}[-\s]?\d+)?\s*[-–:.]?\s+/i, '');
  if (named !== x && named.length >= 4) x = /^(condici|exigencia)/i.test(x) ? `Condición: ${named}` : named.charAt(0).toUpperCase() + named.slice(1);
  if (x.length > 48) x = x.replace(/\s*\([^)]*\)/g, '');
  return x.replace(/\.$/, '');
}

/**
 * Divide la RCA en tablas de obligaciones: condiciones (8.1…), compromisos voluntarios (9.1… o con título),
 * medidas, planes de seguimiento y tablas de normas con su "forma de control y seguimiento".
 * Se salta la descripción del proyecto, los permisos sectoriales, la participación ciudadana y las contingencias.
 */
export function findBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const anyRelevant = lines.some((l, i) => CONSIDERANDO.test(l) && RELEVANT.test(lines.slice(i, i + 3).join(' ')) && !SKIP.test(lines.slice(i, i + 3).join(' ')));
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let inRegion = !anyRelevant;
  let considerando = '';
  let sectionKind: BlockKind | undefined;
  let unnamed = 0;
  const push = () => { if (cur && cur.body.trim()) blocks.push(cur); cur = null; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const c = CONSIDERANDO.exec(line);
    if (c) {
      const head = lines.slice(i, i + 3).join(' ');
      push();
      considerando = c[1];
      unnamed = 0;
      inRegion = !anyRelevant || (RELEVANT.test(head) && !SKIP.test(head));
      // Lo que se numere dentro de este considerando es de su tipo: "12. Que, … propuso los siguientes compromisos voluntarios".
      sectionKind = /compromisos?\s+(ambiental(es)?\s+)?voluntarios?/i.test(head) ? 'compromiso'
        : /medidas\s+de\s+(mitigaci|reparaci|compensaci)/i.test(head) ? 'medida'
        : /plan(es)?\s+de\s+seguimiento|seguimiento\s+de\s+las\s+variables/i.test(head) ? 'seguimiento'
        : /condiciones|exigencias/i.test(head) && !/normativa/i.test(head) ? 'condicion' : undefined;
      if (/^\s*RESUELVO/.test(line)) inRegion = false;
      continue;
    }
    // Después del RESUELVO vienen los anexos: ahí no hay más obligaciones nuevas.
    if (/^\s*RESUELVO\s*:?\s*$/.test(line)) break;
    if (/^\s*RESUELVO\s*:?/.test(line)) { push(); inRegion = false; continue; }
    if (!inRegion) continue;

    const h = BLOCK_HEAD.exec(line);
    // "7.1.1. Recuperación de suelo": una medida dentro de "7.1. FASE DE OPERACIÓN".
    const h3 = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{1,2})\.?\s+(\S.{3,})$/.exec(line);
    if (h3 && h3[1] === considerando && sectionKind && sectionKind !== 'condicion' && !NORM_TITLE.test(h3[4])) {
      push();
      cur = { num: `${h3[1]}.${h3[2]}.${h3[3]}`, title: titleOf(h3[4], lines[i + 1]), kind: sectionKind, body: '' };
      continue;
    }
    let hk = h ? headKind(h[3]) : undefined;
    if (h && h[1] === considerando && sectionKind && hk !== 'skip' && hk !== 'group' && hk !== 'norma') hk = sectionKind;
    if (h && hk) {
      push();
      if (hk === 'skip' || hk === 'group') { if (hk === 'skip') cur = null; continue; }
      const t = hk === 'compromiso' ? (h[3].replace(/^compromisos?\s+(ambiental(es)?\s+)?voluntarios?\s*(n[°º]?\s*)?\d*\s*[-–:.]?\s*/i, '') || h[3]) : h[3];
      // "8.1. COMPONENTE/MATERIA: …" lleva el nombre de la norma en la línea "Norma …" que sigue.
      const normaLine = hk === 'norma' ? lines.slice(i + 1, i + 4).find((l) => /^\s*Norma\s+\S/.test(l)) : undefined;
      cur = { num: `${h[1]}.${h[2]}`, title: normaLine ? clean(normaLine.replace(/^\s*Norma\s+/, '')) : titleOf(t, lines[i + 1]), kind: hk, body: '' };
      continue;
    }
    const near = lines.slice(i + 1, i + 6).join('\n');
    const cav = CAV_LINE.exec(line);
    if (cav && line.length < 160 && (TABLE_LABEL.test(near) || /^\s*Tabla/i.test(line))) {
      push();
      unnamed++;
      cur = { num: `${considerando}.${unnamed}`, title: titleOf((cav.groups?.name || 'Compromiso voluntario').replace(/^[“"]|[”"]$/g, ''), lines[i + 1]), kind: 'compromiso', body: '' };
      continue;
    }
    const normLine = line.replace(NORM_PREFIX, '');
    if (NORM_TITLE.test(normLine) && line.length < 220 && TABLE_LABEL.test(near) && (!cur || cur.kind === 'norma' || NORM_PREFIX.test(line))) {
      push();
      unnamed++;
      cur = { num: `${considerando}.${unnamed}`, title: clean(normLine).replace(/\.$/, ''), kind: 'norma', body: '' };
      continue;
    }
    if (cur) cur.body += `${line}\n`;
  }
  push();
  return blocks;
}

/** Frases del bloque, sin cruzar los pies de página de validación de firmas (así la cita existe tal cual). */
const LABELS = /Forma\s+de\s+cumplimiento|Indicador\s+que\s+acredita\s*\n?\s*su\s*\n?\s*cumplimiento|Componente\s*\/\s*(materia|impacto):?|Otros\s+cuerpos\s+legales(\s*\n?\s*asociados)?|Parte,\s+obra,\s+acci[oó]n,?[\s\S]{0,70}?a\s+la\s+que\s+aplica|Fase\s+del\s+proyecto\s+a\s+la[\s\S]{0,70}?(cumplimiento|que\s+aplica)|Referencia\s+al\s+ICE\s+para\s*\n?\s*mayores\s+detalles|^\s*Tabla:|Impacto\s+asociado|Fase\s+del\s+Proyecto\s+a\s+la\s*(\n\s*\S+\s*\n)?\s*que\s+aplica|Objetivo,\s+descripci[oó]n\s+y\s+(\n\s*)?justificaci[oó]n|Lugar,\s+forma\s+y\s*\n?\s*oportunidad\s+de\s*\n?\s*implementaci[oó]n|Indicador\s+que\s+acredite\s*\n?\s*su\s+cumplimiento|Forma\s+de\s+control\s+y\s*\n?\s*seguimiento|Referencia\s+a(l\s+ICE|\s+los\s+ICSARA)[^\n]*(\n[^\n]*detalles)?/gim;

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
  const W = '(?!de\\b|del\\b|que\\b|para\\b|en\\b|debe|deber|ser\\b|ser[aá]\\b|se\\b|mediante|durante|seg[uú]n|cuando|sobre|ser[aá]n|tiene|tendr|realiz|efectu|anual|mensual|semestral|trimestral|cada\\b|estos\\b|estas\\b|este\\b|esta\\b|dichos?\\b|dichas?\\b|sus\\b|todos\\b|todas\\b)[a-záéíóúñ]{4,}';
  const ordered = [
    `monitoreos?\\s+(de\\s+(la\\s+|los\\s+)?)?${W}(\\s+de\\s+${W})?`, `monitoreos?\\s+mediante\\s+${W}(\\s+de\\s+${W})?`, `(medici[oó]n|muestreo|caracterizaci[oó]n|an[aá]lisis)\\s+de\\s+(la\\s+|los\\s+)?${W}`, `declaraci[oó]n\\s+(de\\s+|en\\s+(el\\s+)?)?(${W}|SINADER|SIDREP|RETC)`, `encuesta\\s+de\\s+${W}(\\s+de\\s+${W})?`, `charlas?\\s+(de\\s+)?(inducci[oó]n\\s+)?${W}`, `inspecci[oó]n\\s+visual(\\s+${W})?`,
    `plan\\s+de\\s+${W}(\\s+de\\s+${W})?`, `programa\\s+de\\s+${W}`, `registro\\s+de\\s+${W}`, 'humectaci[oó]n', 'libro\\s+de\\s+reclamos',
    `(rescate|relocalizaci[oó]n|reforestaci[oó]n|capacitaci[oó]n(es)?|inducci[oó]n(es)?|mantenci[oó]n)(\\s+de\\s+${W})?`, `registro\\s+(fotogr[aá]fico|mensual|(de\\s+)?${W}(\\s+de\\s+${W})?)`, `medici[oó]n\\s+(del\\s+)?(nivel\\s+de\\s+)?${W}`,
  ];
  const sys = /[Dd]eclara[^.]{0,60}?\b(RETC|SINADER|SIDREP)\b/.exec(s);
  if (sys) return `Declaración ${sys[1]}`;
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
const MONTHS = /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/gi;
function kindsOf(s: string) {
  s = s.replace(/\(\s*\d+\s+anuales\s*\)/gi, '');
  const ks = FREQ.filter((f) => f.re.test(s) || (f.kind === 'monthly' && /\b(\d+|una)\s+(muestras?|mediciones|medici[oó]n|monitoreos?|an[aá]lisis)\s+al\s+mes\b/i.test(s)));
  // "en los meses de diciembre, enero, febrero y marzo": tantas veces al año como meses nombrados.
  const months = new Set((s.match(MONTHS) ?? []).map((m) => m.toLowerCase())).size;
  // "durante los meses de noviembre y marzo de cada año" son dos veces al año, no una.
  const yearly = ks.length === 1 && ks[0].kind === 'annual' && months >= 2 && /de\s+cada\s+a[nñ]o/i.test(s);
  if ((yearly || !ks.some((k) => !['event', 'continuous', 'once'].includes(k.kind))) && /\b(meses|mes)\s+de\s/i.test(s)) {
    const n = months;
    const k = n >= 3 ? 'monthly' : n === 2 ? 'semiannual' : n === 1 ? 'annual' : undefined;
    if (k) return [FREQ.find((f) => f.kind === k)!, ...ks.filter((x) => x.kind !== 'continuous' && x.kind !== 'once')];
  }
  // "previo al inicio de obras y cada vez que se incorpore personal" es un evento, no "una vez".
  if (ks.some((k) => k.kind === 'event')) return ks.filter((k) => k.kind !== 'once');
  // "una campaña anual", "al término de cada año": lo periódico manda sobre un "una vez" débil.
  const periodic = ks.some((k) => !['event', 'continuous', 'once'].includes(k.kind));
  const strongOnce = /una\s+sola\s+vez|informe\s+final|previo\s+al\s+inicio|antes\s+del\s+inicio|posterior\s+a\s+la/i.test(s);
  return periodic && !strongOnce ? ks.filter((k) => k.kind !== 'once') : ks;
}

const DUE_DAY = /(\d{1,2})\s*d[ií]as\s+h[aá]biles\s+(luego|despu[eé]s)\s+de\s+terminado\s+el\s+mes/i;

/**
 * Lee las condiciones y compromisos voluntarios de una RCA con la plantilla actual.
 * Devuelve [] si el documento no tiene esa estructura (entonces se usa la IA).
 */
/** "Decreto Supremo Nº 38, de 2011, del Ministerio…" → "D.S. N° 38/2011". */
function shortNorm(t: string): string {
  let x = t.replace(/\s+/g, ' ').replace(/^Norma\s+/i, '').replace(/^DS\b/, 'D.S.')
    .replace(/Decreto\s+(con\s+)?Fuerza\s+de\s+Ley/i, 'DFL').replace(/Decreto\s+Supremo/i, 'D.S.').replace(/Norma\s+Chilena(\s+Oficial)?/i, 'NCh')
    .replace(/N\s*[°º]\s*/g, 'N° ').replace(/(\d+)\s*,?\s+de\s+(\d{4})/, '$1/$2');
  const m = /^.*?\d+(\.\d{3})*(\s*\/\s*\d{2,4})?/.exec(x);
  if (m && m[0].length <= 40) x = m[0];
  return cut(x.replace(/[,.]\s*$/, ''), 40);
}

const SECTION_NAME: Record<BlockKind, string> = { condicion: 'Condición de la RCA', compromiso: 'Compromiso voluntario', medida: 'Medida', seguimiento: 'Plan de seguimiento', norma: 'Norma aplicable' };

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
    const indicador = fieldText(/Indicador\s+que\s+acredit[ae]\s+(su\s+)?cumplimiento/i, /Forma\s+de\s+control|Referencia\s+a\s+los|$/i);
    const component = COMPONENT_RULES.find(([re]) => re.test(`${b.title} ${b.body}`))?.[1] ?? 'Administrativo';

    // Cuándo se hace según el campo "Oportunidad:", para las frases que no dicen su propia frecuencia.
    const oportunidad = fieldText(/Oportunidad:/i, /\n\s*(Indicador|Forma\s+de\s+control|Se\s+deber[aá])|\.\s*\n/i);
    const inherited = oportunidad ? kindsOf(oportunidad)[0] : undefined;

    // Frases que obligan a algo, con su frecuencia.
    const norma = b.kind === 'norma';
    const duties = all
      // En una tabla de norma solo cuenta lo que tiene frecuencia y es un control concreto ("monitoreo semestral").
      .filter((s) => norma ? (frequencyOf(s) && MONITOR.test(s) && (frequencyOf(s)!.kind !== 'continuous' || /\d+\s+veces\s+al\s+d[ií]a|diariamente/i.test(s))) : (DUTY.test(s) || (REPORT.test(s) && (frequencyOf(s) || TO_AUTHORITY.test(s))) || ((b.kind === 'seguimiento' || b.kind === 'medida') && frequencyOf(s))))
      .filter((s) => !/^(Objetivo:|Oportunidad:)/i.test(s))
      // Los ítems de una lista de contenidos ("a) Superficie prospectada…") describen el informe, no son tareas.
      .filter((s) => norma || !/^([a-h]\)|[-•])/.test(s) || /\bdeber[aá]n?\b/i.test(s) || (REPORT.test(s) && /remitid|Superintendencia|SMA\b|CMN\b|SEREMI/.test(s)))
      .map((s) => ({ s, kinds: kindsOf(s), report: REPORT.test(s) && /remit|SMA|Superintendencia|CMN|Consejo|SEREMI/i.test(s) }));

    const groups = new Map<FrequencyKind, { s: string; report: boolean; re?: RegExp }[]>();
    const periodicKind = duties.flatMap((d) => (d.report ? d.kinds : [])).find((k) => !['event', 'continuous', 'once'].includes(k.kind));
    const loose: typeof duties = [];
    for (const d of duties) {
      // Un informe sin frecuencia propia va con el informe periódico del mismo compromiso, si lo hay.
      const ks = d.kinds.length ? d.kinds : d.report && periodicKind ? [periodicKind] : inherited ? [inherited] : [];
      if (!ks.length && d.report) loose.push(d);
      for (const k of ks) groups.set(k.kind, [...(groups.get(k.kind) ?? []), { s: d.s, report: d.report, re: d.kinds.length ? k.re : undefined }]);
    }
    // "Envío del informe a la SMA en un plazo de un mes desde la campaña": acompaña a la campaña, o es una entrega única.
    if (loose.length) {
      const target = [...groups.keys()].find((k) => k !== 'continuous') ?? 'once';
      groups.set(target, [...loose.map((d) => ({ s: d.s, report: true })), ...(groups.get(target) ?? [])]);
      if (target === 'once' && groups.get('continuous')?.every((d) => !d.re)) groups.delete('continuous');
    }
    // Si el nombre del compromiso ya dice su frecuencia ("Monitoreo arqueológico permanente"), esa obligación existe.
    const titleKind = norma ? undefined : /^manten(er|ci[oó]n)\b/i.test(b.title) ? FREQ.find((f) => f.kind === 'continuous') : kindsOf(b.title)[0];
    if (titleKind && !groups.has(titleKind.kind)) {
      const d = duties.find((x) => !x.report) ?? duties[0];
      if (d) groups.set(titleKind.kind, [{ s: d.s, report: false }]);
    }
    // Un compromiso sin frecuencia escrita es una condición que se cumple mientras dure la fase.
    if (norma && !groups.size) continue;
    if (!groups.size) {
      const first = duties[0]?.s ?? all.find((x) => /^(Descripci[oó]n|Forma):/i.test(x)) ?? all[0];
      if (first) groups.set('continuous', [{ s: first, report: false }]);
    }

    let n = 0;
    for (const [kind, ds] of groups) {
      if (n >= 6) break;
      const lead = ds.find((d) => d.report && kind !== 'continuous') ?? ds.find((d) => d.re) ?? ds[0];
      // Destinatario: el primero que nombra la frase del informe ("al CMN y SMA" → CMN).
      const reportText = (ds.find((d) => d.report) ?? lead).s;
      const named = RECIPIENTS.map(([re, r]) => ({ r, at: reportText.search(re) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
      const recipient: Recipient = named[0]?.r ?? (ds.some((d) => d.report) ? 'SMA' : 'Interno');
      const leadSubject = subject(quoteOf(lead.s, lead.re ?? REPORT)) ?? subject(lead.s);
      // En un compromiso manda su nombre, salvo que la frase hable de otra cosa (una charla dentro del monitoreo).
      const sameThing = leadSubject && b.title.toLowerCase().startsWith(leadSubject.split(' ')[0].toLowerCase().replace(/s$/, ''));
      const normName = norma ? shortNorm(b.title) : '';
      const normWhat = leadSubject ?? cap((/monitoreo|medici[oó]n|muestreo|registro|informe|reporte|declaraci[oó]n|inspecci[oó]n|campa[nñ]a|charla|capacitaci[oó]n|an[aá]lisis|caracterizaci[oó]n|auditor[ií]a/i.exec(lead.s)?.[0] ?? 'control').toLowerCase());
      const base = norma ? `${normName}: ${normWhat}` : b.kind === 'compromiso' && b.title.length <= 48 && (!leadSubject || sameThing || kind !== 'event') ? cap(b.title)
        : (leadSubject ?? subject(b.title) ?? cap(b.title));
      const adj = FREQ.find((f) => f.kind === kind)!.adj;
      const periodic = !['event', 'continuous', 'once'].includes(kind);
      const hallazgo = kind === 'event' && /hallazgo|restos\s+arqueol|materiales\s+arqueol|identificaci[oó]n\s+y\s+recuperaci[oó]n/i.test(lead.s) && !/charla/i.test(base);
      const title = cut(
        periodic && lead.report ? `${base}: informe ${adj}` :
        hallazgo ? `${base}: si hay hallazgos` :
        kind === 'once' ? `${base}: ${/informe\s+final|final\s+del\s+proyecto|t[eé]rmino\s+de\s+(la\s+)?(obra|construcci)/i.test(lead.s) ? 'informe final' : lead.report ? 'informe' : 'una vez'}` : base, 60);

      const frequency: Frequency = { kind };
      if (kind === 'event') frequency.hoursAfterEvent = 24;
      const dd = DUE_DAY.exec(ds.map((d) => d.s).join(' '));
      if (kind === 'monthly' && (dd || /mes\s+(anterior|siguiente)/i.test(ds.map((d) => d.s).join(' ')))) {
        frequency.lagMonths = 1;
        frequency.dueDay = dd ? Math.min(28, Math.round(Number(dd[1]) * 1.4)) : undefined;
      }

      out.push({
        id: `${projectId}-r${b.num.replace(/\./g, '-')}-${kind}`,
        projectId, title,
        plain: cut(lead.s, 240),
        component, recipient, frequency,
        quote: quoteOf(lead.s, lead.re ?? (lead.report ? REPORT : DUTY)),
        section: `${b.num} ${SECTION_NAME[b.kind]}${b.kind === 'condicion' ? '' : `: ${cut(b.title, 40)}`}`,
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
  // La misma declaración anual aparece bajo varias normas: basta una.
  const tail = (o: Obligation) => o.section?.includes('Norma aplicable') ? `${o.frequency.kind}|${key(o).split(': ').slice(1).join(': ')}` : '';
  const seen = new Set<string>();
  list = list.filter((o) => { const t = tail(o); if (!t || t.endsWith('|')) return true; if (seen.has(t)) return false; seen.add(t); return true; });
  return list.filter((o, i) => !list.some((x, j) => j !== i && x.frequency.kind === o.frequency.kind && (
    (key(x) === key(o) && j < i) || (key(x).startsWith(key(o)) && key(x).length > key(o).length)
  )));
}
