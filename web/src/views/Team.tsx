import { useEffect, useState } from 'react';
import type { TeamMember } from '../../../shared/types';
import { source } from '../data/source';
import { IconClose, IconPlus } from '../icons';
import { useStore } from '../store';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/** Empresa y equipo: cada empresa es una isla y solo su dueño puede invitar o quitar personas. */
export function TeamSection() {
  const s = useStore();
  const owner = s.snap!.user.role === 'owner';
  const [team, setTeam] = useState<TeamMember[]>();
  const [org, setOrg] = useState(s.snap!.user.org);
  const [orgMsg, setOrgMsg] = useState<{ ok: boolean; text: string }>();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviteErr, setInviteErr] = useState<string>();
  const [sending, setSending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string>();

  useEffect(() => { source.team().then(setTeam).catch((e) => s.say((e as Error).message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await source.renameOrg(org); setOrgMsg({ ok: true, text: 'Nombre guardado.' }); }
    catch (err) { setOrgMsg({ ok: false, text: (err as Error).message }); }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setInviteErr('Escribe un correo válido.');
    setSending(true); setInviteErr(undefined);
    try {
      const m = await source.invite(email, name);
      setTeam((t) => [...(t ?? []), m]);
      setEmail(''); setName('');
      s.say(m.mailed === false && !s.demo ? `Agregada, pero no se pudo enviar el correo` : `Invitación enviada a ${m.email}`);
    } catch (err) { setInviteErr((err as Error).message); }
    finally { setSending(false); }
  };

  const remove = async (m: TeamMember) => {
    setConfirmRemove(undefined);
    try { await source.removeMember(m.id); setTeam((t) => t?.filter((x) => x.id !== m.id)); s.say(`${m.name} ya no tiene acceso`); }
    catch (err) { s.say((err as Error).message); }
  };

  return (
    <section className="section">
      <div className="section-head"><h2>Tu empresa</h2><span className="count">{team ? `${team.length} persona${team.length === 1 ? '' : 's'}` : ''}</span></div>

      <form className="group form-card" onSubmit={saveOrg} noValidate>
        <div className="field">
          <label htmlFor="org-name">Nombre de la empresa</label>
          <input id="org-name" className="input" value={org} disabled={!owner} aria-invalid={orgMsg && !orgMsg.ok ? true : undefined}
            aria-describedby={orgMsg ? 'org-name-msg' : undefined} onChange={(e) => { setOrg(e.target.value); setOrgMsg(undefined); }} />
          {orgMsg && <p id="org-name-msg" className={orgMsg.ok ? 'muted' : 'field-error'} role={orgMsg.ok ? 'status' : 'alert'} style={{ fontSize: 'var(--t-meta)' }}>{orgMsg.text}</p>}
        </div>
        {owner && org.trim() !== s.snap!.user.org && <button className="btn small" type="submit">Guardar nombre</button>}
      </form>

      <div className="group" aria-label="Personas con acceso">
        {!team && <div className="member"><span className="faint">Cargando equipo…</span></div>}
        {team?.map((m) => (
          <div className="member" key={m.id}>
            <span className="avatar" aria-hidden="true">{initials(m.name)}</span>
            <span className="row-main">
              <span className="row-title">{m.name}{m.you ? ' (tú)' : ''}</span>
              <span className="row-meta"><span>{m.email}</span><span>{m.role === 'owner' ? 'Administra la cuenta' : 'Equipo'}</span></span>
            </span>
            {owner && !m.you && (confirmRemove === m.id
              ? <span className="doc-actions" style={{ width: 'auto' }}><button className="btn small danger" onClick={() => remove(m)}>Quitar</button><button className="btn small plain" onClick={() => setConfirmRemove(undefined)}>No</button></span>
              : <button className="icon-btn" aria-label={`Quitar a ${m.name}`} onClick={() => setConfirmRemove(m.id)}><IconClose size={16} /></button>)}
          </div>
        ))}
      </div>

      {owner ? (
        <form className="group form-card" onSubmit={invite} noValidate>
          <p className="muted" style={{ fontSize: 'var(--t-meta)' }}>Invita a quien lleva los compromisos: el encargado ambiental, el jefe de planta o tu consultor. Verá los mismos proyectos que tú.</p>
          <div className="field">
            <label htmlFor="inv-email">Correo</label>
            <input id="inv-email" className="input" type="email" inputMode="email" placeholder="nombre@empresa.cl" value={email}
              aria-invalid={inviteErr ? true : undefined} aria-describedby={inviteErr ? 'inv-error' : undefined}
              onChange={(e) => { setEmail(e.target.value); setInviteErr(undefined); }} />
            {inviteErr && <p id="inv-error" className="field-error" role="alert">{inviteErr}</p>}
          </div>
          <div className="field">
            <label htmlFor="inv-name">Nombre (opcional)</label>
            <input id="inv-name" className="input" placeholder="Nombre y apellido" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={sending}><IconPlus size={18} />{sending ? 'Enviando…' : 'Invitar'}</button>
        </form>
      ) : <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>Solo quien creó la cuenta puede invitar o quitar personas.</p>}
    </section>
  );
}

/** Cerrar sesión y eliminar la cuenta de la empresa (derecho a supresión, Ley 21.719). */
export function AccountSection() {
  const s = useStore();
  const owner = s.snap!.user.role === 'owner';
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string>();

  const del = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirm.trim() !== s.snap!.user.org) return setErr('Escribe el nombre exacto de la empresa para confirmar.');
    try { await source.deleteOrg(confirm); location.href = '/'; } catch (x) { setErr((x as Error).message); }
  };

  return (
    <section className="section">
      <div className="section-head"><h2>Cuenta</h2></div>
      <div className="group form-card">
        <p className="muted" style={{ fontSize: 'var(--t-meta)' }}>Entraste como {s.snap!.user.email}.</p>
        <div className="actions two">
          {!s.demo && <button className="btn plain" onClick={s.logout}>Cerrar sesión</button>}
          {owner && <button className="btn danger" onClick={() => setOpen((v) => !v)}>Eliminar la cuenta de la empresa</button>}
        </div>
        {open && (
          <form onSubmit={del} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="field-error" style={{ color: 'var(--ink-2)' }}>Se borran para siempre los proyectos, compromisos, documentos, evidencias y personas de <strong>{s.snap!.user.org}</strong>. No se puede deshacer.</p>
            <div className="field">
              <label htmlFor="del-confirm">Escribe «{s.snap!.user.org}» para confirmar</label>
              <input id="del-confirm" className="input" value={confirm} aria-invalid={err ? true : undefined} aria-describedby={err ? 'del-error' : undefined}
                onChange={(e) => { setConfirm(e.target.value); setErr(undefined); }} />
              {err && <p id="del-error" className="field-error" role="alert">{err}</p>}
            </div>
            <button className="btn danger" type="submit" style={{ alignSelf: 'flex-start' }}>Eliminar todo</button>
          </form>
        )}
      </div>
      <nav className="legal-links" aria-label="Información legal"><a href="/privacidad">Política de privacidad</a><a href="/terminos">Términos de uso</a></nav>
    </section>
  );
}
