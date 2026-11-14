// Lee una RCA con el mismo lector que usa la app y deja un borrador.json para revisar a mano.
// Uso: npx esbuild tools/concierge/leer.ts --bundle --platform=node --format=esm --outfile=/tmp/leer.mjs && node /tmp/leer.mjs texto.txt borrador.json
import { readFileSync, writeFileSync } from 'node:fs';
import { ruleObligations } from '../../shared/rules';
import { guessProjectMeta, standardObligations } from '../../shared/extraction';
import type { Project } from '../../shared/types';

const [src, out] = process.argv.slice(2);
const text = readFileSync(src, 'utf8');
const id = 'p-' + Math.random().toString(16).slice(2, 8);
const meta = guessProjectMeta(text);
const name = meta.name ?? 'Proyecto importado';
const project: Project = {
  id, name, shortName: name.length > 34 ? `${name.slice(0, 32)}…` : name, titular: meta.titular ?? 'Titular por confirmar', rubro: 'Otro',
  comuna: meta.comuna ?? 'Por confirmar', region: '', instrument: /estudio de impacto/i.test(text) ? 'EIA' : 'DIA', rcaLabel: 'RCA importada',
  sourceUrl: 'archivo', phase: 'Operación', trackingStart: new Date().toISOString().slice(0, 8) + '01',
};
const found = ruleObligations(text, id);
const std = standardObligations(text, id).filter((s) => !found.some((f) => f.quote && s.quote && f.quote.slice(0, 40) === s.quote.slice(0, 40)));
writeFileSync(out, JSON.stringify({ project, obligations: [...found, ...std] }, null, 1));
console.log(project.name, '|', found.length, 'por reglas +', std.length, 'avisos estándar');
