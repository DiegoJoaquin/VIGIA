// Arma las páginas públicas (privacidad, términos, 404, robots.txt, sitemap.xml).
// Uso: node legal/build.mjs <carpeta destino> [url del sitio] [vercel]
// Sin url, usa la variable VIGIA_URL (la misma dirección que APP_URL en wrangler.toml).
// Con "vercel" se agrega Vercel Web Analytics, que no usa cookies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const [out, siteArg, ...flags] = process.argv.slice(2);
const site = (siteArg ?? process.env.VIGIA_URL ?? 'https://vigia.example').replace(/\/$/, '');
const read = (f) => readFileSync(join(here, f), 'utf8');
const head = read('_head.html');
let foot = read('_foot.html');
if (!flags.includes('vercel')) foot = foot.split('\n').filter((l) => !l.includes('insights') && !l.includes('Analítica')).join('\n');

const pages = {
  privacidad: ['Política de privacidad', 'Qué datos trata Vigía, para qué y cómo ejercer tus derechos.', '/privacidad'],
  terminos: ['Términos de uso', 'Las condiciones para usar Vigía.', '/terminos'],
  404: ['Página no encontrada', 'Esta página no existe.', '/404'],
};
for (const [name, [title, desc, path]] of Object.entries(pages)) {
  let h = head.replaceAll('{{TITLE}}', title).replaceAll('{{DESC}}', desc).replaceAll('{{SITE}}', site).replaceAll('{{PATH}}', path);
  if (name === '404') h = h.replace('<link rel="canonical"', '<meta name="robots" content="noindex">\n<link rel="canonical"');
  writeFileSync(join(out, `${name}.html`), h + read(`${name}.body.html`) + foot);
}
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`);
const urls = ['/', '/privacidad', '/terminos'];
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site}${u}</loc><lastmod>2026-11-03</lastmod></url>`).join('\n')}\n</urlset>\n`);
console.log(`Páginas públicas listas en ${out} para ${site}`);
