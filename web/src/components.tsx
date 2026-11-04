import { useEffect, useRef, useState } from 'react';
import type { Obligation, Occurrence } from '../../shared/types';
import { frequencyLabel } from '../../shared/recurrence';
import { useStore } from './store';
import { dayMonth, fileSize, relative, shortDate } from './format';
import { IconAlert, IconBolt, IconCheck, IconChevron, IconClose, IconDoc, IconImage, IconLink, IconUpload } from './icons';

export function Ring({ value, size = 112, stroke = 11, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(value * 100)}% ${label ?? ''}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * value} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div className="ring-label"><strong>{Math.round(value * 100)}%</strong>{label && <span>{label}</span>}</div>
    </div>
  );
}

export function MiniRing({ value }: { value: number }) {
  const size = 44, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const color = value >= 0.95 ? 'var(--accent)' : value >= 0.8 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div className="mini-ring" aria-hidden="true">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <b>{Math.round(value * 100)}</b>
    </div>
  );
}

const statusClass = (o: Occurrence) => `is-${o.status}`;

function shortRelative(o: Occurrence): string {
  const n = o.daysLeft;
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n < 0) return n === -1 ? 'Ayer' : `Hace ${-n} d`;
  if (n < 14) return `${n} días`;
  if (n < 60) return `${Math.round(n / 7)} sem`;
  return `${Math.round(n / 30)} meses`;
}

export function OccurrenceRow({ o, showProject = true }: { o: Occurrence; showProject?: boolean }) {
  const { complete, undo, open, today } = useStore();
  const done = o.status === 'done';
  return (
    <div className="row">
      <button className="row-tap" onClick={() => open(o.key)} aria-label={`Ver ${o.obligation.title}`} />
      <button
        className={`check ${done ? 'is-done' : o.status === 'overdue' ? 'is-overdue' : ''} ${o.eventAt ? 'is-event' : ''}`}
        onClick={() => (done ? undo(o) : complete(o))}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como cumplido'}
        aria-pressed={done}
      ><IconCheck size={15} /></button>
      <div className="row-main">
        <span className="row-title">{o.obligation.title}</span>
        <span className="row-meta">
          <span className="num">{shortDate(o.due, today)}</span>
          {showProject ? <span>{o.project.shortName}</span> : <span>{frequencyLabel(o.obligation.frequency)}</span>}
          {o.obligation.recipient !== 'Interno' && <span>A {o.obligation.recipient}</span>}
          {o.completion && o.completion.evidence.length > 0 && <span>{o.completion.evidence.length} evidencia{o.completion.evidence.length > 1 ? 's' : ''}</span>}
        </span>
      </div>
      <span className="row-side">
        {done
          ? <span className="due is-done">{dayMonth(o.completion!.completedAt.slice(0, 10))}</span>
          : <span className={`due ${statusClass(o)}`}>{shortRelative(o)}</span>}
      </span>
    </div>
  );
}

export function ObligationRow({ ob, right }: { ob: Obligation; right?: React.ReactNode }) {
  const { showObligation } = useStore();
  return (
    <div className="row no-check">
      <button className="row-tap" onClick={() => showObligation(ob.id)} aria-label={`Ver ${ob.title}`} />
      <div className="row-main">
        <span className="row-title">{ob.title}</span>
        <span className="row-meta"><span>{frequencyLabel(ob.frequency)}</span><span>{ob.component}</span>{!ob.confirmed && <span style={{ color: 'var(--warn)' }}>Por revisar</span>}</span>
      </div>
      {right ?? <IconChevron size={18} className="chev" />}
    </div>
  );
}

