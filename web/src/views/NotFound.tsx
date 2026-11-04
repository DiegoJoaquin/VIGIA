import { useStore } from '../store';

/** Página 404: una dirección o un proyecto que no existe. */
export function NotFound({ what }: { what?: 'proyecto' }) {
  const { go } = useStore();
  return (
    <div className="page not-found">
      <p className="kicker">Error 404</p>
      <h1 className="large-title">{what === 'proyecto' ? 'No encontramos ese proyecto' : 'Esta página no existe'}</h1>
      <p className="muted" style={{ maxWidth: '46ch' }}>
        {what === 'proyecto'
          ? 'Puede que se haya eliminado o que el enlace sea de otra empresa. Cada empresa solo ve sus propios proyectos.'
          : 'Puede que el enlace esté mal escrito o que la página se haya movido.'}
      </p>
      <div className="actions two" style={{ maxWidth: 420 }}>
        <button className="btn" onClick={() => { history.replaceState(null, '', '/#hoy'); go({ name: 'hoy' }); }}>Ir a Hoy</button>
        <button className="btn plain" onClick={() => go({ name: 'proyectos' })}>Ver proyectos</button>
      </div>
    </div>
  );
}
