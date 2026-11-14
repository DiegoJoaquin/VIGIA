// Diagnóstico: qué responde el buscador del SEIA a distintas consultas.
const UA = { 'user-agent': 'Mozilla/5.0 (vigia-prospectos; contacto frediazll@users.noreply.github.com)' };
for (const q of ['aridos', 'planta de aridos', 'parque fotovoltaico', 'solar', 'kor']) {
  for (const base of ['https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php?nombre=']) {
    try {
      const r = await fetch(base + encodeURIComponent(q), { headers: UA });
      const t = new TextDecoder('latin1').decode(Buffer.from(await r.arrayBuffer()));
      let n = '?'; try { n = JSON.parse(t).data?.length; } catch {}
      console.log(JSON.stringify({ q, status: r.status, bytes: t.length, n, head: t.slice(0, 260) }));
    } catch (e) { console.log(q, 'error', String(e)); }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
