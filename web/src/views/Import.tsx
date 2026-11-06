import { useEffect, useRef, useState } from 'react';
import type { ImportDraft } from '../data/source';
import { IconBack, IconCheck, IconDoc, IconLink } from '../icons';
import { useStore } from '../store';
import { ReviewDraft } from './Review';
import { fromSheet, type SheetIssue } from '../../../shared/standard';
import type { Project } from '../../../shared/types';
import { readSheetFile } from '../data/sheet';

const STEPS = ['Descargando la RCA desde el SEA', 'Leyendo considerandos y plan de seguimiento', 'Detectando compromisos y frecuencias', 'Calculando fechas de vencimiento'];

/**
 * Pasos mientras se lee un documento. Avanzan solos hasta el último y ahí esperan la respuesta real
 * del servidor: nunca se marca como listo algo que todavía no termina.
 */
export function useReadingSteps(count = STEPS.length) {
  const [step, setStep] = useState(-1);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (step < 0 || step >= count - 1 || finished) return;
    const t = setTimeout(() => setStep((n) => n + 1), 1100);
    return () => clearTimeout(t);
  }, [step, finished, count]);
  const running = step >= 0 && !finished;
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [running]);
  return {
    step, elapsed, done: finished,
    start: () => { setFinished(false); setElapsed(0); setStep(0); },
    finish: () => { setFinished(true); setStep(count); },
    stop: () => { setFinished(false); setStep(-1); },
  };
}

export function ReadingSteps({ step, steps = STEPS, elapsed = 0 }: { step: number; steps?: string[]; elapsed?: number }) {
  return (
    <div className="steps" aria-live="polite">
      {steps.map((t, i) => (
        <div key={t} className={`step ${i < step ? 'is-done' : i === step ? 'is-on' : ''}`}>
          <span className="step-mark">{i < step && <IconCheck size={13} />}</span><span>{t}</span>
        </div>
      ))}
      {step < steps.length && elapsed >= 6 && (
        <p className="faint num" style={{ fontSize: 'var(--t-meta)' }}>
          Llevamos {elapsed} s. Una RCA larga puede tardar hasta un par de minutos: no cierres esta página.
        </p>
      )}
    </div>
  );
}

const SEA_URL = /^https:\/\/(firma|infofirma|seia)\.sea\.gob\.cl\//i;

export function Import() {
  const s = useStore();
  const [url, setUrl] = useState('https://firma.sea.gob.cl/publicaciones/df/66/2143896734.pdf');
  const { step, elapsed, done, start, finish, stop } = useReadingSteps();
  const [draft, setDraft] = useState<ImportDraft>();
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<{ field?: 'url' | 'file'; text: string }>();
  const [issues, setIssues] = useState<SheetIssue[]>([]);
  const urlRef = useRef<HTMLInputElement>(null);

  const run = async (source: string | File) => {
    setError(undefined); setDraft(undefined); start();
    setFile(typeof source === 'string' ? undefined : source);
    try {
      const d = typeof source === 'string' ? await s.extract(source) : await s.extractFile(source);
      setDraft(d);
      finish();
    } catch (e) {
      setError({ field: typeof source === 'string' ? 'url' : 'file', text: (e as Error).message });
      stop();
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

  // Vía manual: una planilla con la ficha estándar (levantada a mano o por la consultora).
  const pickSheet = async (f?: File) => {
    if (!f) return;
    setError(undefined); setDraft(undefined); setIssues([]); setFile(undefined);
    try {
      const id = `plan-${Math.random().toString(36).slice(2, 8)}`;
      const r = fromSheet(await readSheetFile(f), id);
      setIssues(r.issues);
      if (!r.obligations.length) { setError({ field: 'file', text: r.issues[0]?.message ?? 'La planilla no tiene obligaciones.' }); return; }
      const name = r.project.name || f.name.replace(/\.(xlsx|csv)$/i, '');
      const project: Project = {
        id, name, shortName: name.length > 34 ? `${name.slice(0, 32)}…` : name, titular: r.project.titular || 'Titular por confirmar',
        rubro: 'Otro', comuna: r.project.comuna || 'Por confirmar', region: '', instrument: 'DIA', rcaLabel: r.project.rcaLabel || 'RCA cargada desde planilla',
        sourceUrl: '', phase: 'Operación', trackingStart: new Date().toISOString().slice(0, 8) + '01',
      };
      setDraft({ project, obligations: r.obligations });
      start(); finish();
    } catch (e) { setError({ field: 'file', text: (e as Error).message }); }
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
        <p className="faint" style={{ fontSize: 'var(--t-meta)', marginTop: 4 }}>
          ¿Ya tienes la matriz de compromisos en Excel?{' '}
          <label htmlFor="rca-sheet" className="link-btn" style={{ cursor: 'pointer', display: 'inline' }}>Cárgala aquí</label>
          <input id="rca-sheet" type="file" accept=".xlsx,.csv,text/csv" className="sr" onChange={(e) => { pickSheet(e.target.files?.[0]); e.target.value = ''; }} />
          {' '}· <a href="/plantilla-compromisos-vigia.xlsx" download>Descargar planilla modelo</a>
          {' '}· <a href="/guia-lectura-rca" target="_blank" rel="noopener">Cómo leer una RCA</a>
        </p>
      </form>

      {issues.length > 0 && (
        <div className="group" role="status" style={{ padding: '12px 16px' }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Revisa la planilla ({issues.length} {issues.length === 1 ? 'aviso' : 'avisos'})</p>
          <ul className="muted" style={{ fontSize: 'var(--t-meta)', paddingLeft: 18, display: 'grid', gap: 4 }}>
            {issues.slice(0, 12).map((i, k) => <li key={k}>Fila {i.row}{i.column ? `, ${i.column}` : ''}: {i.message}</li>)}
          </ul>
        </div>
      )}

      {step >= 0 && !(ready && draft?.project.id.startsWith('plan-')) && <ReadingSteps step={step} elapsed={elapsed} />}

      {ready && draft && (
        <>
          <p className="muted" style={{ paddingInline: 4 }}><strong>{draft.project.shortName}</strong> · {draft.project.name} · {draft.project.titular}, {draft.project.comuna}</p>
          <ReviewDraft draft={draft} heading="Compromisos encontrados" sub={`${draft.obligations.length}`}
            disabledText={already ? 'Este proyecto ya está agregado' : undefined}
            onSave={async (keep, final, feedback) => {
              // Una planilla ya es una revisión humana: no se usa como corrección de la lectura automática.
              const fromPlan = draft.project.id.startsWith('plan-');
              const projectId = await s.saveImport({ ...draft, obligations: final }, keep, undefined, fromPlan ? undefined : feedback);
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
