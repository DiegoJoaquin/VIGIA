import { useMemo, useState } from 'react';
import { OccurrenceRow } from '../components';
import { longDate, monthYear } from '../format';
import { IconBack, IconCalendar, IconChevron } from '../icons';
import { useStore } from '../store';
import { projectColor } from '../projectColors';
import { lastDayOfMonth, toISO } from '../../../shared/recurrence';

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function Calendar() {
  const { occurrences: all, today, go, snap } = useStore();
  const projects = snap?.projects ?? [];
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  // Qué proyecto se ve: uno solo o "todos". Se recuerda en este aparato.
  const [only, setOnly] = useState<string>(() => { try { return localStorage.getItem('vigia:cal-proyecto') ?? ''; } catch { return ''; } });
  const pick = (id: string) => { setOnly(id); try { localStorage.setItem('vigia:cal-proyecto', id); } catch { /* sin almacenamiento: queda solo en pantalla */ } };
  const active = projects.some((p) => p.id === only) ? only : '';
  const occurrences = useMemo(() => (active ? all.filter((o) => o.project.id === active) : all), [all, active]);
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [sel, setSel] = useState(today);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof occurrences>();
    for (const o of occurrences) map.set(o.due, [...(map.get(o.due) ?? []), o]);
    return map;
  }, [occurrences]);

  const cells = useMemo(() => {
    const first = Date.UTC(ym.y, ym.m, 1);
    const offset = (new Date(first).getUTCDay() + 6) % 7; // lunes primero
    const days = lastDayOfMonth(ym.y, ym.m + 1);
    const total = Math.ceil((offset + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => toISO(first + (i - offset) * 86_400_000));
  }, [ym]);

  const shift = (n: number) => setYm(({ y, m }) => { const t = y * 12 + m + n; return { y: Math.floor(t / 12), m: t % 12 }; });
  const selected = byDay.get(sel) ?? [];
  const monthKey = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
  const monthList = occurrences.filter((o) => o.due.startsWith(monthKey));

  return (
    <div className="page">
      <header className="page-head">
        <div><h1 className="large-title">Calendario</h1></div>
        <button className="btn small secondary" onClick={() => go({ name: 'ajustes' })}><IconCalendar size={16} />Suscribir</button>
      </header>

      {projects.length > 1 && (
        <div className="proj-filter" role="group" aria-label="Filtrar por proyecto">
          <button className={`pchip ${active === '' ? 'is-on' : ''}`} aria-pressed={active === ''} onClick={() => pick('')}>Todos</button>
          {projects.map((p) => {
            const on = active === p.id;
            const c = projectColor(ids, p.id);
            return (
              <button key={p.id} className={`pchip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => pick(on ? '' : p.id)}
                style={{ ['--pc' as string]: c }}>
                <i className="pdot" style={{ background: c }} />{p.shortName}
              </button>
            );
          })}
        </div>
      )}

      <section className="cal" aria-label={monthYear(ym.y, ym.m)}>
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior"><IconBack size={18} /></button>
          <h2>{monthYear(ym.y, ym.m)}</h2>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente"><IconChevron size={18} /></button>
        </div>
        <div className="cal-grid">
          {DOW.map((d, i) => <div className="cal-dow" key={i} aria-hidden="true">{d}</div>)}
          {cells.map((iso) => {
            const list = byDay.get(iso) ?? [];
            const out = !iso.startsWith(monthKey);
            // Un punto por proyecto (con su color); el anillo rojo avisa que ese proyecto tiene algo vencido ese día.
            const dots = [...new Map(list.map((o) => [o.project.id, o.project.id])).keys()].slice(0, 4).map((pid) => {
              const mine = list.filter((o) => o.project.id === pid);
              return { pid, overdue: mine.some((o) => o.status === 'overdue'), done: mine.every((o) => o.status === 'done') };
            });
            return (
              <button key={iso} className={`cal-day ${out ? 'is-out' : ''} ${iso === today ? 'is-today' : ''} ${iso === sel && iso !== today ? 'is-sel' : ''}`}
                onClick={() => { setSel(iso); if (out) setYm({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 }); }}
                aria-label={`${longDate(iso)}, ${list.length} vencimientos`} aria-pressed={iso === sel}>
                <span className="n num">{Number(iso.slice(8))}</span>
                <span className="dots">{dots.map((d) => <span key={d.pid} className={`dot pc ${d.overdue ? 'is-overdue-ring' : ''} ${d.done ? 'is-faded' : ''}`} style={{ background: projectColor(ids, d.pid) }} />)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>{longDate(sel)}</h2><span className="count">{selected.length || 'Sin vencimientos'}</span></div>
        {selected.length > 0 && <div className="group">{selected.map((o) => <OccurrenceRow key={o.key} o={o} />)}</div>}
      </section>

      <section className="section">
        <div className="section-head"><h2>Todo {monthYear(ym.y, ym.m).split(' ')[0].toLowerCase()}</h2><span className="count">{monthList.length}</span></div>
        {monthList.length
          ? <div className="group">{monthList.map((o) => <OccurrenceRow key={o.key} o={o} />)}</div>
          : <div className="group empty"><p>Sin vencimientos este mes.</p></div>}
      </section>
    </div>
  );
}
