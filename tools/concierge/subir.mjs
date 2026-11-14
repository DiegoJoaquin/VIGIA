// Sube a la cuenta de un cliente una RCA ya revisada a mano (servicio "concierge").
// Uso:  VIGIA_API=https://vigia.diazdiego011.workers.dev EXTRACTOR_TOKEN=... \
//       node tools/concierge/subir.mjs borrador.json cliente@empresa.cl [--por-revisar]
// borrador.json = { "project": {...}, "obligations": [...] }
import { readFileSync } from 'node:fs';

const [file, email, flag] = process.argv.slice(2);
const api = process.env.VIGIA_API, token = process.env.EXTRACTOR_TOKEN;
if (!file || !email || !api || !token) {
  console.error('Faltan datos. Uso: VIGIA_API=… EXTRACTOR_TOKEN=… node subir.mjs borrador.json correo [--por-revisar]');
  process.exit(1);
}
const draft = JSON.parse(readFileSync(file, 'utf8'));
const res = await fetch(`${api.replace(/\/$/, '')}/api/extractor/upload`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ email, draft, verified: flag !== '--por-revisar' }),
});
console.log(res.status, await res.text());
