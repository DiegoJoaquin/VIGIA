import { useEffect, useRef, useState } from 'react';
import { ApiSource, source } from '../data/source';
import { Segmented } from '../components';
import { IconBell, IconCalendar, IconCheck, IconEye, IconEyeOff, IconFolder, IconMail, IconShield } from '../icons';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';
type Field = 'email' | 'password' | 'name' | 'company';
interface Err { field?: Field; text: string; exists?: boolean; expired?: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Portada de Vigía: presenta el producto y deja entrar o crear la cuenta con correo y contraseña.
 * Con ?clave=... (enlace del correo) muestra el formulario para crear o cambiar la contraseña.
 */
export function Login({ mark, demo = false }: { mark: React.ReactNode; demo?: boolean }) {
  const q = new URLSearchParams(location.search);
  const token = q.get('clave');
  const [mode, setMode] = useState<Mode>(token ? 'reset' : q.has('crear') ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<Err>();
  const refs = { email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null), company: useRef<HTMLInputElement>(null) };

  useEffect(() => { document.title = `${mode === 'signup' ? 'Crear cuenta' : mode === 'reset' ? 'Nueva contraseña' : mode === 'forgot' ? 'Recuperar contraseña' : 'Entrar'} · Vigía`; }, [mode]);

  const go = (m: Mode) => { setMode(m); setError(undefined); setSent(false); };
  const fail = (e: Err) => { setError(e); if (e.field) refs[e.field].current?.focus(); };
  const enter = () => { history.replaceState(null, '', '/#hoy'); location.reload(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validación en el navegador, campo por campo, antes de ir al servidor.
    if (mode === 'signup' && company.trim().length < 2) return fail({ field: 'company', text: 'Escribe el nombre de la empresa.' });
    if (mode === 'signup' && name.trim().length < 2) return fail({ field: 'name', text: 'Escribe tu nombre.' });
    if (mode !== 'reset' && !EMAIL.test(email.trim())) return fail({ field: 'email', text: 'Escribe un correo válido, por ejemplo nombre@empresa.cl.' });
    if (mode !== 'forgot' && !password) return fail({ field: 'password', text: mode === 'login' ? 'Escribe tu contraseña.' : 'Elige una contraseña.' });
    if ((mode === 'signup' || mode === 'reset') && password.length < 8) return fail({ field: 'password', text: 'Usa al menos 8 caracteres.' });

    setError(undefined); setBusy(true);
    if (demo) { setTimeout(() => { location.hash = '#hoy'; }, 350); return; }
    const api = source as ApiSource;
    try {
      if (mode === 'login') { await api.login({ email: email.trim(), password }); enter(); }
      else if (mode === 'signup') { await api.signup({ email: email.trim(), password, name: name.trim(), company: company.trim() }); enter(); }
      else if (mode === 'forgot') { await api.forgot(email.trim()); setSent(true); setBusy(false); }
      else { await api.reset(token ?? '', password); enter(); }
    } catch (err) {
      const x = err as Error & { field?: Field; exists?: boolean; expired?: boolean; noPassword?: boolean };
      setBusy(false);
      if (x.noPassword) { setSent(true); setMode('forgot'); return; }
      fail({ field: x.field, text: x.message, exists: x.exists, expired: x.expired });
    }
  };

  const input = (f: Field, props: React.InputHTMLAttributes<HTMLInputElement>, value: string, set: (v: string) => void) => (
    <input id={`auth-${f}`} ref={refs[f]} className="input" value={value}
      aria-invalid={error?.field === f || undefined} aria-describedby={error?.field === f ? `auth-${f}-error` : undefined}
      onChange={(e) => { set(e.target.value); if (error?.field === f) setError(undefined); }} {...props} />
  );
  const fieldError = (f: Field) => error?.field === f && <p id={`auth-${f}-error`} className="field-error" role="alert">{error.text}</p>;

  const heading = { login: 'Entra a tu cuenta', signup: 'Crea la cuenta de tu empresa', forgot: 'Recupera tu contraseña', reset: 'Elige tu contraseña' }[mode];
  const lead = {
    login: 'Los compromisos de tus RCA, en un solo lugar.',
    signup: 'Gratis durante el piloto. Tus proyectos y documentos solo los ve tu equipo.',
    forgot: 'Escribe tu correo y te mandamos un enlace para elegir una contraseña nueva.',
    reset: 'Con ella entrarás desde ahora, en el computador o en el celular.',
  }[mode];

  return (
    <div className="auth">
      <aside className="auth-hero" aria-label="Qué es Vigía">
        <div className="auth-brand">{mark}<span>Vigía</span></div>
        <div className="auth-pitch">
          <h1>Los compromisos de tu RCA, a tiempo.</h1>
          <p>Vigía lee la resolución, arma el calendario de cada monitoreo y reporte, y avisa a tu equipo antes de que algo venza.</p>
        </div>
        <ul className="auth-points">
          <li><span><IconCalendar size={18} /></span>Calendario con cada compromiso, citado de la RCA</li>
          <li><span><IconBell size={18} /></span>Avisos por correo, en el celular y en tu calendario</li>
          <li><span><IconFolder size={18} /></span>Carpeta lista para una fiscalización de la SMA</li>
        </ul>
        <div className="auth-preview" aria-hidden="true">
          <p className="auth-preview-k">Esta semana</p>
          <div className="auth-preview-row"><span className="check is-overdue" /><div><b>Reporte RIL a la SMA</b><small>Viña · Palmilla</small></div><em className="is-late">Hace 3 d</em></div>
          <div className="auth-preview-row"><span className="check" /><div><b>Monitoreo mensual del RIL</b><small>Viña · Palmilla</small></div><em>vie 20</em></div>
          <div className="auth-preview-row"><span className="check is-done"><IconCheck size={13} /></span><div><b>Declaración SINADER</b><small>Ventanilla Única</small></div><em className="is-ok">Hecho</em></div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          {(mode === 'login' || mode === 'signup') && (
            <Segmented label="Entrar o crear cuenta" value={mode} onChange={(v) => go(v)} className="auth-seg"
              options={[{ value: 'login', label: 'Entrar' }, { value: 'signup', label: 'Crear cuenta' }]} />
          )}
          <header className="auth-head">
            <h2>{heading}</h2>
            <p>{lead}</p>
          </header>

          {sent ? (
            <div className="banner is-info" role="status">
              <IconMail />
              <div>
                <p><strong>Revisa tu correo.</strong> Si {email || 'ese correo'} tiene cuenta, te llegará un enlace que vence en 1 hora. Mira también en Spam.</p>
                <button className="btn small plain" onClick={() => go('login')}>Volver a entrar</button>
              </div>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit} noValidate>
              {mode === 'signup' && (
                <>
                  <div className="field">
                    <label htmlFor="auth-company">Empresa</label>
                    {input('company', { autoComplete: 'organization', placeholder: 'Viña Los Boldos Ltda.' }, company, setCompany)}
                    {fieldError('company')}
                  </div>
                  <div className="field">
                    <label htmlFor="auth-name">Tu nombre</label>
                    {input('name', { autoComplete: 'name', placeholder: 'Nombre y apellido' }, name, setName)}
                    {fieldError('name')}
                  </div>
                </>
              )}
              {mode !== 'reset' && (
                <div className="field">
                  <label htmlFor="auth-email">Correo de trabajo</label>
                  {input('email', { type: 'email', inputMode: 'email', autoComplete: 'username', autoCapitalize: 'none', spellCheck: false, placeholder: 'nombre@empresa.cl' }, email, setEmail)}
                  {fieldError('email')}
                </div>
              )}
              {mode !== 'forgot' && (
                <div className="field">
                  <div className="field-top">
                    <label htmlFor="auth-password">{mode === 'login' ? 'Contraseña' : 'Contraseña nueva'}</label>
                    {mode === 'login' && <button type="button" className="link-btn small" onClick={() => go('forgot')}>¿La olvidaste?</button>}
                  </div>
                  <div className="input-wrap">
                    {input('password', {
                      type: show ? 'text' : 'password',
                      autoComplete: mode === 'login' ? 'current-password' : 'new-password',
                      placeholder: mode === 'login' ? '' : 'Al menos 8 caracteres',
                    }, password, setPassword)}
                    <button type="button" className="input-icon" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}>
                      {show ? <IconEyeOff size={19} /> : <IconEye size={19} />}
                    </button>
                  </div>
                  {fieldError('password')}
                  {(mode === 'signup' || mode === 'reset') && !error && <Strength value={password} />}
                </div>
              )}

              {error && !error.field && <p className="form-error" role="alert">{error.text}</p>}
              {error?.exists && <button type="button" className="btn small secondary" style={{ alignSelf: 'flex-start' }} onClick={() => go('login')}>Entrar con ese correo</button>}
              {error?.expired && <button type="button" className="btn small secondary" style={{ alignSelf: 'flex-start' }} onClick={() => { history.replaceState(null, '', '/'); go('forgot'); }}>Pedir un enlace nuevo</button>}

              <button className="btn block auth-submit" type="submit" disabled={busy}>
                {busy ? <span className="spinner" aria-hidden="true" /> : null}
                {busy ? 'Un momento…' : { login: 'Entrar', signup: 'Crear cuenta', forgot: 'Enviarme el enlace', reset: 'Guardar y entrar' }[mode]}
              </button>

              {mode === 'signup' && <p className="auth-fine">Al crear la cuenta aceptas los <a href="/terminos">términos de uso</a> y la <a href="/privacidad">política de privacidad</a>.</p>}
              {(mode === 'forgot' || mode === 'reset') && <button type="button" className="link-btn small" style={{ alignSelf: 'center' }} onClick={() => { history.replaceState(null, '', '/'); go('login'); }}>Volver a entrar</button>}
            </form>
          )}

          <p className="auth-trust"><IconShield size={16} />Cada empresa tiene su propio espacio. Nadie más ve tus proyectos.</p>
        </div>
        <nav className="legal-links" aria-label="Información legal"><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a></nav>
      </main>
    </div>
  );
}

/** Indicador simple de qué tan segura es la contraseña mientras se escribe. */
function Strength({ value }: { value: string }) {
  if (!value) return <p className="hint">Usa al menos 8 caracteres. Una frase es más segura y fácil de recordar.</p>;
  const score = (value.length >= 8 ? 1 : 0) + (value.length >= 12 ? 1 : 0) + (/[A-ZÁÉÍÓÚÑ]/.test(value) && /[a-záéíóúñ]/.test(value) ? 1 : 0) + (/[\d\W_]/.test(value) ? 1 : 0);
  const label = value.length < 8 ? 'Muy corta' : score <= 2 ? 'Aceptable' : score === 3 ? 'Buena' : 'Muy buena';
  return (
    <div className="strength" aria-live="polite">
      <span className="strength-bar"><i style={{ transform: `scaleX(${Math.max(0.08, score / 4)})` }} data-level={value.length < 8 ? 0 : score} /></span>
      <span className="hint">{label}</span>
    </div>
  );
}
