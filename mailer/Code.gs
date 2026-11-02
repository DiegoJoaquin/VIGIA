/**
 * Vigía · remitente de correos gratis con tu Gmail (Google Apps Script).
 * Límite: 100 correos al día con una cuenta Gmail normal (1.500 con Google Workspace).
 *
 * Instalación (5 minutos):
 * 1. Entra a https://script.google.com con la cuenta Gmail que enviará los avisos y crea un proyecto.
 * 2. Pega este archivo completo en Code.gs y guarda.
 * 3. Proyecto > Configuración > Propiedades de la secuencia de comandos: agrega TOKEN con una clave larga al azar.
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      Ejecutar como: Yo.  Quién tiene acceso: Cualquier usuario.
 * 5. Copia la URL que termina en /exec. En el Worker:
 *      npx wrangler secret put GAS_URL     (pega la URL)
 *      npx wrangler secret put GAS_TOKEN   (pega el mismo TOKEN)
 *    y en wrangler.toml deja MAIL_PROVIDER = "gas".
 */
function doPost(e) {
  var out = function (obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var body = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) return out({ ok: false, error: 'token' });
    if (!body.to || !body.subject) return out({ ok: false, error: 'faltan datos' });
    if (MailApp.getRemainingDailyQuota() < 1) return out({ ok: false, error: 'cuota diaria agotada' });
    MailApp.sendEmail({ to: body.to, subject: body.subject, htmlBody: body.html, body: body.text, name: body.name || 'Vigía' });
    return out({ ok: true, quota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
