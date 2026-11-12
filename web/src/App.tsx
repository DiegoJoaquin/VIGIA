import { Sheet, Toast } from './components';
import { IconCalendar, IconProjects, IconSettings, IconToday } from './icons';
import { routeHash, useStore, type Route } from './store';
import { Calendar } from './views/Calendar';
import { Import } from './views/Import';
import { useEffect } from 'react';
import { Login } from './views/Login';
import { NotFound } from './views/NotFound';
import { ProjectDetail, Projects } from './views/Projects';
import { Settings } from './views/Settings';
import { Today } from './views/Today';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6.5 10.5 19 20 4.5" />
      </svg>
    </span>
  );
}

const NAV: { route: Route; label: string; Icon: typeof IconToday }[] = [
  { route: { name: 'hoy' }, label: 'Hoy', Icon: IconToday },
  { route: { name: 'calendario' }, label: 'Calendario', Icon: IconCalendar },
  { route: { name: 'proyectos' }, label: 'Proyectos', Icon: IconProjects },
  { route: { name: 'ajustes' }, label: 'Ajustes', Icon: IconSettings },
];

function isActive(current: Route, r: Route) {
  if (r.name === 'proyectos') return current.name === 'proyectos' || current.name === 'proyecto' || current.name === 'importar';
  return current.name === r.name;
}

const TITLES: Record<Route['name'], string> = {
  hoy: 'Hoy', calendario: 'Calendario', proyectos: 'Proyectos', proyecto: 'Proyecto',
  importar: 'Importar RCA', ajustes: 'Ajustes', noencontrado: 'Página no encontrada', entrar: 'Entrar',
};

/** Título de la pestaña del navegador según la vista. */
function useTitle(s: ReturnType<typeof useStore>) {
  const r = s.route;
  const project = r.name === 'proyecto' ? s.snap?.projects.find((p) => p.id === r.id)?.shortName : undefined;
  const label = s.needLogin ? 'Entrar' : project ?? TITLES[r.name];
  useEffect(() => { document.title = `${label} · Vigía`; }, [label]);
}

export function App() {
  const s = useStore();
  useTitle(s);
  // La portada con el inicio de sesión: sin sesión, con un enlace para crear contraseña, o en la demo (#entrar).
  if (s.needLogin || new URLSearchParams(location.search).has('clave')) return <Login mark={<BrandMark size={40} />} />;
  if (s.demo && s.route.name === 'entrar') return <Login mark={<BrandMark size={40} />} demo />;
  if (s.error) return <div className="page"><h1 className="title">No pudimos cargar tus datos</h1><p className="muted">{s.error}. Revisa tu conexión y vuelve a abrir la app.</p></div>;
  if (!s.ready) return <div className="page" aria-busy="true"><p className="faint">Cargando…</p></div>;

  const overdue = s.occurrences.filter((o) => o.status === 'overdue').length;
  const r = s.route;
  const view =
    r.name === 'calendario' ? <Calendar /> :
    r.name === 'proyectos' ? <Projects /> :
    r.name === 'proyecto' ? <ProjectDetail id={r.id} /> :
    r.name === 'importar' ? <Import /> :
    r.name === 'ajustes' ? <Settings /> :
    r.name === 'noencontrado' ? <NotFound /> : <Today />;

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Secciones">
        <div className="brand"><BrandMark />Vigía</div>
        {NAV.map(({ route, label, Icon }) => (
          <a key={label} href={routeHash(route)} className="side-link" aria-current={isActive(r, route) ? 'page' : undefined}>
            <Icon size={20} />{label}
            {route.name === 'hoy' && overdue > 0 && <span className="badge">{overdue}</span>}
          </a>
        ))}
        <div className="side-foot">
          <span>{s.snap!.projects.length} proyectos · {s.snap!.obligations.filter((o) => o.confirmed).length} compromisos</span>
          {s.demo && <span>Demo con RCA públicas del SEIA</span>}
          {!s.demo && (
            <span className="side-account">
              <span className="side-email" title={s.snap!.user.email}>{s.snap!.user.email}</span>
              <button className="link-btn" onClick={s.logout}>Cerrar sesión</button>
            </span>
          )}
        </div>
      </nav>

      <main className="main" id="contenido">
        {s.demo && (
          <div className="demo-ribbon">
            <span>Demo con datos reales de RCA públicas.</span>
          </div>
        )}
        {!s.demo && (
          <div className="mobile-account">
            <span className="side-email">{s.snap!.user.email}</span>
            <button className="link-btn" onClick={s.logout}>Cerrar sesión</button>
          </div>
        )}
        {view}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        {NAV.map(({ route, label, Icon }) => (
          <a key={label} href={routeHash(route)} className="tab" aria-current={isActive(r, route) ? 'page' : undefined} style={{ textDecoration: 'none' }}>
            <span className="badge-dot"><Icon size={24} />{route.name === 'hoy' && overdue > 0 && <span className="badge">{overdue}</span>}</span>
            {label}
          </a>
        ))}
      </nav>

      <Sheet />
      <Toast />
    </div>
  );
}
