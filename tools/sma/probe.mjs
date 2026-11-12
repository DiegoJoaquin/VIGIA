// Explora las fichas públicas de procedimientos sancionatorios de SNIFA (se ejecuta en GitHub Actions).
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'accept-language': 'es-CL,es' };
for (const id of [2299, 3156, 4025, 4070]) {
  try {
    const r = await fetch(`https://snifa.sma.gob.cl/Sancionatorio/Ficha/${id}`, { headers: UA });
    const t = await r.text(); writeFileSync(`${out}/ficha-${id}.html`, t); console.log(id, r.status, t.length);
  } catch (e) { console.log(id, 'ERR', String(e), String(e.cause ?? '')); }
}
