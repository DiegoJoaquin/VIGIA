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
const BASE = ['planta de aridos', 'extraccion de aridos', 'planta de hormigon', 'planta de asfalto', 'cantera', 'parque solar', 'parque fotovoltaico', 'planta fotovoltaica', 'proyecto fotovoltaico', 'parque eolico', 'planta de tratamiento de riles', 'planta de tratamiento de aguas servidas',
  'relleno sanitario', 'planta de compostaje', 'plantel de cerdos', 'plantel de aves', 'plantel de pollos', 'planta de alimentos', 'planta de lacteos', 'bodega vitivinicola', 'planta vitivinicola', 'planta faenadora', 'planta de celulosa', 'central hidroelectrica', 'minicentral hidroelectrica',
  'central termoelectrica', 'subestacion electrica', 'linea de transmision', 'planta de beneficio', 'planta de biogas', 'planta procesadora', 'frigorifico', 'packing', 'planta de embalaje', 'planta de reciclaje', 'planta de neumaticos', 'planta de residuos', 'estacion de transferencia', 'centro de acopio', 'planta de aceite', 'planta de harina de pescado', 'planta de salmon', 'piscicultura', 'centro de cultivo', 'planta de cemento', 'planta de cal', 'planta de yeso', 'planta de fertilizantes', 'planta de quimicos', 'planta de pinturas', 'planta de plasticos', 'planta metalurgica', 'fundicion', 'galvanizado', 'aserradero', 'planta de tableros', 'planta de pellets', 'planta de astillas', 'bodega de combustibles', 'estacion de servicio', 'terminal de combustibles', 'planta de gas', 'planta de lavado', 'lavanderia industrial', 'mataderos', 'curtiembre', 'planta de cerveza', 'planta de bebidas', 'planta de jugos', 'planta de conservas', 'deshidratadora', 'planta de arroz', 'planta de molinos', 'planta de papas', 'maltería', 'planta de hielo', 'centro de distribucion', 'parque industrial', 'bodegaje', 'proyecto inmobiliario', 'loteo industrial', 'data center', 'planta desaladora', 'planta de baterias', 'sistema de almacenamiento de energia', 'bess', 'hidrogeno verde', 'planta de agua potable', 'tranque de relaves', 'sondajes', 'prospeccion minera', 'mina subterranea', 'planta de chancado'];
const YEARS = [''];
const TERMS = BASE.flatMap((t) => YEARS.map((y) => `${t}${y}`));
const MIN_YEAR = 2016;

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

const lines = (h = '') => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// "Titular", "Representante Legal" y "Empresa Consultora Ambiental" son bloques de la ficha con Nombre / Domicilio / Ciudad / Teléfono / Fax / E-mail.
function block(ls, head) {
  const i = ls.findIndex((l) => l.toLowerCase().startsWith(head));
  if (i < 0) return {};
  const end = ls.findIndex((l, k) => k > i && /^(representante legal|empresa consultora|cerrar|titular)/i.test(l));
  const part = ls.slice(i + 1, end > 0 ? end : i + 30);
  const get = (label) => { const k = part.findIndex((l) => l.toLowerCase().startsWith(label)); return k >= 0 ? (part[k + 1] ?? '') : ''; };
  const mails = [...new Set((part.join(' ').match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
  const tel = get('tel');
  return { nombre: get('nombre'), domicilio: get('domicilio'), ciudad: get('ciudad'), telefono: /\d/.test(tel) ? tel : '', correos: mails };
}

const seen = new Set();
const rows = [];
const empresas = new Map();
let saved = 0;
for (const term of TERMS) {
  if (rows.length >= LIMIT) break;
  const data = await search(term);
  console.log('término', term, '→', data.length, 'resultados,', data.filter((x) => x.ESTADO_PROYECTO === 'Aprobado').length, 'aprobados');
  await wait(700);
  for (const d of data) {
    if (rows.length >= LIMIT) break;
    const year = Number(String(d.FECHA_PRESENTACION_FORMAT ?? '').slice(-4));
    if (d.ESTADO_PROYECTO !== 'Aprobado' || year < MIN_YEAR || seen.has(d.EXPEDIENTE_ID)) continue;
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
    const ls = lines(html);
    const t = block(ls, 'titular');
    const c = block(ls, 'empresa consultora');
    // Se lista una vez cada empresa (aunque tenga varios proyectos): un solo correo por empresa.
    if (!t.correos?.length && !t.telefono) continue;
    const key = titular.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (empresas.has(key)) { empresas.get(key).otrosProyectos.push(d.EXPEDIENTE_NOMBRE); continue; }
    const row = { empresa: titular, proyecto: d.EXPEDIENTE_NOMBRE, tipo: d.WORKFLOW_DESCRIPCION, fecha: d.FECHA_PRESENTACION_FORMAT, comuna: d.COMUNA_NOMBRE, domicilio: [t.domicilio, t.ciudad].filter(Boolean).join(', '),
      correos: t.correos ?? [], telefono: t.telefono, consultora: c.nombre ?? '', consultoraCorreos: c.correos ?? [], consultoraTelefono: c.telefono ?? '', otrosProyectos: [], ficha: d.EXPEDIENTE_URL_FICHA };
    empresas.set(key, row); rows.push(row);
    console.log(rows.length, titular, '|', row.correos.join(','), '|', row.telefono);
  }
}
writeFileSync(`${out}/lista.json`, JSON.stringify(rows, null, 1));
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
writeFileSync(`${out}/lista.csv`, '\ufeff' + ['empresa,proyecto,tipo,fecha,comuna,domicilio,correos,telefono,consultora,correos_consultora,telefono_consultora,otros_proyectos,ficha', ...rows.map((r) => [r.empresa, r.proyecto, r.tipo, r.fecha, r.comuna, r.domicilio, r.correos.join('; '), r.telefono, r.consultora, r.consultoraCorreos.join('; '), r.consultoraTelefono, r.otrosProyectos.join(' | '), r.ficha].map(q).join(','))].join('\n'));
console.log('total', rows.length, 'con correo', rows.filter((r) => r.correos.length).length);
