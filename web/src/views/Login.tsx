import { useState } from 'react';
import { ApiSource, source } from '../data/source';
import { IconMail } from '../icons';

export function Login({ mark }: { mark: React.ReactNode }) {
  const expired = new URLSearchParams(location.search).get('error') === 'enlace';
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState(expired ? 'Ese enlace ya se usó o venció. Pide uno nuevo.' : '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setState('sending');
    try { await (source as ApiSource).requestLogin(email.trim()); setState('sent'); }
    catch (err) { setError((err as Error).message); setState('idle'); }
  };

  return (
    <div className="page" style={{ maxWidth: 420, paddingBlock: '12vh 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        {mark}
        <h1 className="large-title">Entra a Vigía</h1>
        <p className="muted">Los compromisos de tu RCA, a tiempo. Te mandamos un enlace al correo; no necesitas contraseña.</p>
      </div>
      {state === 'sent' ? (
        <div className="banner is-info">
          <IconMail />
          <div><p><strong>Revisa tu correo.</strong> Enviamos un enlace a {email}. Vence en 20 minutos.</p>
            <button className="btn small plain" onClick={() => setState('idle')}>Usar otro correo</button></div>
        </div>
      ) : (
        <form className="section" onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Correo de trabajo</label>
            <input id="login-email" className="input" type="email" autoComplete="email" required placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn block" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : 'Enviarme el enlace'}</button>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </form>
      )}
    </div>
  );
}
