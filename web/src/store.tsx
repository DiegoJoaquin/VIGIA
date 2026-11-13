import type { FeedbackItem } from '../../shared/learning';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Completion, DocumentKind, DocumentRef, EvidenceRef, Obligation, Occurrence } from '../../shared/types';
import { addDays, buildOccurrences, todayInChile } from '../../shared/recurrence';
import type { VentanillaAnswers } from '../../shared/ventanilla';
import { source, ApiSource, DemoSource, type ImportDraft, type NotifySettings, type Snapshot } from './data/source';

export type Route =
  | { name: 'hoy' }
  | { name: 'calendario' }
  | { name: 'proyectos' }
  | { name: 'proyecto'; id: string }
  | { name: 'importar' }
  | { name: 'ajustes' }
  | { name: 'noencontrado' }
  | { name: 'entrar' };

function parseHash(): Route {
  const h = location.hash.replace('#', '');
  if (h.startsWith('proyecto-')) return { name: 'proyecto', id: h.slice('proyecto-'.length) };
  if (h === 'calendario' || h === 'proyectos' || h === 'importar' || h === 'ajustes' || h === 'entrar') return { name: h };
  // Una dirección que no existe (por ejemplo /algo o #algo) muestra la página 404 en vez de "Hoy".
  const path = location.pathname.replace(/\/(index\.html|demo\.html)?$/, '');
  if (path || (h && h !== 'hoy')) return { name: 'noencontrado' };
  return { name: 'hoy' };
}

export function routeHash(r: Route): string {
  return r.name === 'proyecto' ? `#proyecto-${r.id}` : `#${r.name}`;
}

interface Toast { id: number; text: string; undo?: () => void }

interface Store {
  needLogin: boolean;
  ready: boolean;
  error?: string;
  demo: boolean;
  today: string;
  snap?: Snapshot;
  occurrences: Occurrence[];
  route: Route;
  go: (r: Route) => void;
  openKey?: string;
  open: (key?: string) => void;
  openObligation?: string;
  showObligation: (id?: string) => void;
  toast?: Toast;
  say: (text: string, undo?: () => void) => void;
  complete: (o: Occurrence, evidence?: EvidenceRef[], note?: string) => Promise<void>;
  undo: (o: Occurrence) => Promise<void>;
  attach: (o: Occurrence, files: FileList) => Promise<void>;
  logEvent: (ob: Obligation) => Promise<void>;
  confirm: (ids: string[]) => Promise<void>;
  extract: (url: string) => Promise<ImportDraft>;
  extractFile: (file: File) => Promise<ImportDraft>;
  saveImport: (d: ImportDraft, keep: string[], documentId?: string, feedback?: FeedbackItem[]) => Promise<string>;
  uploadDocument: (projectId: string, kind: DocumentKind, file: File) => Promise<DocumentRef>;
  deleteDocument: (d: DocumentRef) => Promise<void>;
  extractDocument: (id: string, notified?: string) => Promise<ImportDraft>;
  logout: () => Promise<void>;
  setVentanilla: (projectId: string, a: VentanillaAnswers) => Promise<void>;
  setNotify: (n: NotifySettings) => Promise<void>;
  testEmail: () => Promise<string>;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [needLogin, setNeedLogin] = useState(false);
  const [route, setRoute] = useState<Route>(parseHash);
  const [openKey, setOpenKey] = useState<string>();
  const [openObligation, setOpenObligation] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const today = todayInChile();

