import { useRef, useState } from 'react';
import { ApiSource, source } from '../data/source';
import { IconMail } from '../icons';

type Field = 'email' | 'name' | 'company';
const ERRORS: Record<string, string> = {
  enlace: 'Ese enlace ya se usó o venció. Pide uno nuevo.',
  cuenta: 'Esa cuenta no existe. Crea una cuenta nueva.',
};

export function Login({ mark }: { mark: React.ReactNode }) {
  const q = new URLSearchParams(location.search);
  const [mode, setMode] = useState<'login' | 'signup'>(q.get('crear') !== null ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sentNote, setSentNote] = useState('');
  const [error, setError] = useState<{ field?: Field; text: string; noAccount?: boolean } | undefined>(
    ERRORS[q.get('error') ?? ''] ? { text: ERRORS[q.get('error')!] } : undefined);
  const refs = { email: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null), company: useRef<HTMLInputElement>(null) };

  const fail = (field: Field | undefined, text: string, noAccount?: boolean) => {
    setError({ field, text, noAccount });
    if (field) refs[field].current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && company.trim().length < 2) return fail('company', 'Escribe el nombre de la empresa.');
    if (mode === 'signup' && name.trim().length < 2) return fail('name', 'Escribe tu nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail('email', 'Escribe un correo válido, por ejemplo nombre@empresa.cl.');
    setError(undefined); setState('sending');
    try {
      const r = await (source as ApiSource).requestLogin({ email: email.trim(), mode, name: name.trim(), company: company.trim() });
      setSentNote(r.existing ? 'Ese correo ya tenía cuenta, así que te mandamos un enlace para entrar.' : '');
      setState('sent');
    } catch (err) {
      const x = err as Error & { field?: Field; noAccount?: boolean };
      setState('idle');
      fail(x.field, x.message, x.noAccount);
    }
  };

  const fieldProps = (f: Field) => ({
    ref: refs[f],
    'aria-invalid': error?.field === f || undefined,
    'aria-describedby': error?.field === f ? `login-${f}-error` : undefined,
  });
  const fieldError = (f: Field) => error?.field === f && <p id={`login-${f}-error`} className="field-error" role="alert">{error.text}</p>;
  const switchTo = (m: 'login' | 'signup') => { setMode(m); setError(undefined); setState('idle'); };

  return (
    <div className="page" style={{ maxWidth: 440, paddingBlock: '10vh 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        {mark}
        <h1 className="large-title">{mode === 'signup' ? 'Crea la cuenta de tu empresa' : 'Entra a Vigía'}</h1>
        <p className="muted">
          {mode === 'signup'
            ? 'Cada empresa tiene su propio espacio: sus proyectos, documentos y equipo no se mezclan con los de nadie más.'
            : 'Los compromisos de tu RCA, a tiempo. Te mandamos un enlace al correo; no necesitas contraseña.'}
        </p>
      </div>

      {state === 'sent' ? (
        <div className="banner is-info" role="status">
          <IconMail />
          <div>
            <p><strong>Revisa tu correo.</strong> Enviamos un enlace a {email}. Vence en 20 minutos. {sentNote}</p>
            <button className="btn small plain" onClick={() => setState('idle')}>Usar otro correo</button>
          </div>
        </div>
      ) : (
        <form className="section" onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <>
              <div className="field">
                <label htmlFor="login-company">Empresa</label>
                <input id="login-company" className="input" autoComplete="organization" placeholder="Viña Los Boldos Ltda." value={company}
                  onChange={(e) => { setCompany(e.target.value); if (error?.field === 'company') setError(undefined); }} {...fieldProps('company')} />
                {fieldError('company')}
              </div>
              <div className="field">
                <label htmlFor="login-name">Tu nombre</label>
                <input id="login-name" className="input" autoComplete="name" placeholder="Nombre y apellido" value={name}
                  onChange={(e) => { setName(e.target.value); if (error?.field === 'name') setError(undefined); }} {...fieldProps('name')} />
                {fieldError('name')}
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="login-email">Correo de trabajo</label>
            <input id="login-email" className="input" type="email" inputMode="email" autoComplete="email" placeholder="nombre@empresa.cl" value={email}
              onChange={(e) => { setEmail(e.target.value); if (error?.field === 'email') setError(undefined); }} {...fieldProps('email')} />
            {fieldError('email')}
          </div>
          {error && !error.field && <p className="form-error" role="alert">{error.text}</p>}
          {error?.noAccount && <button type="button" className="btn small secondary" style={{ alignSelf: 'flex-start' }} onClick={() => switchTo('signup')}>Crear una cuenta con ese correo</button>}
          <button className="btn block" type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Enviando…' : mode === 'signup' ? 'Crear cuenta' : 'Enviarme el enlace'}
          </button>
          <p className="muted" style={{ fontSize: 'var(--t-meta)', textAlign: 'center' }}>
            {mode === 'signup'
              ? <>¿Ya tienes cuenta? <button type="button" className="link-btn" onClick={() => switchTo('login')}>Entrar</button></>
              : <>¿Tu empresa aún no usa Vigía? <button type="button" className="link-btn" onClick={() => switchTo('signup')}>Crear una cuenta</button></>}
          </p>
          {mode === 'signup' && <p className="faint" style={{ fontSize: 'var(--t-meta)' }}>Al crear la cuenta aceptas los <a href="/terminos">términos de uso</a> y la <a href="/privacidad">política de privacidad</a>.</p>}
        </form>
      )}
      <nav className="legal-links" aria-label="Información legal"><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a></nav>
    </div>
  );
}
