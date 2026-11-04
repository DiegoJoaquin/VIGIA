import { useMemo } from 'react';
import { onTimeRate } from '../../../shared/recurrence';
import { OccurrenceRow, Ring } from '../components';
import { longDate } from '../format';
import { IconAlert, IconPlus, IconShield } from '../icons';
import { useStore } from '../store';

export function Today() {
  const { occurrences, today, snap, go } = useStore();

  const { overdue, week, month, rate, pending } = useMemo(() => {
    const open = occurrences.filter((o) => o.status !== 'done');
    // Un compromiso recurrente aparece una sola vez: su próxima fecha.
    const seen = new Set<string>();
    const firstOnly = (list: typeof open) => list.filter((o) => (seen.has(o.obligation.id) ? false : (seen.add(o.obligation.id), true)));
    const overdue = open.filter((o) => o.status === 'overdue');
    const week = firstOnly(open.filter((o) => o.daysLeft >= 0 && o.daysLeft <= 7));
    const month = firstOnly(open.filter((o) => o.daysLeft > 7 && o.daysLeft <= 31));
    return {
      overdue, week, month,
      rate: onTimeRate(occurrences, today),
      pending: snap?.obligations.filter((o) => !o.confirmed) ?? [],
    };
  }, [occurrences, today, snap]);

  const pendingProjects = [...new Set(pending.map((o) => o.projectId))].map((id) => snap!.projects.find((p) => p.id === id)!);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="kicker">{longDate(today)}</p>
          <h1 className="large-title">Hoy</h1>
        </div>
        <button className="icon-btn" onClick={() => go({ name: 'importar' })} aria-label="Importar una RCA"><IconPlus size={20} /></button>
      </header>

      {snap!.projects.length === 0 ? (
        <section className="welcome" aria-label="Primeros pasos">
          <h2>Bienvenido{snap!.user.name ? `, ${snap!.user.name.split(' ')[0]}` : ''}. Partamos por tu primera RCA.</h2>
          <ol className="welcome-steps">
            <li>Pega el enlace de la RCA del SEIA o sube el PDF.</li>
            <li>Revisa los compromisos que Vigía encuentra y confírmalos.</li>
            <li>Desde ese día te avisamos antes de cada vencimiento.</li>
          </ol>
          <button className="btn" onClick={() => go({ name: 'importar' })}><IconPlus size={18} />Importar mi primera RCA</button>
        </section>
      ) : (
      <section className="summary" aria-label="Resumen de cumplimiento">
        <Ring value={rate.rate} label="a tiempo" />
        <div className="stats">
          <button className={`stat ${overdue.length ? 'is-danger' : ''}`} onClick={() => jump('vencidos')}><strong>{overdue.length}</strong><span>Vencido{overdue.length === 1 ? '' : 's'}</span></button>
          <button className={`stat ${week.length ? 'is-warn' : ''}`} onClick={() => jump('semana')}><strong>{week.length}</strong><span>Esta semana</span></button>
          <button className="stat" onClick={() => jump('mes')}><strong>{month.length}</strong><span>Este mes</span></button>
        </div>
        <p className="summary-note num">Últimos 12 meses: {rate.onTime} de {rate.due} entregas a tiempo en {snap?.projects.length} proyecto{snap?.projects.length === 1 ? '' : 's'}.</p>
      </section>
      )}

      {pendingProjects.map((p) => (
        <div className="banner" key={p.id}>
          <IconAlert />
          <div>
            <p><strong>{p.shortName}</strong> tiene {pending.filter((o) => o.projectId === p.id).length} compromisos extraídos de su RCA que aún no revisas. No generan alertas hasta que los confirmes.</p>
            <button className="btn small" onClick={() => go({ name: 'proyecto', id: p.id })}>Revisar compromisos</button>
          </div>
        </div>
      ))}

      {overdue.length > 0 && (
        <section className="section" id="vencidos">
          <div className="section-head"><h2 style={{ color: 'var(--danger)' }}>Vencidos</h2><span className="count">{overdue.length}</span></div>
          <div className="group">{overdue.map((o) => <OccurrenceRow key={o.key} o={o} />)}</div>
        </section>
      )}

      <section className="section" id="semana">
        <div className="section-head"><h2>Esta semana</h2><span className="count">{week.length}</span></div>
        {week.length
          ? <div className="group">{week.map((o) => <OccurrenceRow key={o.key} o={o} />)}</div>
          : <div className="group empty"><IconShield size={28} /><p>Nada vence en los próximos 7 días.</p></div>}
      </section>

      <section className="section" id="mes">
        <div className="section-head"><h2>Próximos 30 días</h2><span className="count">{month.length}</span></div>
        {month.length
          ? <div className="group">{month.map((o) => <OccurrenceRow key={o.key} o={o} />)}</div>
          : <div className="group empty"><p>Sin vencimientos este mes.</p></div>}
      </section>
    </div>
  );
}
