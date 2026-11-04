# Vigía

Los compromisos de tu RCA, a tiempo.

Vigía lee la Resolución de Calificación Ambiental (RCA) de un proyecto, la convierte en un calendario de compromisos y avisa a cada responsable por correo, en el celular y en su calendario antes de que algo venza. Guarda la evidencia de cada cumplimiento y arma la carpeta que pediría la SMA en una fiscalización. Suma, además, las declaraciones de la Ventanilla Única (SINADER, DS 138, DJA, Ley REP, etc.), que no están en la RCA pero igual se fiscalizan.

Todo corre en capas gratuitas: **costo mensual $0**.

## Qué hay en este repositorio

| Carpeta | Qué es |
| --- | --- |
| `demo/` | La demo lista para publicar (sitio estático, sin servidor). En Vercel: Root Directory = `demo`. |
| `web/` | La app (React + Vite). Se instala en el celular como app (PWA). Funciona sin conexión. |
| `worker/` | El servidor en Cloudflare Workers: API, base de datos D1, alertas diarias, calendario `.ics`, notificaciones push. |
| `shared/` | Lógica común: modelo de datos, motor de fechas, obligaciones de Ventanilla Única, prompt de extracción y datos de demo. |
| `extractor/` | Script que lee una RCA con IA local (Ollama) en tu propio servidor y la sube a Vigía. |
| `mailer/` | Remitente de correos gratis con Gmail (Google Apps Script). |
| `tests/` | Pruebas del motor de fechas, avisos, calendario y extracción (`npm test`). |

## Cómo funciona

```
 RCA en el SEIA ──► extractor (Ollama en tu servidor) o Workers AI
                          │  compromisos con cita textual, "por revisar"
                          ▼
     ┌──────────── Cloudflare Worker (gratis) ────────────┐
     │  API  ·  D1 (base de datos)  ·  archivos de la app │
     │  Cron diario 8:00 ─► correo (Gmail / Brevo)        │
     │                   ─► notificación al celular       │
     │  /cal/<token>.ics ─► calendario iPhone/Google      │
     └────────────────────────────────────────────────────┘
                          ▲
              app en el celular o el computador
```

Reglas de diseño importantes:

- **La IA propone, una persona confirma.** Todo lo extraído entra como "por revisar" y no genera alertas hasta que alguien lo confirma.
- **Las citas son verificables.** Si la IA no copia la frase exacta de la RCA, la cita se descarta; nunca se muestra texto inventado como si fuera de la resolución.
- **El seguimiento parte el día que importas la RCA.** Lo anterior no aparece como vencido.
- **Cada empresa es una isla.** Cada cuenta es una empresa con su propio equipo, proyectos y documentos. Cada correo pertenece a una sola empresa y ninguna consulta cruza empresas. La prueba `tests/e2e/islas.py` lo verifica con 42 comprobaciones (dos empresas, invitaciones, documentos, eliminación de cuenta).

## Cuentas, equipo y documentos

- **Crear cuenta:** en la pantalla de entrada, "Crear una cuenta" pide empresa, nombre y correo. El enlace que llega crea la empresa y deja a esa persona como administradora. No hay contraseñas.
- **Equipo:** en Ajustes → Tu empresa, la administradora invita por correo (encargado ambiental, jefe de planta, consultor). Quien es invitado ve los mismos proyectos; solo la administradora puede invitar o quitar personas.
- **Documentos:** cada proyecto tiene la pestaña Documentos para guardar la RCA, resoluciones, adendas, programas de cumplimiento e informes (hasta 25 MB, guardados en D1 en trozos de 900 KB, sin costo). Las resoluciones y programas se pueden leer con IA para sumar sus compromisos al proyecto, siempre con revisión antes de guardar.
- **Eliminar la cuenta:** Ajustes → Cuenta. Borra todo lo de la empresa (derecho de supresión de la Ley 21.719).

## Páginas públicas

`web/legal/` contiene la política de privacidad, los términos de uso y la página 404. `node web/legal/build.mjs <carpeta> <url>` las arma junto con `robots.txt` y `sitemap.xml`; `npm run build` lo hace solo (usa la variable `VIGIA_URL`). **Antes de publicar con clientes reales, completa los datos entre corchetes ([Nombre o razón social], [RUT], [correo de contacto]) en `web/legal/*.body.html` y haz revisar ambos textos por un abogado.**

Analítica: la demo usa Vercel Web Analytics (sin cookies; se activa en el panel de Vercel → Analytics). La app no usa cookies de seguimiento, por eso no necesita aviso de cookies.

## Publicar la demo en Vercel

1. En vercel.com: Add New → Project → importa este repositorio.
2. En "Root Directory" toca Edit y elige `demo`. El `demo/vercel.json` hace el resto (sitio estático, sin build).
3. Deploy. Vercel publica cada cambio que subas a `main`.

El servidor (`worker/`) no va en Vercel: se publica en Cloudflare (ver más abajo).

Para regenerar la demo después de cambiar la app: `npm run build:demo` y copia `web/dist-demo/demo.html` dentro de la plantilla de `demo/index.html`. Las páginas públicas de la demo se regeneran con `node web/legal/build.mjs demo https://vigia-demo-ten.vercel.app vercel`.

## Probar en tu computador

