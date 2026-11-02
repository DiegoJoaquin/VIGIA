import { useEffect, useState } from 'react';
import { frequencyLabel } from '../../../shared/recurrence';
import type { ImportDraft } from '../data/source';
import { IconBack, IconCheck, IconDoc, IconLink } from '../icons';
import { useStore } from '../store';

const STEPS = ['Descargando la RCA desde el SEA', 'Leyendo considerandos y plan de seguimiento', 'Detectando compromisos y frecuencias', 'Calculando fechas de vencimiento'];

export function Import() {
  const s = useStore();
  const [url, setUrl] = useState('https://firma.sea.gob.cl/publicaciones/df/66/2143896734.pdf');
  const [step, setStep] = useState(-1);
  const [draft, setDraft] = useState<ImportDraft>();
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const t = setTimeout(() => setStep((n) => n + 1), 700);
    return () => clearTimeout(t);
  }, [step]);

  const run = async (source: string | File) => {
    setError(undefined); setDraft(undefined); setStep(0);
    try {
      const d = typeof source === 'string' ? await s.extract(source) : await s.extractFile(source);
      setDraft(d); setKeep(new Set(d.obligations.map((o) => o.id)));
    } catch (e) { setError((e as Error).message); setStep(-1); }
  };

  const ready = draft && step >= STEPS.length;
  const already = draft && s.snap!.projects.some((p) => p.id === draft.project.id);

  return (
    <div className="page">
      <div><button className="link-btn" onClick={() => history.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: -6 }}><IconBack size={20} />Volver</button></div>
      <header>
        <h1 className="large-title">Importar RCA</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: '58ch' }}>Pega el enlace de la resolución en el SEIA o sube el PDF. Vigía lee el documento, encuentra cada compromiso con su frecuencia y te lo muestra para revisar antes de activar las alertas.</p>
      </header>

      <form className="section" onSubmit={(e) => { e.preventDefault(); if (url.trim()) run(url.trim()); }}>
        <div className="field">
          <label htmlFor="rca-url">Enlace de la RCA</label>
          <input id="rca-url" className="input" type="url" inputMode="url" placeholder="https://firma.sea.gob.cl/publicaciones/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="actions two">
          <button className="btn" type="submit" disabled={step >= 0 && !ready}><IconLink size={18} />Leer la RCA</button>
          <label className="btn plain" htmlFor="rca-file" style={{ cursor: 'pointer' }}><IconDoc size={18} />Subir PDF
            <input id="rca-file" type="file" accept="application/pdf" className="sr" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
          </label>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </form>

      {step >= 0 && (
        <div className="steps" aria-live="polite">
          {STEPS.map((t, i) => (
            <div key={t} className={`step ${i < step ? 'is-done' : i === step ? 'is-on' : ''}`}>
              <span className="step-mark">{i < step && <IconCheck size={13} />}</span><span>{t}</span>
            </div>
          ))}
        </div>
      )}

      {ready && draft && (
        <>
          <section className="section">
            <div className="section-head"><h2>{draft.project.shortName}</h2><span className="count">{draft.project.comuna}, {draft.project.region}</span></div>
            <p className="muted" style={{ paddingInline: 4 }}>{draft.project.name} · {draft.project.titular}</p>
            <div className="group">
              {draft.obligations.map((o) => {
                const on = keep.has(o.id);
                return (
                  <label className="row" key={o.id} style={{ cursor: 'pointer' }}>
                    <input type="checkbox" className="sr" checked={on} onChange={() => { const n = new Set(keep); on ? n.delete(o.id) : n.add(o.id); setKeep(n); }} />
                    <span className={`check ${on ? 'is-done' : ''}`} style={{ pointerEvents: 'none' }}><IconCheck size={15} /></span>
                    <span className="row-main">
                      <span className="row-title">{o.title}</span>
                      <span className="row-meta"><span>{frequencyLabel(o.frequency)}</span><span>{o.section}</span>{!o.quote && <span style={{ color: 'var(--warn)' }}>Sin cita textual</span>}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>Quita los que no correspondan. Podrás editar fechas y responsables después.</p>
          </section>
          <button className="btn block" disabled={!keep.size || already} onClick={async () => { await s.saveImport(draft, [...keep]); s.go({ name: 'proyecto', id: draft.project.id }); }}>
            {already ? 'Este proyecto ya está agregado' : `Agregar ${keep.size} compromisos`}
          </button>
        </>
      )}

      {s.demo && step < 0 && (
        <p className="faint" style={{ fontSize: 'var(--t-meta)' }}>En esta demo, cualquier enlace muestra el resultado de leer la RCA de RR Wine (Sagrada Familia, Maule). En la versión instalada, la lectura corre en tu servidor con un modelo de IA local.</p>
      )}
    </div>
  );
}
