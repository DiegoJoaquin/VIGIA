import { useState } from 'react';
import { frequencyLabel } from '../../../shared/recurrence';
import { diffReview, type FeedbackItem } from '../../../shared/learning';
import { FREQUENCY_LABEL } from '../../../shared/standard';
import type { FrequencyKind, Obligation, Recipient } from '../../../shared/types';
import type { ImportDraft } from '../data/source';
import { IconCheck } from '../icons';

const KINDS = Object.keys(FREQUENCY_LABEL) as FrequencyKind[];
const RECIPIENTS: Recipient[] = ['SMA', 'SEA', 'CMN', 'SEREMI de Salud', 'DOH', 'Interno'];
const LEARNED: Record<NonNullable<Obligation['learned']>, string> = {
  edited: 'Ajustado con revisiones anteriores',
  added: 'Agregado por revisiones anteriores',
  removed: 'Otras revisiones lo descartaron',
};

/**
 * Lista de compromisos propuestos por la lectura automática, para revisar antes de guardarlos.
 * La persona puede quitar, corregir o agregar; cada decisión se envía como aprendizaje.
 */
export function ReviewDraft({ draft, heading, sub, disabledText, onSave }: {
  draft: ImportDraft;
  heading: string;
  sub?: string;
  disabledText?: string;
  onSave: (keep: string[], final: Obligation[], feedback: FeedbackItem[]) => Promise<void>;
}) {
  const [list, setList] = useState<Obligation[]>(draft.obligations);
  const [keep, setKeep] = useState<Set<string>>(() => new Set(draft.obligations.filter((o) => o.learned !== 'removed').map((o) => o.id)));
  const [open, setOpen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!list.length && !adding) {
    return (
      <div className="group empty">
        <p>No encontramos compromisos con fecha en este documento. Si crees que sí los tiene, revisa que el PDF tenga texto seleccionable o agrégalos a mano.</p>
        <button className="btn small secondary" onClick={() => setAdding(true)}>Agregar un compromiso</button>
      </div>
    );
  }

  const update = (id: string, patch: Partial<Obligation>) => setList((l) => l.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const toggle = (id: string) => { const n = new Set(keep); n.has(id) ? n.delete(id) : n.add(id); setKeep(n); };

  const save = async () => {
    setSaving(true); setError(undefined);
    try {
      const ids = list.filter((o) => keep.has(o.id)).map((o) => o.id);
      await onSave(ids, list, diffReview(draft.obligations, list, ids));
    } catch (e) { setError((e as Error).message); setSaving(false); }
  };

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>{heading}</h2>{sub && <span className="count">{sub}</span>}</div>
        <div className="group">
          {list.map((o) => {
            const on = keep.has(o.id);
            return (
              <div key={o.id}>
                <div className="row">
                  <label style={{ display: 'contents', cursor: 'pointer' }}>
                    <input type="checkbox" className="sr" checked={on} onChange={() => toggle(o.id)} />
                    <span className={`check ${on ? 'is-done' : ''}`} style={{ pointerEvents: 'none' }}><IconCheck size={15} /></span>
                    <span className="row-main">
                      <span className="row-title">{o.title}</span>
                      <span className="row-meta">
                        <span>{frequencyLabel(o.frequency)}</span>
                        {o.recipient !== 'Interno' && <span>a {o.recipient}</span>}
                        {o.section && <span>{o.section}</span>}
                        {!o.quote && <span style={{ color: 'var(--warn)' }}>Sin cita textual</span>}
                        {o.learned && <span style={{ color: 'var(--accent)' }}>{LEARNED[o.learned]}</span>}
                      </span>
                    </span>
                  </label>
                  <button className="link-btn" style={{ flexShrink: 0 }} aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? undefined : o.id)}>
                    {open === o.id ? 'Listo' : 'Corregir'}
                  </button>
                </div>
                {open === o.id && <Editor o={o} onChange={(p) => update(o.id, p)} />}
              </div>
            );
          })}
        </div>
        {adding
          ? <AddForm onCancel={() => setAdding(false)} onAdd={(o) => { setList((l) => [...l, o]); setKeep((k) => new Set([...k, o.id])); setAdding(false); }} projectId={draft.project.id} />
          : <button className="link-btn" style={{ alignSelf: 'flex-start', paddingInline: 4 }} onClick={() => setAdding(true)}>+ Agregar uno que faltó</button>}
        <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>Quita los que no correspondan y corrige la frecuencia si la RCA dice otra cosa. Cada corrección le enseña a Vigía a leer mejor la próxima RCA.</p>
      </section>
      <button className="btn block" disabled={!keep.size || saving || !!disabledText} onClick={save}>
        {disabledText ?? (saving ? 'Guardando…' : `Agregar ${keep.size} compromisos`)}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

