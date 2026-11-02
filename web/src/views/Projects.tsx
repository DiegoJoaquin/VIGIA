import { useMemo, useState } from 'react';
import type { Component, Obligation, Project } from '../../../shared/types';
import { onTimeRate } from '../../../shared/recurrence';
import { VENTANILLA_QUESTIONS, type VentanillaAnswers } from '../../../shared/ventanilla';
import { MiniRing, ObligationRow, OccurrenceRow, Ring } from '../components';
import { longDate, relative, shortDate } from '../format';
import { IconAlert, IconBack, IconBolt, IconChevron, IconDoc, IconLink, IconPin, IconPlus } from '../icons';
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
  const [tab, setTab] = useState<'proximo' | 'compromisos' | 'carpeta'>('proximo');
  const p = s.snap!.projects.find((x) => x.id === id);
  if (!p) return <div className="page"><p>No encontramos ese proyecto.</p></div>;
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
        <button aria-pressed={tab === 'carpeta'} onClick={() => setTab('carpeta')}>Carpeta SMA</button>
      </div>

      {tab === 'proximo' && <Upcoming id={id} />}
      {tab === 'compromisos' && <Commitments project={p} obs={obs} />}
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