  const reload = useCallback(async () => {
    try { setSnap(await source.load()); } catch (e) {
      if ((e as { auth?: boolean }).auth) setNeedLogin(true); else setError((e as Error).message);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); setOpenKey(undefined); setOpenObligation(undefined); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const occurrences = useMemo(() => {
    if (!snap) return [];
    return buildOccurrences({
      projects: snap.projects,
      obligations: snap.obligations.filter((o) => o.confirmed),
      completions: snap.completions, events: snap.events, today,
      from: addDays(today, -400), to: addDays(today, 420),
    });
  }, [snap, today]);

  const say = useCallback((text: string, undo?: () => void) => {
    const id = Date.now();
    setToast({ id, text, undo });
    setTimeout(() => setToast((t) => (t?.id === id ? undefined : t)), 4200);
  }, []);

  const patchCompletions = (fn: (c: Completion[]) => Completion[]) =>
    setSnap((s) => (s ? { ...s, completions: fn(s.completions) } : s));

  const undo = useCallback(async (o: Occurrence) => {
    patchCompletions((cs) => cs.filter((c) => !(c.obligationId === o.obligation.id && c.due === o.due)));
    await source.undo(o.obligation.id, o.due);
  }, []);

  const complete = useCallback(async (o: Occurrence, evidence: EvidenceRef[] = [], note?: string) => {
    const optimistic: Completion = { obligationId: o.obligation.id, due: o.due, completedAt: new Date().toISOString(), by: snap?.user.name ?? '', evidence, note };
    patchCompletions((cs) => [...cs.filter((c) => !(c.obligationId === o.obligation.id && c.due === o.due)), optimistic]);
    say('Marcado como cumplido', () => undo(o));
    try {
      const saved = await source.complete(o.obligation.id, o.due, note, evidence);
      patchCompletions((cs) => cs.map((c) => (c.obligationId === saved.obligationId && c.due === saved.due ? saved : c)));
    } catch (e) {
      patchCompletions((cs) => cs.filter((c) => c !== optimistic));
      say(`No se guardó: ${(e as Error).message}`);
    }
  }, [snap, say, undo]);

  const attach = useCallback(async (o: Occurrence, files: FileList) => {
    const refs: EvidenceRef[] = [];
    for (const f of Array.from(files)) refs.push(await source.addEvidence(o.obligation.id, o.due, f));
    if (o.completion) {
      const updated = { ...o.completion, evidence: [...o.completion.evidence, ...refs] };
      patchCompletions((cs) => cs.map((c) => (c.obligationId === o.obligation.id && c.due === o.due ? updated : c)));
      await source.complete(o.obligation.id, o.due, undefined, refs);
      say(refs.length === 1 ? 'Evidencia adjunta' : `${refs.length} evidencias adjuntas`);
    } else {
      await complete(o, refs);
    }
  }, [complete, say]);

  const store: Store = {
    needLogin, ready: !!snap, error, demo: source.demo, today, snap, occurrences, route,
    go: (r) => { location.hash = routeHash(r); },
    openKey, open: (k) => { setOpenKey(k); setOpenObligation(undefined); },
    openObligation, showObligation: (id) => { setOpenObligation(id); setOpenKey(undefined); },
    toast, say, complete, undo, attach,
    logEvent: async (ob) => {
      const ev = await source.logEvent(ob.id);
      setSnap((s) => (s ? { ...s, events: [...s.events, ev] } : s));
      say(`Evento registrado. Tienes ${ob.frequency.hoursAfterEvent ?? 24} horas.`);
    },
    confirm: async (ids) => {
      await source.confirm(ids);
      setSnap((s) => (s ? { ...s, obligations: s.obligations.map((o) => (ids.includes(o.id) ? { ...o, confirmed: true } : o)) } : s));
      say(ids.length === 1 ? 'Compromiso confirmado' : `${ids.length} compromisos confirmados`);
    },
    extract: (url) => source.extract(url),
    extractFile: (file) => source.extractFile(file),
    saveImport: async (d, keep, documentId, feedback) => {
      const { projectId } = await source.saveImport(d, keep, documentId, feedback);
      await reload();
      say(`${keep.length} compromisos agregados`);
      return projectId;
    },
    uploadDocument: async (projectId, kind, file) => {
      const doc = await source.uploadDocument(projectId, kind, file);
      setSnap((s) => (s ? { ...s, documents: [doc, ...s.documents] } : s));
      say('Documento guardado');
      return doc;
    },
    deleteDocument: async (d) => {
      setSnap((s) => (s ? { ...s, documents: s.documents.filter((x) => x.id !== d.id) } : s));
      try { await source.deleteDocument(d.id); say('Documento eliminado'); }
      catch (e) { setSnap((s) => (s ? { ...s, documents: [d, ...s.documents] } : s)); say((e as Error).message); }
    },
    extractDocument: (id, notified) => source.extractDocument(id, notified),
    logout: async () => { await source.logout(); location.href = '/'; },
    setVentanilla: async (id, a) => {
      const next = await source.setVentanilla(id, a);
      setSnap((s) => (s ? { ...s, obligations: [...s.obligations.filter((o) => !(o.projectId === id && o.source === 'ventanilla')), ...next] } : s));
      say(next.length ? `${next.length} obligaciones de Ventanilla Única activas` : 'Sin obligaciones de Ventanilla Única');
    },
    setNotify: async (n) => {
      const prev = snap?.notify;
      setSnap((s) => (s ? { ...s, notify: n } : s));
      try {
        if (n.push && !prev?.push && source instanceof ApiSource) {
          if (!snap?.vapidPublicKey) throw new Error('Las notificaciones en el celular no están configuradas en el servidor.');
          await source.subscribePush(snap.vapidPublicKey);
        }
        await source.setNotify(n);
      } catch (e) {
        setSnap((s) => (s && prev ? { ...s, notify: prev } : s));
        say((e as Error).message);
      }
    },
    testEmail: async () => (await source.sendTestEmail()).message,
    resetDemo: () => { DemoSource.reset(); location.hash = '#hoy'; location.reload(); },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
