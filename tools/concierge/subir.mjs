// Sube a la cuenta de un cliente una RCA ya revisada a mano (servicio "concierge").
// Uso:  VIGIA_API=https://vigia.diazdiego011.workers.dev EXTRACTOR_TOKEN=... \
//       node tools/concierge/subir.mjs borrador.json cliente@empresa.cl [--reemplazar] [--por-revisar]
//
// --reemplazar  el cliente ya subió esta RCA: se borra la lectura automática que nadie ha usado (sin cumplimientos,
//               eventos ni pruebas) y se pone la lista verificada. El proyecto se busca por id o por nombre.
// borrador.json = { "project": {...}, "obligations": [...] }
import { readFileSync } from 'node:fs';

const [file, email, ...flags] = process.argv.slice(2);
const api = process.env.VIGIA_API, token = process.env.EXTRACTOR_TOKEN;
if (!file || !email || !api || !token) {
  console.error('Faltan datos. Uso: VIGIA_API=… EXTRACTOR_TOKEN=… node subir.mjs borrador.json correo [--por-revisar]');
  process.exit(1);
}
const draft = JSON.parse(readFileSync(file, 'utf8'));
const res = await fetch(`${api.replace(/\/$/, '')}/api/extractor/upload`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ email, draft, verified: !flags.includes('--por-revisar'), replace: flags.includes('--reemplazar') }),
});
console.log(res.status, await res.text());
