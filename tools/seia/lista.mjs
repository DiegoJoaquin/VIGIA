// Arma una lista de proyectos con RCA aprobada y el contacto público del titular (empresa) que publica el SEIA.
// Solo personas jurídicas (S.A., SpA, Ltda., etc.): no se listan personas naturales.
// Se ejecuta en GitHub Actions. Uso: node lista.mjs <salida> <cantidad>
import { writeFileSync, mkdirSync } from 'node:fs';

const [out, limitArg] = process.argv.slice(2);
const LIMIT = Number(limitArg || 100);
mkdirSync(`${out}/fichas`, { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (vigia-prospectos; contacto frediazll@users.noreply.github.com)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LEGAL = /\b(s\.?a\.?|spa|s\.p\.a\.?|ltda\.?|limitada|e\.i\.r\.l|sociedad|compa[nñ][ií]a|corporaci[oó]n|fundaci[oó]n|cooperativa|agr[ií]cola|inmobiliaria|constructora|energ[ií]a|holding)\b/i;
const TERMS = ['aridos', 'extraccion de aridos', 'planta de aridos', 'planta de aridos y hormigon', 'parque solar', 'parque fotovoltaico', 'planta fotovoltaica', 'parque eolico', 'planta de tratamiento', 'planta de riles',
  'relleno sanitario', 'planta de compostaje', 'plantel de cerdos', 'plantel de aves', 'planta de alimentos', 'lacteos', 'bodega vitivinicola', 'vinicola', 'planta faenadora', 'planta de celulosa',
  'central hidroelectrica', 'minicentral', 'central termoelectrica', 'subestacion electrica', 'linea de transmision', 'planta de asfalto', 'planta de hormigon', 'cantera', 'mineria', 'planta de beneficio', 'embalse', 'acuicultura', 'centro de cultivo', 'planta procesadora', 'frigorifico', 'packing', 'planta de biogas', 'loteo', 'proyecto inmobiliario', 'parque industrial', 'bodegaje', 'centro de distribucion', 'terminal', 'planta de lixiviados'];

async function search(q) {
  const u = `https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php?nombre=${encodeURIComponent(q)}`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(u, { headers: UA });
      const j = JSON.parse(new TextDecoder('latin1').decode(Buffer.from(await r.arrayBuffer())));
      return j.data ?? [];
    } catch { await wait(1500); }
  }
  return [];
}

const clean = (h = '') => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?56\s?)?(?:9\s?\d{4}\s?\d{4}|\(?\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}|\d{8,9})/g;

const seen = new Set();
const rows = [];
let saved = 0;
for (const term of TERMS) {
  if (rows.length >= LIMIT) break;
  const data = await search(term);
  await wait(700);
  for (const d of data) {
    if (rows.length >= LIMIT) break;
    if (d.ESTADO_PROYECTO !== 'Aprobado' || seen.has(d.EXPEDIENTE_ID)) continue;
    seen.add(d.EXPEDIENTE_ID);
    const titular = String(d.TITULAR ?? '').trim();
    if (!titular || !LEGAL.test(titular)) continue;
    let html = '';
    try {
      const r = await fetch(d.EXPEDIENTE_URL_FICHA, { headers: UA });
      html = new TextDecoder('latin1').decode(Buffer.from(await r.arrayBuffer()));
    } catch { continue; }
    await wait(700);
    if (saved < 4) { writeFileSync(`${out}/fichas/${d.EXPEDIENTE_ID}.html`, html); saved++; }
    const text = clean(html);
    // Contacto público del titular: se toma lo que está junto a "Titular" / "Representante legal" en la ficha.
    const i = text.search(/Titular|Representante\s+Legal/i);
    const near = i >= 0 ? text.slice(i, i + 1800) : text;
    const emails = [...new Set((near.match(EMAIL) ?? []).filter((e) => !/sea\.gob\.cl|sma\.gob\.cl/i.test(e)).map((e) => e.toLowerCase()))];
    const phones = [...new Set((near.match(PHONE) ?? []).map((p) => p.trim()))].slice(0, 2);
    rows.push({ proyecto: d.EXPEDIENTE_NOMBRE, titular, tipo: d.WORKFLOW_DESCRIPCION, comuna: d.COMUNA_NOMBRE, region: d.REGION_NOMBRE ?? '', fecha: d.FECHA_PRESENTACION_FORMAT, correos: emails, telefonos: phones, ficha: d.EXPEDIENTE_URL_FICHA, id: d.EXPEDIENTE_ID });
    console.log(rows.length, titular, '|', emails.join(','), '|', phones.join(','));
  }
}
writeFileSync(`${out}/lista.json`, JSON.stringify(rows, null, 1));
console.log('total', rows.length, 'con correo', rows.filter((r) => r.correos.length).length);
