import { useState } from 'react';
import { frequencyLabel } from '../../../shared/recurrence';
import type { ImportDraft } from '../data/source';
import { IconCheck } from '../icons';

/** Lista de compromisos propuestos por la lectura automática, para revisar antes de guardarlos. */
export function ReviewDraft({ draft, heading, sub, disabledText, onSave }: {
  draft: ImportDraft;
  heading: string;
  sub?: string;
  disabledText?: string;
  onSave: (keep: string[]) => Promise<void>;
}) {
  const [keep, setKeep] = useState<Set<string>>(() => new Set(draft.obligations.map((o) => o.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!draft.obligations.length) {
    return <div className="group empty"><p>No encontramos compromisos con fecha en este documento. Si crees que sí los tiene, revisa que el PDF tenga texto seleccionable.</p></div>;
  }

  const save = async () => {
    setSaving(true); setError(undefined);
    try { await onSave([...keep]); } catch (e) { setError((e as Error).message); setSaving(false); }
  };

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>{heading}</h2>{sub && <span className="count">{sub}</span>}</div>
        <div className="group">
          {draft.obligations.map((o) => {
            const on = keep.has(o.id);
            return (
              <label className="row" key={o.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" className="sr" checked={on} onChange={() => { const n = new Set(keep); on ? n.delete(o.id) : n.add(o.id); setKeep(n); }} />
                <span className={`check ${on ? 'is-done' : ''}`} style={{ pointerEvents: 'none' }}><IconCheck size={15} /></span>
                <span className="row-main">
                  <span className="row-title">{o.title}</span>
                  <span className="row-meta"><span>{frequencyLabel(o.frequency)}</span>{o.section && <span>{o.section}</span>}{!o.quote && <span style={{ color: 'var(--warn)' }}>Sin cita textual</span>}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>Quita los que no correspondan. Podrás editar fechas y responsables después.</p>
      </section>
      <button className="btn block" disabled={!keep.size || saving || !!disabledText} onClick={save}>
        {disabledText ?? (saving ? 'Guardando…' : `Agregar ${keep.size} compromisos`)}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}
