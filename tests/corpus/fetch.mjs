// Descarga las RCA de urls.txt y guarda su texto tal como lo extrae Vigía (pdf.js con saltos de línea).
// Uso (en GitHub Actions, donde el SEA es accesible): node tests/corpus/fetch.mjs <carpeta de salida>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../worker/package.json', import.meta.url));
const { getDocumentProxy } = await import(require.resolve('unpdf'));
const out = process.argv[2] ?? 'corpus-out';
mkdirSync(out, { recursive: true });
const lines = readFileSync(new URL('./urls.txt', import.meta.url), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const report = [];
for (const line of lines) {
  const [name, url] = line.trim().split(/\s+/);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Vigia; lectura de RCA publicas)' }, signal: AbortSignal.timeout(90_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    let text = '';
    // Solo las primeras 120 páginas: los PDF "unidos" traen anexos enormes después de la resolución.
    for (let p = 1; p <= Math.min(pdf.numPages, 120); p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      for (const it of c.items) { if (typeof it.str !== 'string') continue; text += it.str; if (it.hasEOL) text += '\n'; }
      text += '\n\n';
    }
    writeFileSync(join(out, `${name}.txt`), text);
    report.push(`${name}\t${buf.length}\t${pdf.numPages}\t${text.length}`);
  } catch (e) {
    report.push(`${name}\tERROR\t${e.message}`);
  }
}
writeFileSync(join(out, '_report.tsv'), report.join('\n') + '\n');
console.log(report.join('\n'));
