// Busca en el SEIA el titular y el contacto público de cada instalación de tools/seia/prospectos.json.
// Se ejecuta en GitHub Actions (el SEIA no es accesible desde otros entornos). Uso: node titulares.mjs <salida>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(`${out}/fichas`, { recursive: true });
const list = JSON.parse(readFileSync(new URL('./prospectos.json', import.meta.url), 'utf8'));
const UA = { 'user-agent': 'Mozilla/5.0 (vigia-prospectos; contacto frediazll@users.noreply.github.com)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

// Palabras que no ayudan a encontrar el proyecto.
const STOP = new Set('planta plantas riles ril ptas pta sistema tratamiento de del la las los el y s a sa ltda spa limitada sociedad ex agricola agroindustrial agroindustria fundo sector procesadora productos proyecto relleno sanitario aguas servidas sucursal'.split(' '));

async function search(q) {
  const u = `https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php?nombre=${encodeURIComponent(q)}`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(u, { headers: UA });
      const buf = Buffer.from(await r.arrayBuffer());
      const j = JSON.parse(new TextDecoder('latin1').decode(buf));
      return j.data ?? [];
    } catch { await wait(1500); }
  }
  return [];
}

function queries(key, comuna) {
  const raw = key.replace(/\(.*?\)/g, ' ').replace(new RegExp(`[-–]\\s*${comuna}\\s*$`, 'i'), ' ');
  const words = norm(raw).split(' ').filter((w) => w.length > 2 && !STOP.has(w) && w !== norm(comuna));
  const qs = [norm(raw), words.slice(0, 3).join(' '), words.slice(0, 2).join(' '), words[0]].filter((q) => q && q.length >= 4);
  return [...new Set(qs)];
}

const results = [];
for (const p of list) {
  let best, used;
  for (const q of queries(p.key, p.comuna)) {
    const data = await search(q);
    await wait(700);
    const same = data.filter((d) => norm(d.COMUNA_NOMBRE).includes(norm(p.comuna)) || norm(p.comuna).includes(norm(d.COMUNA_NOMBRE)));
    const pick = (same.length ? same : data.length === 1 ? data : [])
      .sort((a, b) => (b.ESTADO_PROYECTO === 'Aprobado') - (a.ESTADO_PROYECTO === 'Aprobado') || Number(b.FECHA_PRESENTACION) - Number(a.FECHA_PRESENTACION))[0];
    if (pick) { best = { ...pick, sameComuna: same.length > 0, candidates: same.length || data.length }; used = q; break; }
  }
  const row = { ...p, query: used ?? null, found: !!best };
  if (best) {
    Object.assign(row, {
      titular: best.TITULAR, proyecto: best.EXPEDIENTE_NOMBRE, tipo: best.WORKFLOW_DESCRIPCION, estado: best.ESTADO_PROYECTO,
      fecha: best.FECHA_PRESENTACION_FORMAT, comunaSEIA: best.COMUNA_NOMBRE, url: best.EXPEDIENTE_URL_PPAL, ficha: best.EXPEDIENTE_URL_FICHA,
      id: best.EXPEDIENTE_ID, sameComuna: best.sameComuna, candidates: best.candidates,
    });
    // Ficha del proyecto: ahí el SEIA publica el domicilio, teléfono y correo del titular.
    try {
      const r = await fetch(best.EXPEDIENTE_URL_FICHA, { headers: UA });
      const html = new TextDecoder('latin1').decode(Buffer.from(await r.arrayBuffer()));
      writeFileSync(`${out}/fichas/${best.EXPEDIENTE_ID}.html`, html);
      row.fichaStatus = r.status;
    } catch (e) { row.fichaStatus = String(e); }
    await wait(700);
  }
  results.push(row);
  console.log(row.found ? 'OK ' : '-- ', p.key, '→', row.titular ?? '');
}
writeFileSync(`${out}/titulares.json`, JSON.stringify(results, null, 1));
