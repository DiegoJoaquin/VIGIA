// Explora el buscador público del SEIA para saber cómo consultarlo (se ejecuta en GitHub Actions).
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (vigia-prospectos)' };
const tries = [
  ['form', 'https://seia.sea.gob.cl/busqueda/buscarProyecto.php'],
  ['get1', 'https://seia.sea.gob.cl/busqueda/buscarProyectoAction.php?nombre=Aconcagua%20Foods'],
  ['get2', 'https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php?nombre=Aconcagua%20Foods'],
  ['ficha', 'https://seia.sea.gob.cl/expediente/ficha/fichaPrincipal.php?id_expediente=2131785924'],
];
for (const [k, u] of tries) {
  try { const r = await fetch(u, { headers: UA }); const t = await r.text(); writeFileSync(`${out}/${k}.html`, `<!-- ${r.status} ${u} -->\n${t}`); console.log(k, r.status, t.length); }
  catch (e) { console.log(k, 'ERR', String(e)); }
}