function Editor({ o, onChange }: { o: Obligation; onChange: (p: Partial<Obligation>) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '4px 16px 16px 52px' }}>
      <div className="field"><label htmlFor={`t-${o.id}`}>Nombre</label>
        <input id={`t-${o.id}`} className="input" value={o.title} maxLength={80} onChange={(e) => onChange({ title: e.target.value })} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field"><label htmlFor={`f-${o.id}`}>Frecuencia</label>
          <select id={`f-${o.id}`} className="input" value={o.frequency.kind} onChange={(e) => onChange({ frequency: { kind: e.target.value as FrequencyKind, ...(e.target.value === 'event' ? { hoursAfterEvent: 24 } : {}) } })}>
            {KINDS.map((k) => <option key={k} value={k}>{FREQUENCY_LABEL[k]}</option>)}
          </select></div>
        <div className="field"><label htmlFor={`r-${o.id}`}>Se entrega a</label>
          <select id={`r-${o.id}`} className="input" value={o.recipient} onChange={(e) => onChange({ recipient: e.target.value as Recipient })}>
            {RECIPIENTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></div>
      </div>
      {o.quote && <p className="faint" style={{ fontSize: 'var(--t-meta)' }}>«{o.quote}»</p>}
    </div>
  );
}

function AddForm({ projectId, onAdd, onCancel }: { projectId: string; onAdd: (o: Obligation) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<FrequencyKind>('monthly');
  const [recipient, setRecipient] = useState<Recipient>('SMA');
  const [section, setSection] = useState('');
  const [quote, setQuote] = useState('');
  const [err, setErr] = useState<string>();
  const add = () => {
    if (!title.trim()) { setErr('Ponle un nombre al compromiso.'); return; }
    onAdd({
      id: `${projectId}-a${Math.random().toString(36).slice(2, 7)}`, projectId, title: title.trim(), plain: quote.trim() || title.trim(),
      component: 'Administrativo', recipient, frequency: { kind, ...(kind === 'event' ? { hoursAfterEvent: 24 } : {}) },
      quote: quote.trim() || undefined, section: section.trim() || undefined,
      evidence: recipient === 'Interno' ? 'Registro fechado con fotos' : 'Informe y comprobante de envío', confirmed: false, source: 'rca',
    });
  };
  return (
    <div className="group" style={{ display: 'grid', gap: 10, padding: 16 }}>
      <div className="field"><label htmlFor="add-t">Compromiso</label>
        <input id="add-t" className="input" value={title} maxLength={80} placeholder="Ej. Declaración anual en SINADER" onChange={(e) => { setTitle(e.target.value); setErr(undefined); }} aria-invalid={!!err || undefined} />
        {err && <p className="field-error" role="alert">{err}</p>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field"><label htmlFor="add-f">Frecuencia</label>
          <select id="add-f" className="input" value={kind} onChange={(e) => setKind(e.target.value as FrequencyKind)}>{KINDS.map((k) => <option key={k} value={k}>{FREQUENCY_LABEL[k]}</option>)}</select></div>
        <div className="field"><label htmlFor="add-r">Se entrega a</label>
          <select id="add-r" className="input" value={recipient} onChange={(e) => setRecipient(e.target.value as Recipient)}>{RECIPIENTS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="add-s">Numeral de la RCA (opcional)</label>
        <input id="add-s" className="input" value={section} placeholder="Ej. 9.4" onChange={(e) => setSection(e.target.value)} /></div>
      <div className="field"><label htmlFor="add-q">Cita textual (recomendado)</label>
        <textarea id="add-q" className="input" rows={3} value={quote} placeholder="Copia el párrafo de la RCA que lo exige" onChange={(e) => setQuote(e.target.value)} /></div>
      <div className="actions two">
        <button className="btn plain" type="button" onClick={onCancel}>Cancelar</button>
        <button className="btn" type="button" onClick={add}>Agregar</button>
      </div>
    </div>
  );
}