function Evidence({ o }: { o: Occurrence }) {
  const { attach } = useStore();
  const [over, setOver] = useState(false);
  const files = o.completion?.evidence ?? [];
  return (
    <section className="section">
      <div className="section-head"><h2>Evidencia</h2><span className="count">{files.length ? `${files.length} archivo${files.length > 1 ? 's' : ''}` : 'Sin archivos'}</span></div>
      {files.length > 0 && (
        <div className="group history">
          {files.map((f) => (
            <div className="hist-row" key={f.id}>
              {f.kind === 'image' && f.url ? <img className="thumb" src={f.url} alt="" /> : <span className="icon-btn">{f.kind === 'image' ? <IconImage size={18} /> : <IconDoc size={18} />}</span>}
              <div className="row-main"><span className="row-title" style={{ fontWeight: 500 }}>{f.name}</span><span className="row-meta">{f.size ? <span>{fileSize(f.size)}</span> : <span>{f.kind === 'pdf' ? 'PDF' : f.kind === 'image' ? 'Foto' : 'Archivo'}</span>}</span></div>
            </div>
          ))}
        </div>
      )}
      <label className={`drop ${over ? 'is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) attach(o, e.dataTransfer.files); }}>
        <IconUpload />
        <strong style={{ color: 'inherit' }}>Adjuntar foto o documento</strong>
        <span style={{ fontSize: 'var(--t-meta)' }}>{o.obligation.evidence}</span>
        <input id={`ev-${o.key}`} type="file" accept="image/*,application/pdf,.xlsx,.docx" multiple onChange={(e) => e.target.files?.length && attach(o, e.target.files)} />
      </label>
    </section>
  );
}

function RcaQuote({ ob, url }: { ob: Obligation; url: string }) {
  return (
    <section className="rca" aria-label="Lo que dice la RCA">
      {ob.quote ? <blockquote>{ob.quote}</blockquote>
        : <p className="no-quote">{ob.source === 'ventanilla' ? 'Obligación general de la Ventanilla Única, no viene de la RCA.' : 'Sin cita textual. Revisa la sección indicada en el documento.'}</p>}
      <div className="cite">
        <span>{ob.section}</span>
        {ob.source === 'rca' && <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><IconLink size={14} />Abrir la RCA en el SEA</a>}
      </div>
    </section>
  );
}

// Proyección de Apple: dónde terminaría un gesto si siguiera con su inercia.
const projectMomentum = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);
// Resistencia progresiva al tirar hacia arriba, más allá del borde.
const rubber = (o: number, dim: number, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));

export function Sheet() {
  const s = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; hist: { y: number; t: number }[]; dy: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const occ = s.openKey ? s.occurrences.find((o) => o.key === s.openKey) : undefined;
  const ob = occ?.obligation ?? s.snap?.obligations.find((o) => o.id === s.openObligation);
  const project = ob && s.snap?.projects.find((p) => p.id === ob.projectId);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sale por el mismo camino por el que entró (abajo en el celular, derecha en el computador).
  const close = () => {
    if (closing) return;
    if (reduced) { s.open(undefined); return; }
    setClosing(true);
    setTimeout(() => { setClosing(false); s.open(undefined); }, 230);
  };

  useEffect(() => {
    if (!ob) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (ob) ref.current?.focus({ preventScroll: true }); }, [ob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrastrar la hoja hacia abajo para cerrarla (celular). Sigue al dedo 1:1 y respeta la inercia al soltar.
  const onDown = (e: React.PointerEvent) => {
    const el = ref.current;
    const t = e.target as HTMLElement;
    if (!el || innerWidth >= 960 || el.scrollTop > 0 || !t.closest('.grabber, .sheet-top') || t.closest('button, a, input')) return;
    el.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y0: e.clientY, hist: [{ y: e.clientY, t: e.timeStamp }], dy: 0 };
    el.style.transition = 'none';
    el.style.animation = 'none';
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y0;
    d.dy = raw >= 0 ? raw : rubber(raw, el.offsetHeight);
    d.hist = [...d.hist, { y: e.clientY, t: e.timeStamp }].filter((h) => e.timeStamp - h.t < 100);
    el.style.transform = `translateY(${d.dy}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, d.dy) / el.offsetHeight));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current, el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    drag.current = null;
    const first = d.hist[0], last = d.hist[d.hist.length - 1];
    const v = last && first && last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0; // px/s
    const h = el.offsetHeight;
    const dismiss = d.dy + projectMomentum(v) > h * 0.4 && v > -200;
    el.style.transition = `transform ${dismiss ? 260 : 420}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.transform = dismiss ? `translateY(${h}px)` : 'translateY(0)';
    if (scrimRef.current) { scrimRef.current.style.transition = 'opacity 260ms ease'; scrimRef.current.style.opacity = dismiss ? '0' : '1'; }
    if (dismiss) setTimeout(() => s.open(undefined), 250);
  };

  if (!ob || !project) return null;
  const history = s.occurrences.filter((o) => o.obligation.id === ob.id && o.due <= s.today).slice(-6).reverse();
  const next = s.occurrences.find((o) => o.obligation.id === ob.id && o.status !== 'done' && o.due >= s.today);
  const isEvent = ob.frequency.kind === 'event';

  return (
    <>
      <div className={`scrim ${closing ? 'is-closing' : ''}`} onClick={close} ref={scrimRef} />
      <div className={`sheet ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={ref} tabIndex={-1}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-inner">
          <div className="sheet-top">
            <div>
              <span className="kicker">{project.shortName}</span>
              <h2 id="sheet-title" className="title">{ob.title}</h2>
              <div className="chips">
                {occ && <span className={`tag ${occ.status === 'overdue' ? 'is-danger' : occ.status === 'done' ? 'is-ok' : occ.status === 'today' || occ.status === 'soon' ? 'is-warn' : ''}`}>{relative(occ)}</span>}
                <span className="tag">{frequencyLabel(ob.frequency)}</span>
                <span className="tag">{ob.component}</span>
              </div>
            </div>
            <button className="icon-btn" onClick={close} aria-label="Cerrar"><IconClose size={18} /></button>
          </div>

          {!ob.confirmed && (
            <div className="banner">
              <IconAlert />
              <div>
                <p>Este compromiso se extrajo automáticamente de la RCA. Revisa que coincida con el documento antes de activar sus alertas.</p>
                <button className="btn small" onClick={() => s.confirm([ob.id])}>Confirmar compromiso</button>
              </div>
            </div>
          )}

          <p className="plain">{ob.plain}</p>

          <dl className="facts">
            <div className="fact"><dt>{occ ? 'Vence' : 'Próximo vencimiento'}</dt><dd className="num">{occ ? shortDate(occ.due, s.today) : next ? shortDate(next.due, s.today) : ob.frequency.kind === 'continuous' ? 'Siempre vigente' : isEvent ? 'Cuando ocurra' : ob.frequency.date ? shortDate(ob.frequency.date) : '—'}</dd></div>
            <div className="fact"><dt>Se entrega a</dt><dd>{ob.recipient === 'Interno' ? 'Registro interno' : ob.recipient}</dd></div>
            <div className="fact"><dt>Responsable</dt><dd>{ob.responsible ?? 'Sin asignar'}</dd></div>
            <div className="fact"><dt>Prueba de cumplimiento</dt><dd style={{ fontWeight: 500 }}>{ob.evidence}</dd></div>
          </dl>

          {ob.details && ob.details.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Parámetros</h2></div>
              <div className="chips">{ob.details.map((d) => <span className="tag" key={d}>{d}</span>)}</div>
            </section>
          )}

          <RcaQuote ob={ob} url={project.sourceUrl} />

          {occ && ob.confirmed && <Evidence o={occ} />}

          {occ && ob.confirmed && (
            <div className="actions">
              {occ.status === 'done'
                ? <button className="btn plain block" onClick={() => s.undo(occ)}>Marcar como pendiente</button>
                : <button className="btn block" onClick={() => s.complete(occ)}><IconCheck size={18} />Marcar como cumplido</button>}
            </div>
          )}

          {isEvent && ob.confirmed && (
            <div className="banner is-info">
              <IconBolt />
              <div>
                <p>Si esto ocurre, regístralo aquí. Vigía calcula el plazo de {ob.frequency.hoursAfterEvent} horas y avisa a todo el equipo.</p>
                <button className="btn small" onClick={() => s.logEvent(ob)}>Registrar que ocurrió</button>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Historial</h2><span className="count">Últimos {history.length}</span></div>
              <div className="group history">
                {history.map((h) => (
                  <button className="hist-row" key={h.key} onClick={() => s.open(h.key)} style={{ width: '100%', textAlign: 'left' }}>
                    <span className={`check ${h.status === 'done' ? 'is-done' : 'is-overdue'}`} style={{ width: 22, height: 22 }}><IconCheck size={13} /></span>
                    <div className="row-main"><span className="row-title num" style={{ fontWeight: 500 }}>{shortDate(h.due, s.today)}</span></div>
                    <span className={`due ${h.status === 'done' ? (h.completion!.completedAt.slice(0, 10) <= h.due ? 'is-done' : 'is-soon') : 'is-overdue'}`} style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                      {h.status === 'done' ? (h.completion!.completedAt.slice(0, 10) <= h.due ? 'A tiempo' : 'Con atraso') : 'Pendiente'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

export function Toast() {
  const { toast, say } = useStore();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && <button onClick={() => { toast.undo!(); say('Deshecho'); }}>Deshacer</button>}
    </div>
  );
}

/** Control segmentado con un indicador que se desliza entre opciones (columnas iguales). */
export function Segmented<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={`seg ${className}`} role="group" aria-label={label} style={{ '--n': options.length, '--i': i } as React.CSSProperties}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
