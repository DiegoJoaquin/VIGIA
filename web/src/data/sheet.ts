/**
 * Lee una planilla subida por el usuario (Excel .xlsx o CSV) y la deja como filas de texto.
 * Sin librerías: un .xlsx es un zip con XML adentro, y el navegador ya sabe descomprimir.
 */
import { parseCsv } from '../../../shared/standard';

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Archivos de un zip (solo los que pedimos), leyendo el directorio central. */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no es un Excel válido (.xlsx).');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    out.set(name, dec.decode(method === 0 ? raw : await inflate(raw)));
  }
  return out;
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Filas de la hoja "Compromisos" (o la primera hoja) de un .xlsx. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf, (n) => /^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(n));
  const xml = (s?: string) => new DOMParser().parseFromString(s ?? '<x/>', 'application/xml');
  const shared = [...xml(files.get('xl/sharedStrings.xml')).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));
  // Elegir la hoja de compromisos por su nombre; si no, la primera.
  const sheets = [...xml(files.get('xl/workbook.xml')).getElementsByTagName('sheet')];
  const rels = [...xml(files.get('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')];
  const pick = sheets.find((s) => /compromiso|matriz|obligaci/i.test(s.getAttribute('name') ?? '')) ?? sheets[0];
  const rid = pick?.getAttribute('r:id') ?? pick?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const target = rels.find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target')?.replace(/^\/?(xl\/)?/, '');
  const sheetXml = files.get(`xl/${target ?? 'worksheets/sheet1.xml'}`) ?? files.get('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error('No encontré hojas en el Excel.');
  const rows: string[][] = [];
  for (const row of [...xml(sheetXml).getElementsByTagName('row')]) {
    const r: string[] = [];
    for (const c of [...row.getElementsByTagName('c')]) {
      const t = c.getAttribute('t');
      const val = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const text = t === 's' ? shared[Number(val)] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent).join('') : val;
      r[colIndex(c.getAttribute('r') ?? 'A1')] = text;
    }
    rows.push(Array.from(r, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Lee .xlsx o .csv (UTF-8 o el formato de Excel en Windows). */
export async function readSheetFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  if (/\.xlsx$/i.test(file.name)) return readXlsx(buf);
  if (/\.xls$/i.test(file.name)) throw new Error('Guarda el archivo como .xlsx o .csv (el formato .xls antiguo no se puede leer).');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1252').decode(buf); }
  return parseCsv(text);
}

/** Descarga un texto como archivo. */
export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
