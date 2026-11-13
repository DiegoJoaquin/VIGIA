// Baja Programas de Cumplimiento (PdC) públicos desde SNIFA y guarda su texto, para estudiar su formato
// y medir el lector de PdC. Se ejecuta en GitHub Actions. Uso: node tools/sma/pdc.mjs <salida>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../worker/package.json', import.meta.url));
const { getDocumentProxy } = await import(require.resolve('unpdf'));
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'accept-language': 'es-CL,es' };
// ficha de SNIFA → nombre corto
const CASES = { 2299: 'guerrico', 3156: 'lapostolle', 4025: 'lenadura', 4070: 'masisa-mapal', 4516: 'sanlorenzo', 4427: 'rioteno', 4322: 'bosch', 4283: 'tuniche', 4255: 'felixmolina', 4179: 'palmilla', 4057: 'pe-sanantonio', 4003: 'minutoverde', 4296: 'prolesur', 4155: 'cotelsa' };
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function pdfText(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] !== 0x25 || buf[1] !== 0x50) throw new Error(`no es PDF (${r.headers.get('content-type')}, ${buf.length} bytes)`);
  const pdf = await getDocumentProxy(buf);
  let text = '';
  for (let p = 1; p <= Math.min(pdf.numPages, 150); p++) {
    const c = await (await pdf.getPage(p)).getTextContent();
    for (const it of c.items) { if (typeof it.str !== 'string') continue; text += it.str; if (it.hasEOL) text += '\n'; }
    text += '\n\n';
  }
  return { text, pages: pdf.numPages, bytes: buf.length };
}

const report = [];
for (const [id, name] of Object.entries(CASES)) {
  try {
    const html = await (await fetch(`https://snifa.sma.gob.cl/Sancionatorio/Ficha/${id}`, { headers: UA })).text();
    const docs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => {
      const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]));
      const link = /href="(\/General\/Descargar\/\d+)"/.exec(m[1])?.[1];
      return link && cells.length >= 4 ? { n: cells[0], name: cells[1], type: cells[2], date: cells[3], link } : null;
    }).filter(Boolean);
    writeFileSync(`${out}/${name}.docs.json`, JSON.stringify(docs, null, 1));
    // El plan vigente es el último refundido (o la presentación si nunca hubo refundido) y la resolución que lo aprueba.
    const plan = docs.filter((d) => /PDC Refundido/i.test(d.type)).pop() ?? docs.filter((d) => /PDC Presentaci/i.test(d.type)).pop();
    const res = docs.filter((d) => /PDC Aprobaci/i.test(d.type)).pop();
    for (const [kind, d] of [['plan', plan], ['aprueba', res]]) {
      if (!d) { report.push(`${name}\t${kind}\tSIN DOCUMENTO`); continue; }
      try {
        const t = await pdfText(`https://snifa.sma.gob.cl${d.link}`);
        writeFileSync(`${out}/${name}.${kind}.txt`, t.text);
        report.push(`${name}\t${kind}\t${d.date}\t${t.pages} pág\t${t.text.length} car\t${d.name}`);
      } catch (e) { report.push(`${name}\t${kind}\tERROR ${e.message}\t${d.name}`); }
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (e) { report.push(`${name}\tERROR ficha ${e.message}`); }
}
writeFileSync(`${out}/_report.tsv`, report.join('\n') + '\n');
console.log(report.join('\n'));