```bash
npm install
npm test                      # 17 pruebas
npm run worker:dev            # en otra terminal, y luego:
python3 tests/e2e/islas.py <log de wrangler>   # 42 comprobaciones de cuentas, documentos e islas
npm run build                 # compila la app en web/dist
cd worker
npm run db:init:local         # crea la base local
npm run dev                   # http://127.0.0.1:8787
```

Los correos se imprimen en la consola (incluido el enlace para entrar). Para ver la app con datos de demostración sin servidor: `npm run dev` en la raíz y abre `http://localhost:5173/?demo`.

Para disparar las alertas diarias a mano mientras pruebas:
`curl "http://127.0.0.1:8787/__scheduled?cron=0+11+*+*+*"`

## Publicar gratis en internet (unos 30 minutos)

1. **Cuenta de Cloudflare.** Crea una cuenta gratis en cloudflare.com (no pide tarjeta para Workers ni D1).
2. **Entrar desde la terminal.** `cd worker && npx wrangler login`
3. **Base de datos.** `npx wrangler d1 create vigia` y copia el `database_id` que entrega en `worker/wrangler.toml`. Luego `npm run db:init`.
4. **Correos.** Elige una opción y configúrala:
   - **Gmail con Apps Script (recomendado para partir, sin dominio):** sigue las instrucciones de `mailer/Code.gs`. En `wrangler.toml` deja `MAIL_PROVIDER = "gas"` y carga `GAS_URL` y `GAS_TOKEN` con `npx wrangler secret put`.
   - **Brevo (300 al día):** crea cuenta, verifica el remitente, `MAIL_PROVIDER = "brevo"` y `npx wrangler secret put BREVO_API_KEY`.
   - **Resend (3.000 al mes):** requiere un dominio propio verificado.
5. **Notificaciones en el celular.** Genera las claves una vez: `npx web-push generate-vapid-keys`. Carga `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (por ejemplo `mailto:tu@correo.cl`) con `npx wrangler secret put`.
6. **Token del extractor.** `npx wrangler secret put EXTRACTOR_TOKEN` con una clave larga al azar.
7. **Publicar.** Desde la raíz: `npm run build`, luego `cd worker && npx wrangler deploy`. Te entrega una dirección `https://vigia.<tu-subdominio>.workers.dev`. Ponla en `APP_URL` dentro de `wrangler.toml` y vuelve a publicar.
8. **Entrar.** Abre la dirección, toca "Crear una cuenta", escribe la empresa, tu nombre y tu correo, y usa el enlace que llega.
9. **Páginas públicas con tu dirección.** Antes de `npm run build`, define `VIGIA_URL` con la misma dirección de `APP_URL` (en Windows: `set VIGIA_URL=https://...`) para que el sitemap y la imagen para compartir apunten bien.

En iPhone, para recibir notificaciones: abre Vigía en Safari, toca Compartir → "Agregar a inicio", abre la app desde el ícono y activa las notificaciones en Ajustes.

## Leer RCA con tu servidor (Ollama, gratis)

```bash
# en el servidor (Windows, Linux o Mac)
ollama pull qwen2.5:14b          # ~9 GB; si el equipo es modesto: qwen2.5:7b
pip install requests pypdf
python extractor/extract_rca.py \
  --url https://firma.sea.gob.cl/publicaciones/eb/39/2145128410.pdf \
  --api https://vigia.<tu-subdominio>.workers.dev --token TU_EXTRACTOR_TOKEN \
  --email cliente@empresa.cl
```

El proyecto aparece en la cuenta de ese correo con todos los compromisos "por revisar". Si el PDF es escaneado, pásalo antes por OCR (`ocrmypdf entrada.pdf salida.pdf`).

Alternativa sin servidor: el botón "Importar RCA" de la app usa Workers AI (capa gratuita de Cloudflare). Sirve para RCA cortas; para RCA largas y mejor calidad, usa el extractor local.

## Capas gratuitas que usa

| Servicio | Límite gratis | Uso típico de Vigía |
| --- | --- | --- |
| Cloudflare Workers | 100.000 solicitudes al día | Unos cientos al día por empresa |
| Cloudflare D1 | 5 GB | Evidencias comprimidas y documentos: cientos de RCA |
| Cron Triggers | Incluido | 1 ejecución al día |
| Workers AI | 10.000 "neuronas" al día | Algunas RCA al día |
| Gmail (Apps Script) | 100 correos al día | 1 correo diario por usuario |
| Brevo | 300 correos al día | Igual |
| Web Push | Sin costo | Notificaciones al celular |
| Calendario `.ics` | Sin costo | Suscripción en iPhone, Google, Outlook |

Cuándo empezarías a pagar: con más de unos 80 usuarios activos conviene un dominio propio (unos $10.000 al año en NIC Chile) y Brevo o Resend con ese dominio, para que los correos no caigan en spam.

## Mapa del código

- `shared/recurrence.ts`: convierte cada frecuencia (mensual, trimestral, "del mes anterior", eventos) en fechas.
- `shared/ventanilla.ts`: cuestionario de 5 preguntas que activa las obligaciones de la Ventanilla Única.
- `shared/extraction.ts`: prompt de la IA, división del texto, verificación de citas.
- `worker/src/notify.ts`: decide qué avisar cada día (sin repetir) y envía correo y push.
- `worker/src/ics.ts`: calendario suscribible.
- `web/src/views/*`: pantallas Hoy, Calendario, Proyectos, Importar y Ajustes.
