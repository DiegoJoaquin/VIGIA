import { useMemo, useState } from 'react';
import { longDate, relative, shortDate } from '../format';
import { IconBell, IconCalendar, IconMail, IconPhone } from '../icons';
import { useStore } from '../store';
import type { NotifySettings } from '../data/source';

function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <span className="switch"><input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} /><span /></span>;
}

export function Settings() {
  const s = useStore();
  const n = s.snap!.notify;
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [copied, setCopied] = useState(false);
  const set = (k: keyof NotifySettings) => (v: boolean) => s.setNotify({ ...n, [k]: v });

  const copy = async () => {
    try { await navigator.clipboard.writeText(s.snap!.calendarUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { const el = document.getElementById('cal-url'); if (el) { const r = document.createRange(); r.selectNodeContents(el); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); } }
  };

  return (
    <div className="page">
      <header><h1 className="large-title">Ajustes</h1></header>

      <section className="section">
        <div className="section-head"><h2>Avisos por correo</h2><span className="count">{s.snap!.user.email}</span></div>
        <div className="group">
          <div className="setting"><span className="setting-icon"><IconMail size={17} /></span><div className="setting-main"><span>Resumen del lunes</span><small>Lo que vence en la semana y lo pendiente, a las 8:00.</small></div><Switch id="n-weekly" checked={n.weeklyDigest} onChange={set('weeklyDigest')} label="Resumen del lunes" /></div>
          <div className="setting"><span className="setting-icon"><IconBell size={17} /></span><div className="setting-main"><span>7 días antes</span><small>Tiempo para agendar laboratorio o topógrafo.</small></div><Switch id="n-7" checked={n.before7} onChange={set('before7')} label="Aviso 7 días antes" /></div>
          <div className="setting"><span className="setting-icon"><IconBell size={17} /></span><div className="setting-main"><span>El día anterior</span></div><Switch id="n-1" checked={n.before1} onChange={set('before1')} label="Aviso el día anterior" /></div>
          <div className="setting"><span className="setting-icon" style={{ background: 'var(--danger)' }}><IconBell size={17} /></span><div className="setting-main"><span>Si algo se vence</span><small>Aviso diario hasta que se marque como cumplido.</small></div><Switch id="n-over" checked={n.overdue} onChange={set('overdue')} label="Aviso de vencidos" /></div>
        </div>
        <div className="actions two">
          <button className="btn plain" onClick={() => setPreview((v) => !v)}>{preview ? 'Ocultar ejemplo' : 'Ver cómo llega el correo'}</button>
          <button className="btn secondary" onClick={async () => setMsg(await s.testEmail())}>Enviarme un correo de prueba</button>
        </div>
        {msg && <p className="muted" style={{ paddingInline: 4 }}>{msg}</p>}
        {preview && <MailPreview />}
      </section>

      <section className="section">
        <div className="section-head"><h2>En el celular</h2></div>
        <div className="group">
          <div className="setting"><span className="setting-icon"><IconPhone size={17} /></span><div className="setting-main"><span>Notificaciones en el celular</span><small>Llegan como cualquier app. En iPhone, primero agrega Vigía a tu pantalla de inicio.</small></div><Switch id="n-push" checked={n.push} onChange={set('push')} label="Notificaciones en el celular" /></div>
        </div>
        <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>Para instalar: en Safari toca Compartir y luego "Agregar a inicio". En Android, Chrome ofrece "Instalar app".</p>
      </section>

      <section className="section">
        <div className="section-head"><h2>En tu calendario</h2></div>
        <div className="group" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="setting-icon"><IconCalendar size={17} /></span>
            <p className="muted" style={{ fontSize: 'var(--t-meta)' }}>Suscríbete una vez y cada vencimiento aparece en el calendario del iPhone, Google o Outlook, con su propio recordatorio. Se actualiza solo.</p>
          </div>
          <div className="copy-field"><code id="cal-url">{s.snap!.calendarUrl}</code><button className="btn small" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button></div>
        </div>
      </section>

      {s.demo && (
        <section className="section">
          <div className="section-head"><h2>Demo</h2></div>
          <div className="group" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="muted" style={{ fontSize: 'var(--t-meta)' }}>Los datos vienen de tres RCA públicas del SEIA. Lo que marques queda guardado solo en este navegador.</p>
            <button className="btn plain small" style={{ alignSelf: 'flex-start' }} onClick={s.resetDemo}>Restablecer la demo</button>
          </div>
        </section>
      )}
    </div>
  );
}

function MailPreview() {
  const { occurrences, today } = useStore();
  const { late, week } = useMemo(() => ({
    late: occurrences.filter((o) => o.status === 'overdue'),
    week: occurrences.filter((o) => o.status !== 'done' && o.daysLeft >= 0 && o.daysLeft <= 7),
  }), [occurrences]);
  return (
    <div className="mail" aria-label="Ejemplo del correo del lunes">
      <div className="mail-head">
        <strong>Vigía · Tu semana: {week.length} vencimientos{late.length ? `, ${late.length} atrasado` : ''}</strong>
        <span>Para: encargado@tuempresa.cl · {longDate(today)}, 8:00</span>
      </div>
      <div className="mail-body">
        <h3>Esta semana tienes {week.length} compromisos ambientales</h3>
        {late.length > 0 && late.map((o) => (
          <div className="mail-item" key={o.key}><span><b>{o.obligation.title}</b><br /><span style={{ color: '#59625e' }}>{o.project.shortName}</span></span><span className="when late">{relative(o)}</span></div>
        ))}
        {week.map((o) => (
          <div className="mail-item" key={o.key}><span><b>{o.obligation.title}</b><br /><span style={{ color: '#59625e' }}>{o.project.shortName}</span></span><span className="when">{shortDate(o.due, today)}</span></div>
        ))}
        <span className="mail-cta">Abrir Vigía</span>
        <span style={{ color: '#89928e', fontSize: 12 }}>Recibes este correo porque activaste el resumen del lunes.</span>
      </div>
    </div>
  );
}
