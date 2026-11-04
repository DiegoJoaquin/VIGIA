import { useEffect, useRef, useState } from 'react';
import type { ImportDraft } from '../data/source';
import { IconBack, IconCheck, IconDoc, IconLink } from '../icons';
import { useStore } from '../store';
import { ReviewDraft } from './Review';

const STEPS = ['Descargando la RCA desde el SEA', 'Leyendo considerandos y plan de seguimiento', 'Detectando compromisos y frecuencias', 'Calculando fechas de vencimiento'];

/** Animación de pasos mientras se lee un documento. */
export function useReadingSteps() {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const t = setTimeout(() => setStep((n) => n + 1), 700);
    return () => clearTimeout(t);
  }, [step]);
  return { step, setStep, done: step >= STEPS.length };
}

export function ReadingSteps({ step, steps = STEPS }: { step: number; steps?: string[] }) {
  return (
    <div className="steps" aria-live="polite">
      {steps.map((t, i) => (
        <div key={t} className={`step ${i < step ? 'is-done' : i === step ? 'is-on' : ''}`}>
          <span className="step-mark">{i < step && <IconCheck size={13} />}</span><span>{t}</span>
        </div>
      ))}
    </div>
  );
}

const SEA_URL = /^https:\/\/(firma|infofirma|seia)\.sea\.gob\.cl\//i;

export function Import() {
  const s = useStore();
  const [url, setUrl] = useState('https://firma.sea.gob.cl/publicaciones/df/66/2143896734.pdf');
  const { step, setStep, done } = useReadingSteps();
  const [draft, setDraft] = useState<ImportDraft>();
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<{ field?: 'url' | 'file'; text: string }>();
  const urlRef = useRef<HTMLInputElement>(null);

  const run = async (source: string | File) => {
    setError(undefined); setDraft(undefined); setStep(0);
    setFile(typeof source === 'string' ? undefined : source);
    try {
      const d = typeof source === 'string' ? await s.extract(source) : await s.extractFile(source);
      setDraft(d);
    } catch (e) {
      setError({ field: typeof source === 'string' ? 'url' : 'file', text: (e as Error).message });
      setStep(-1);
    }
  };

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim();
    if (!v) { setError({ field: 'url', text: 'Pega el enlace de la RCA.' }); urlRef.current?.focus(); return; }
    if (!s.demo && !SEA_URL.test(v)) { setError({ field: 'url', text: 'El enlace debe ser un documento del SEA (empieza con https://firma.sea.gob.cl/).' }); urlRef.current?.focus(); return; }
    run(v);
  };

  const pickFile = (f?: File) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { setError({ field: 'file', text: 'El archivo debe ser un PDF.' }); return; }
    if (f.size > 25_000_000) { setError({ field: 'file', text: 'El PDF pesa más de 25 MB. Comprímelo antes de subirlo.' }); return; }
    run(f);
  };

  const ready = draft && done;
  const already = draft && s.snap!.projects.some((p) => p.id === draft.project.id);

  return (
    <div className="page">
      <div><button className="link-btn" onClick={() => history.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: -6 }}><IconBack size={20} />Volver</button></div>
      <header>
        <h1 className="large-title">Importar RCA</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: '58ch' }}>Pega el enlace de la resolución en el SEIA o sube el PDF. Vigía lee el documento, encuentra cada compromiso con su frecuencia y te lo muestra para revisar antes de activar las alertas.</p>
      </header>

      <form className="section" onSubmit={submitUrl} noValidate>
        <div className="field">
          <label htmlFor="rca-url">Enlace de la RCA</label>
          <input id="rca-url" ref={urlRef} className="input" type="url" inputMode="url" placeholder="https://firma.sea.gob.cl/publicaciones/…" value={url}
            aria-invalid={error?.field === 'url' || undefined} aria-describedby={error?.field === 'url' ? 'rca-url-error' : undefined}
            onChange={(e) => { setUrl(e.target.value); if (error?.field === 'url') setError(undefined); }} />
          {error?.field === 'url' && <p id="rca-url-error" className="field-error" role="alert">{error.text}</p>}
        </div>
        <div className="actions two">
          <button className="btn" type="submit" disabled={step >= 0 && !ready}><IconLink size={18} />Leer la RCA</button>
          <label className="btn plain" htmlFor="rca-file" style={{ cursor: 'pointer' }}><IconDoc size={18} />Subir PDF
            <input id="rca-file" type="file" accept="application/pdf" className="sr" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        </div>
        {error?.field === 'file' && <p className="form-error" role="alert">{error.text}</p>}
      </form>

      {step >= 0 && <ReadingSteps step={step} />}

      {ready && draft && (
        <>
          <p className="muted" style={{ paddingInline: 4 }}><strong>{draft.project.shortName}</strong> · {draft.project.name} · {draft.project.titular}, {draft.project.comuna}</p>
          <ReviewDraft draft={draft} heading="Compromisos encontrados" sub={`${draft.obligations.length}`}
            disabledText={already ? 'Este proyecto ya está agregado' : undefined}
            onSave={async (keep) => {
              const projectId = await s.saveImport(draft, keep);
              // El PDF subido queda guardado en los documentos del proyecto.
              if (file) await s.uploadDocument(projectId, 'rca', file).catch(() => undefined);
              s.go({ name: 'proyecto', id: projectId });
            }} />
        </>
      )}

      {s.demo && step < 0 && (
        <p className="faint" style={{ fontSize: 'var(--t-meta)' }}>En esta demo, cualquier enlace muestra el resultado de leer la RCA de RR Wine (Sagrada Familia, Maule). En la versión instalada, la lectura corre en tu servidor con un modelo de IA.</p>
      )}
    </div>
  );
}
