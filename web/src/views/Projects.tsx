import { useMemo, useState } from 'react';
import { DOCUMENT_KINDS, type Component, type DocumentKind, type DocumentRef, type Obligation, type Project } from '../../../shared/types';
import type { ImportDraft } from '../data/source';
import { ReadingSteps, useReadingSteps } from './Import';
import { ReviewDraft } from './Review';
import { NotFound } from './NotFound';
import { onTimeRate } from '../../../shared/recurrence';
import { VENTANILLA_QUESTIONS, type VentanillaAnswers } from '../../../shared/ventanilla';
import { MiniRing, ObligationRow, OccurrenceRow, Ring } from '../components';
import { fileSize, longDate, relative, shortDate } from '../format';
import { IconAlert, IconBack, IconBolt, IconChevron, IconClose, IconDoc, IconLink, IconPin, IconPlus, IconSpark, IconUpload } from '../icons';
import { useStore } from '../store';

export function Projects() {
  const { snap, occurrences, today, go } = useStore();
  return (
    <div className="page">
      <header className="page-head">
        <div><h1 className="large-title">Proyectos</h1></div>
        <button className="btn small" onClick={() => go({ name: 'importar' })}><IconPlus size={16} />Importar RCA</button>
      </header>
      <div className="group">
        {snap!.projects.map((p) => {
          const occ = occurrences.filter((o) => o.project.id === p.id);
          const rate = onTimeRate(occ, today).rate;
          const next = occ.find((o) => o.status !== 'done' && o.due >= today);
          const overdue = occ.filter((o) => o.status === 'overdue').length;
          const review = snap!.obligations.filter((o) => o.projectId === p.id && !o.confirmed).length;
          return (
            <button className="proj" key={p.id} onClick={() => go({ name: 'proyecto', id: p.id })}>
              <MiniRing value={rate} />
              <div className="row-main">
                <span className="proj-name">{p.shortName}</span>
                <span className="row-meta"><span>{p.rubro}</span><span>{p.comuna}</span></span>
                <span className="row-meta">
                  {overdue > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{overdue} vencido{overdue > 1 ? 's' : ''}</span>}
                  {review > 0 && <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{review} por revisar</span>}
                  {next && <span>Próximo: {next.obligation.title.toLowerCase()} · {shortDate(next.due, today)}</span>}
                </span>
              </div>
              <IconChevron size={18} className="chev" />
            </button>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>
        El anillo muestra el porcentaje de entregas hechas a tiempo en los últimos 12 meses.
      </p>
    </div>
  );
}

const ORDER: Component[] = ['Agua', 'Aire', 'Suelo y cauce', 'Residuos', 'Olores', 'Ruido', 'Biodiversidad', 'Patrimonio', 'Administrativo', 'Ventanilla Única'];

export function ProjectDetail({ id }: { id: string }) {
  const s = useStore();
  const [tab, setTab] = useState<'proximo' | 'compromisos' | 'documentos' | 'carpeta'>('proximo');
  const p = s.snap!.projects.find((x) => x.id === id);
  if (!p) return <NotFound what="proyecto" />;
  const obs = s.snap!.obligations.filter((o) => o.projectId === id);
  const occ = s.occurrences.filter((o) => o.project.id === id);
  const review = obs.filter((o) => !o.confirmed);
  const rate = onTimeRate(occ, s.today);

  return (
    <div className="page">
      <div><button className="link-btn" onClick={() => s.go({ name: 'proyectos' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: -6 }}><IconBack size={20} />Proyectos</button></div>
      <header className="proj-hero">
        <p className="kicker">{p.rubro} · {p.instrument} aprobada</p>
        <h1 className="large-title">{p.shortName}</h1>
        <p className="muted">{p.name}</p>
        <div className="meta-line">
          <span>{p.titular}</span>
          <span><IconPin size={14} />{p.comuna}, {p.region}</span>
          <span>Fase de {p.phase.toLowerCase()}{p.operationEnd ? ` hasta ${shortDate(p.operationEnd, s.today)}` : ''}</span>
          <a href={p.sourceUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconLink size={14} />{p.rcaLabel}</a>
        </div>
      </header>

      {review.length > 0 && (
        <div className="banner">
          <IconAlert />
          <div>
            <p>{review.length} compromisos se extrajeron automáticamente de la RCA y esperan tu revisión. Ábrelos para comparar con el documento, o confírmalos todos si ya los revisaste.</p>
            <button className="btn small" onClick={() => s.confirm(review.map((o) => o.id))}>Confirmar los {review.length}</button>
          </div>
        </div>
      )}

      <div className="seg" role="group" aria-label="Vista del proyecto">
        <button aria-pressed={tab === 'proximo'} onClick={() => setTab('proximo')}>Próximo</button>
        <button aria-pressed={tab === 'compromisos'} onClick={() => setTab('compromisos')}>Compromisos</button>
        <button aria-pressed={tab === 'documentos'} onClick={() => setTab('documentos')}>Documentos</button>
        <button aria-pressed={tab === 'carpeta'} onClick={() => setTab('carpeta')}>Carpeta</button>
      </div>

      {tab === 'proximo' && <Upcoming id={id} />}
      {tab === 'compromisos' && <Commitments project={p} obs={obs} />}
      {tab === 'documentos' && <Documents project={p} onAdded={() => setTab('compromisos')} />}
      {tab === 'carpeta' && <Dossier project={p} rate={rate} />}
    </div>
  );
}

function Upcoming({ id }: { id: string }) {
  const { occurrences, today } = useStore();
  const occ = occurrences.filter((o) => o.project.id === id);
  const firstOnly = <T extends { obligation: { id: string } }>(list: T[]) => {
    const seen = new Set<string>();
    return list.filter((o) => (seen.has(o.obligation.id) ? false : (seen.add(o.obligation.id), true)));
  };
  const open = firstOnly(occ.filter((o) => o.status !== 'done' && o.daysLeft <= 90));
  const recent = firstOnly(occ.filter((o) => o.status === 'done' && o.due <= today).reverse()).slice(0, 6);
  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Lo que viene</h2><span className="count">Próxima fecha de cada compromiso</span></div>
        {open.length ? <div className="group">{open.map((o) => <OccurrenceRow key={o.key} o={o} showProject={false} />)}</div>
          : <div className="group empty"><p>Nada pendiente en los próximos 90 días.</p></div>}
      </section>
      {recent.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Cumplido recientemente</h2></div>
          <div className="group">{recent.map((o) => <OccurrenceRow key={o.key} o={o} showProject={false} />)}</div>
        </section>
      )}
    </>
  );
}

function Commitments({ project, obs }: { project: Project; obs: Obligation[] }) {
  const s = useStore();
  const dated = obs.filter((o) => !['continuous', 'event'].includes(o.frequency.kind) && o.source === 'rca');
  const permanent = obs.filter((o) => o.frequency.kind === 'continuous');
  const events = obs.filter((o) => o.frequency.kind === 'event');
  const vu = obs.filter((o) => o.source === 'ventanilla' && o.frequency.kind !== 'event');
  const groups = ORDER.map((c) => ({ c, list: dated.filter((o) => o.component === c) })).filter((g) => g.list.length);

  return (
    <>
      {groups.map(({ c, list }) => (
        <section className="section" key={c}>
          <div className="section-head"><h2>{c}</h2><span className="count">{list.length}</span></div>
          <div className="group">{list.map((o) => <ObligationRow key={o.id} ob={o} />)}</div>
        </section>
      ))}

      {events.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Si ocurre</h2><span className="count">{events.length}</span></div>
          <div className="group">
            {events.map((o) => (
              <ObligationRow key={o.id} ob={o} right={o.confirmed
                ? <button className="btn small secondary" style={{ pointerEvents: 'auto' }} onClick={() => s.logEvent(o)}><IconBolt size={15} />Ocurrió</button>
                : undefined} />
            ))}
          </div>
          <p className="faint" style={{ fontSize: 'var(--t-meta)', paddingInline: 4 }}>Al registrar un evento, Vigía calcula el plazo legal y avisa al equipo.</p>
        </section>
      )}

      {permanent.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Condiciones permanentes</h2><span className="count">{permanent.length}</span></div>
          <div className="group">{permanent.map((o) => <ObligationRow key={o.id} ob={o} />)}</div>
        </section>
      )}

      <Ventanilla project={project} active={vu} />
    </>
  );
}

function Ventanilla({ project, active }: { project: Project; active: Obligation[] }) {
  const s = useStore();
  const ids = new Set(s.snap!.obligations.filter((o) => o.projectId === project.id && o.source === 'ventanilla').map((o) => o.id.split('-vu-')[1]));
  const [a, setA] = useState<VentanillaAnswers>({
    residuos12t: ids.has('sinaderMensual'), fuentesFijas: ids.has('f138'), respel: ids.has('sidrep'),
    sustPeligrosas: ids.has('dasuspel'), envases300kg: ids.has('rep'),
  });
  const toggle = (k: keyof VentanillaAnswers) => { const next = { ...a, [k]: !a[k] }; setA(next); s.setVentanilla(project.id, next); };
  return (
    <section className="section">
      <div className="section-head"><h2>Ventanilla Única</h2><span className="count">{active.length} activas</span></div>
      <p className="muted" style={{ paddingInline: 4, fontSize: 'var(--t-meta)' }}>Obligaciones que no están en la RCA pero aplican al establecimiento. Marca lo que corresponda y Vigía agrega las fechas.</p>
      <div className="group">
        {VENTANILLA_QUESTIONS.map((q) => (
          <div className="setting" key={q.key}>
            <div className="setting-main"><span style={{ fontWeight: 550 }}>{q.label}</span><small>{q.help}</small></div>
            <span className="switch"><input id={`vu-${project.id}-${q.key}`} type="checkbox" checked={a[q.key]} onChange={() => toggle(q.key)} aria-label={q.label} /><span /></span>
          </div>
        ))}
      </div>
      {active.length > 0 && <div className="group">{active.map((o) => <ObligationRow key={o.id} ob={o} />)}</div>}
    </section>
  );
}

function Dossier({ project, rate }: { project: Project; rate: { rate: number; due: number; onTime: number } }) {
  const { occurrences, today, demo } = useStore();
  const rows = occurrences.filter((o) => o.project.id === project.id && o.due <= today).reverse();
  const files = rows.reduce((n, o) => n + (o.completion?.evidence.length ?? 0), 0);
  return (
    <section className="dossier" aria-label="Carpeta de fiscalización">
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <Ring value={rate.rate} size={92} stroke={9} label="a tiempo" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <h2 className="title">Carpeta de fiscalización</h2>
          <p className="muted">Todo lo que la SMA pediría en una visita: cada compromiso, cuándo se cumplió y con qué prueba. Al {longDate(today).toLowerCase()}.</p>
          <p className="faint num" style={{ fontSize: 'var(--t-meta)' }}>{rate.onTime} de {rate.due} entregas a tiempo · {files} archivos de evidencia</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Compromiso</th><th>Vencía</th><th>Estado</th><th>Evidencia</th></tr></thead>
          <tbody>
            {rows.slice(0, 40).map((o) => (
              <tr key={o.key}>
                <td>{o.obligation.title}<div className="faint">{o.obligation.section}</div></td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{shortDate(o.due, today)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {o.completion ? <span className={`tag ${o.completion.completedAt.slice(0, 10) <= o.due ? 'is-ok' : 'is-warn'}`}>{o.completion.completedAt.slice(0, 10) <= o.due ? 'A tiempo' : 'Con atraso'}</span>
                    : <span className="tag is-danger">{relative(o)}</span>}
                </td>
                <td>{o.completion?.evidence.map((e) => <div key={e.id} className="file" style={{ marginBottom: 4 }}><IconDoc size={13} /><span>{e.name}</span></div>) ?? <span className="faint">Sin archivo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {demo
        ? <p className="faint" style={{ fontSize: 'var(--t-meta)' }}>En la versión instalada, el botón "Guardar como PDF" genera este informe para entregarlo en una fiscalización.</p>
        : <button className="btn plain no-print" style={{ alignSelf: 'flex-start' }} onClick={() => window.print()}>Guardar como PDF</button>}
    </section>
  );
}

const KIND_LABEL = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k.kind, k.label])) as Record<DocumentKind, string>;
const READ_STEPS = ['Abriendo el documento', 'Buscando obligaciones, plazos y frecuencias', 'Comparando con lo que ya tiene el proyecto', 'Preparando la lista para revisar'];

function Documents({ project, onAdded }: { project: Project; onAdded: () => void }) {
  const s = useStore();
  const docs = s.snap!.documents.filter((d) => d.projectId === project.id);
  const [kind, setKind] = useState<DocumentKind | ''>('');
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string }>();
  const [reading, setReading] = useState<{ doc: DocumentRef; draft?: ImportDraft; error?: string }>();
  const [confirmDel, setConfirmDel] = useState<string>();
  const { step, setStep, done } = useReadingSteps();

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return setError({ field: 'kind', text: 'Elige qué tipo de documento es.' });
    if (!file) return setError({ field: 'file', text: 'Elige un archivo.' });
    if (file.size > 25_000_000) return setError({ field: 'file', text: 'El archivo pesa más de 25 MB. Comprímelo o divídelo en partes.' });
    setBusy(true); setError(undefined);
    try {
      const doc = await s.uploadDocument(project.id, kind, file);
      setFile(undefined); setKind('');
      (document.getElementById('doc-file') as HTMLInputElement | null)?.form?.reset();
      if (DOCUMENT_KINDS.find((k) => k.kind === doc.kind)?.readable && /\.pdf$/i.test(doc.name)) read(doc);
    } catch (err) {
      setError({ field: (err as { field?: string }).field ?? 'file', text: (err as Error).message });
    } finally { setBusy(false); }
  };

  const read = async (doc: DocumentRef) => {
    setReading({ doc }); setStep(0);
    try { setReading({ doc, draft: await s.extractDocument(doc.id) }); }
    catch (err) { setReading({ doc, error: (err as Error).message }); setStep(-1); }
  };

  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Subir un documento</h2></div>
        <p className="muted" style={{ paddingInline: 4, fontSize: 'var(--t-meta)' }}>Guarda aquí la RCA, las resoluciones que la modifican, el programa de cumplimiento o los informes. Si es una resolución o un programa, Vigía lo lee y te propone los compromisos nuevos.</p>
        <form className="group form-card" onSubmit={upload} noValidate>
          <div className="field">
            <label htmlFor="doc-kind">Tipo de documento</label>
            <select id="doc-kind" className="input" value={kind} aria-invalid={error?.field === 'kind' || undefined} aria-describedby={error?.field === 'kind' ? 'doc-kind-error' : undefined}
              onChange={(e) => { setKind(e.target.value as DocumentKind); if (error?.field === 'kind') setError(undefined); }}>
              <option value="" disabled>Elige una opción</option>
              {DOCUMENT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            {error?.field === 'kind' && <p id="doc-kind-error" className="field-error" role="alert">{error.text}</p>}
          </div>
          <div className="field">
            <label htmlFor="doc-file">Archivo (PDF, Word, Excel o foto, hasta 25 MB)</label>
            <input id="doc-file" className="input file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
              aria-invalid={error?.field === 'file' || undefined} aria-describedby={error?.field === 'file' ? 'doc-file-error' : undefined}
              onChange={(e) => { setFile(e.target.files?.[0]); if (error?.field === 'file') setError(undefined); }} />
            {error?.field === 'file' && <p id="doc-file-error" className="field-error" role="alert">{error.text}</p>}
            {error && !error.field && <p className="field-error" role="alert">{error.text}</p>}
          </div>
          <button className="btn" type="submit" disabled={busy}><IconUpload size={18} />{busy ? 'Subiendo…' : 'Guardar documento'}</button>
        </form>
      </section>

      {reading && (
        <section className="section" aria-live="polite">
          <div className="section-head"><h2>Leyendo {reading.doc.name}</h2>
            <button className="icon-btn" aria-label="Cerrar lectura" onClick={() => { setReading(undefined); setStep(-1); }}><IconClose size={16} /></button></div>
          {reading.error ? <p className="form-error" role="alert">{reading.error}</p> : <ReadingSteps step={step} steps={READ_STEPS} />}
          {reading.draft && done && (
            <ReviewDraft draft={reading.draft} heading="Compromisos propuestos" sub={`${reading.draft.obligations.length}`}
              onSave={async (keep) => { await s.saveImport(reading.draft!, keep, reading.doc.id); setReading(undefined); setStep(-1); onAdded(); }} />
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Documentos del proyecto</h2><span className="count">{docs.length}</span></div>
        {docs.length === 0 ? <div className="group empty"><p>Aún no hay documentos. Sube la RCA para tenerla siempre a mano.</p></div> : (
          <div className="group">
            {docs.map((d) => {
              const readable = DOCUMENT_KINDS.find((k) => k.kind === d.kind)?.readable && /\.pdf$/i.test(d.name);
              return (
                <div className="row doc-row" key={d.id}>
                  <span className="icon-btn" aria-hidden="true"><IconDoc size={18} /></span>
                  <span className="row-main">
                    {d.url ? <a className="row-title" href={d.url} target="_blank" rel="noreferrer">{d.name}</a> : <span className="row-title">{d.name}</span>}
                    <span className="row-meta"><span>{KIND_LABEL[d.kind]}</span><span>{fileSize(d.size)}</span><span>{d.uploadedBy} · {shortDate(d.createdAt.slice(0, 10), s.today)}</span>
                      {d.readAt && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Compromisos leídos</span>}</span>
                  </span>
                  <span className="doc-actions">
                    {readable && !reading && <button className="btn small secondary" onClick={() => read(d)}><IconSpark size={15} />{d.readAt ? 'Leer de nuevo' : 'Leer compromisos'}</button>}
                    {confirmDel === d.id
                      ? <><button className="btn small danger" onClick={() => { setConfirmDel(undefined); s.deleteDocument(d); }}>Eliminar</button><button className="btn small plain" onClick={() => setConfirmDel(undefined)}>No</button></>
                      : <button className="icon-btn" aria-label={`Eliminar ${d.name}`} onClick={() => setConfirmDel(d.id)}><IconClose size={16} /></button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
