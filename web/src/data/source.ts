// Fuente de datos de la app. Dos implementaciones con la misma interfaz:
//  - DemoSource: datos de ejemplo en el navegador (para mostrar el producto sin servidor)
//  - ApiSource:  el Worker de Cloudflare (producción)

import type { FeedbackItem } from '../../../shared/learning';
import type { Completion, DocumentKind, DocumentRef, EventLog, EvidenceRef, Obligation, Project, TeamMember } from '../../../shared/types';
import { SEED_OBLIGATIONS, SEED_PROJECTS, SEED_VENTANILLA, seedCompletions } from '../../../shared/seed';
import { todayInChile } from '../../../shared/recurrence';
import type { VentanillaAnswers } from '../../../shared/ventanilla';
import { ventanillaObligations } from '../../../shared/ventanilla';

export interface NotifySettings {
  weeklyDigest: boolean;
  before7: boolean;
  before1: boolean;
  overdue: boolean;
  push: boolean;
}

export interface Snapshot {
  vapidPublicKey?: string | null;
  user: { name: string; email: string; org: string; role?: string };
  projects: Project[];
  documents: DocumentRef[];
  obligations: Obligation[];
  completions: Completion[];
  events: EventLog[];
  notify: NotifySettings;
  calendarUrl: string;
}

export interface ImportDraft {
  project: Project;
  obligations: Obligation[];
}

export interface DataSource {
  readonly demo: boolean;
  load(): Promise<Snapshot>;
  complete(obligationId: string, due: string, note?: string, evidence?: EvidenceRef[]): Promise<Completion>;
  undo(obligationId: string, due: string): Promise<void>;
  addEvidence(obligationId: string, due: string, file: File): Promise<EvidenceRef>;
  logEvent(obligationId: string, note?: string): Promise<EventLog>;
  confirm(obligationIds: string[]): Promise<void>;
  updateObligation(o: Obligation): Promise<void>;
  extract(url: string): Promise<ImportDraft>;
  extractFile(file: File): Promise<ImportDraft>;
  saveImport(draft: ImportDraft, keep: string[], documentId?: string, feedback?: FeedbackItem[]): Promise<{ projectId: string }>;
  uploadDocument(projectId: string, kind: DocumentKind, file: File): Promise<DocumentRef>;
  deleteDocument(id: string): Promise<void>;
  extractDocument(id: string): Promise<ImportDraft>;
  team(): Promise<TeamMember[]>;
  invite(email: string, name: string): Promise<TeamMember & { mailed?: boolean; link?: string }>;
  accessLink(id: string): Promise<{ link: string }>;
  mailTest(): Promise<{ ok: boolean; provider: string; detail: string }>;
  removeMember(id: string): Promise<void>;
  renameOrg(name: string): Promise<void>;
  deleteOrg(confirm: string): Promise<void>;
  logout(): Promise<void>;
  setVentanilla(projectId: string, answers: VentanillaAnswers): Promise<Obligation[]>;
  setNotify(n: NotifySettings): Promise<void>;
  sendTestEmail(): Promise<{ ok: boolean; message: string }>;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// —————————————————————— Demo ——————————————————————

const KEY = 'vigia-demo-v1';

interface DemoState {
  projects: Project[];
  obligations: Obligation[];
  completions: Completion[];
  events: EventLog[];
  notify: NotifySettings;
  documents: DocumentRef[];
  team: TeamMember[];
  org: string;
}

function freshDemo(): DemoState {
  const today = todayInChile();
  const { completions, events } = seedCompletions(today);
  return {
    projects: SEED_PROJECTS,
    obligations: [...SEED_OBLIGATIONS, ...SEED_VENTANILLA],
    completions, events,
    notify: { weeklyDigest: true, before7: true, before1: true, overdue: true, push: false },
    documents: SEED_PROJECTS.map((p, i) => ({
      id: `doc-${p.id}`, projectId: p.id, kind: 'rca' as const, name: `${p.rcaLabel}.pdf`, size: 1_800_000 + i * 410_000,
      uploadedBy: 'Freddy', createdAt: `${today}T09:00:00`, readAt: `${today}T09:01:00`, url: p.sourceUrl,
    })),
    team: [
      { id: 'u-demo', name: 'Freddy', email: 'tu-correo@ejemplo.cl', role: 'owner', you: true },
      { id: 'u-demo-2', name: 'Camila Rojas', email: 'camila@ejemplo.cl', role: 'member' },
    ],
    org: 'Áridos y Viñas Demo',
  };
}

export class DemoSource implements DataSource {
  readonly demo = true;
  private s: DemoState;

  constructor() {
    let saved: DemoState | null = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { saved = null; }
    // Una demo guardada por una versión anterior se completa con lo que le falte.
    this.s = saved ? { ...freshDemo(), ...saved } : freshDemo();
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* el modo demo funciona igual sin guardar */ }
  }

  static reset() {
    try { localStorage.removeItem(KEY); } catch { /* nada que limpiar */ }
  }

  async load(): Promise<Snapshot> {
    return {
      user: { name: 'Freddy', email: 'tu-correo@ejemplo.cl', org: this.s.org, role: 'owner' },
      projects: this.s.projects, obligations: this.s.obligations, documents: this.s.documents,
      completions: this.s.completions, events: this.s.events, notify: this.s.notify,
      calendarUrl: 'https://vigia.example/cal/7f3k2q9x.ics',
    };
  }

  async complete(obligationId: string, due: string, note?: string, evidence: EvidenceRef[] = []) {
    const existing = this.s.completions.find((c) => c.obligationId === obligationId && c.due === due);
    if (existing) {
      existing.evidence = [...existing.evidence, ...evidence];
      if (note) existing.note = note;
      this.save();
      return existing;
    }
    const c: Completion = { obligationId, due, completedAt: new Date().toISOString(), by: 'Freddy', note, evidence };
    this.s.completions = [...this.s.completions, c];
    this.save();
    return c;
  }

  async undo(obligationId: string, due: string) {
    this.s.completions = this.s.completions.filter((c) => !(c.obligationId === obligationId && c.due === due));
    this.save();
  }

  async addEvidence(_o: string, _d: string, file: File): Promise<EvidenceRef> {
    const kind = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other';
    let url: string | undefined;
    if (kind === 'image' && file.size < 4_000_000) url = await shrinkImage(file);
    return { id: uid(), name: file.name, kind, size: file.size, url };
  }

  async logEvent(obligationId: string, note?: string) {
    const ev: EventLog = { id: uid(), obligationId, occurredAt: new Date().toISOString(), note };
    this.s.events = [...this.s.events, ev];
    this.save();
    return ev;
  }

  async confirm(ids: string[]) {
    this.s.obligations = this.s.obligations.map((o) => (ids.includes(o.id) ? { ...o, confirmed: true } : o));
    this.save();
  }

  async updateObligation(o: Obligation) {
    this.s.obligations = this.s.obligations.map((x) => (x.id === o.id ? o : x));
    this.save();
  }

  async extract(url: string): Promise<ImportDraft> {
    // En la demo, la extracción devuelve el resultado ya procesado de una RCA real.
    await new Promise((r) => setTimeout(r, 400));
    return demoImport(url);
  }

  async extractFile(file: File) { return this.extract(file.name); }

  async saveImport(draft: ImportDraft, keep: string[], documentId?: string) {
    const existing = this.s.projects.some((p) => p.id === draft.project.id);
    if (existing && !documentId) return { projectId: draft.project.id };
    if (!existing) this.s.projects = [...this.s.projects, draft.project];
    this.s.obligations = [...this.s.obligations, ...draft.obligations.filter((o) => keep.includes(o.id)).map((o) => ({ ...o, confirmed: true }))];
    if (documentId) this.s.documents = this.s.documents.map((d) => (d.id === documentId ? { ...d, readAt: new Date().toISOString() } : d));
    this.save();
    return { projectId: draft.project.id };
  }

  async uploadDocument(projectId: string, kind: DocumentKind, file: File): Promise<DocumentRef> {
    if (file.size > 25_000_000) throw Object.assign(new Error('El archivo pesa más de 25 MB. Comprímelo o divídelo en partes.'), { field: 'file' });
    await new Promise((r) => setTimeout(r, 500));
    const doc: DocumentRef = { id: `doc-${uid()}`, projectId, kind, name: file.name, size: file.size, uploadedBy: 'Freddy', createdAt: new Date().toISOString() };
    this.s.documents = [doc, ...this.s.documents];
    this.save();
    return doc;
  }

  async deleteDocument(id: string) {
    this.s.documents = this.s.documents.filter((d) => d.id !== id);
    this.save();
  }

  async extractDocument(id: string): Promise<ImportDraft> {
    const doc = this.s.documents.find((d) => d.id === id);
    const project = this.s.projects.find((p) => p.id === doc?.projectId);
    if (!doc || !project) throw new Error('Documento no encontrado.');
    await new Promise((r) => setTimeout(r, 400));
    // En la demo, cualquier documento entrega los compromisos de una RCA real, asignados a este proyecto.
    const batch = uid().slice(0, 4);
    const obligations = demoImport('').obligations.map((o) => ({ ...o, id: `${project.id}:${o.id}-${batch}`, projectId: project.id }));
    return { project, obligations };
  }

  async team() { return this.s.team; }

  async invite(email: string, name: string) {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw Object.assign(new Error('Escribe un correo válido.'), { field: 'email' });
    if (this.s.team.some((m) => m.email === clean)) throw Object.assign(new Error('Esa persona ya está en tu equipo.'), { field: 'email' });
    const m: TeamMember = { id: `u-${uid()}`, name: name.trim() || clean.split('@')[0], email: clean, role: 'member' };
    this.s.team = [...this.s.team, m];
    this.save();
    return { ...m, pending: true, mailed: false, link: `${location.origin}/?clave=demo` };
  }

  async removeMember(id: string) { this.s.team = this.s.team.filter((m) => m.id !== id || m.you); this.save(); }

  async accessLink(_id: string) { return { link: `${location.origin}/?clave=demo` }; }

  async mailTest() { return { ok: true, provider: 'demo', detail: 'En la demo no se envían correos.' }; }

  async renameOrg(name: string) {
    if (name.trim().length < 2) throw Object.assign(new Error('Escribe el nombre de la empresa.'), { field: 'name' });
    this.s.org = name.trim(); this.save();
  }

  async deleteOrg() { throw new Error('En la demo no se puede eliminar la cuenta. Usa "Restablecer la demo".'); }
  async logout() { /* la demo no tiene sesión */ }

  async setVentanilla(projectId: string, answers: VentanillaAnswers) {
    const next = ventanillaObligations(projectId, answers);
    this.s.obligations = [...this.s.obligations.filter((o) => !(o.projectId === projectId && o.source === 'ventanilla')), ...next];
    this.save();
    return next;
  }

  async setNotify(n: NotifySettings) { this.s.notify = n; this.save(); }

  async sendTestEmail() {
    return { ok: true, message: 'En la versión instalada, este botón envía el resumen a tu correo.' };
  }
}

async function shrinkImage(file: File, max = 640): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

/** Resultado de extraer la RCA de RR Wine (Maule), para mostrar el flujo de importación. */
function demoImport(url: string): ImportDraft {
  const id = 'rrwine';
  const project: Project = {
    id, name: 'Ampliación y Normalización de Instalaciones Agroindustriales RR Wine',
    shortName: 'RR Wine', titular: 'RR Wine Ltda.', rubro: 'Vitivinícola',
    comuna: 'Sagrada Familia', region: 'Maule', instrument: 'DIA',
    rcaLabel: 'RCA Comisión de Evaluación del Maule, 2019',
    sourceUrl: url || 'https://firma.sea.gob.cl/publicaciones/df/66/2143896734.pdf',
    phase: 'Operación', trackingStart: todayInChile().slice(0, 8) + '01',
  };
  const base = { projectId: id, source: 'rca' as const, confirmed: false };
  const obligations: Obligation[] = [
    {
      ...base, id: 'r-ril-etfa', title: 'Autocontrol mensual del RIL con laboratorio ETFA',
      plain: 'Una muestra al mes en la caseta de riego, analizada por un laboratorio ETFA, durante toda la vida útil.',
      component: 'Agua', recipient: 'Interno', frequency: { kind: 'monthly', dueDay: 20 },
      section: '4.3.2 Disposición de RILes, a)', evidence: 'Certificado ETFA',
      details: ['DBO5 ≤ 2.500 mg/L', 'pH 6 a 9', 'Temperatura ≤ 35 °C', 'SST ≤ 200 mg/L', 'Hierro ≤ 5 mg/L', 'Sulfatos ≤ 250 mg/L'],
    },
    {
      ...base, id: 'r-ril-sma', title: 'Resultados del RIL a la SMA',
      plain: 'Cargar los resultados en el sistema de seguimiento de la SMA, a más tardar 3 meses después del informe del laboratorio.',
      component: 'Agua', recipient: 'SMA', frequency: { kind: 'monthly', lagMonths: 3 },
      quote: 'a más tardar 3 meses de recibido el informe del laboratorio', section: '4.3.2 Disposición de RILes, d)',
      evidence: 'Comprobante del Sistema de Seguimiento Ambiental',
    },
    {
      ...base, id: 'r-registro-riego', title: 'Registro de cada aplicación de riego',
      plain: 'Anotar fecha, sector, hectáreas, volumen y carga de DBO5 de cada riego; respaldar la planilla cada semana.',
      component: 'Agua', recipient: 'Interno', frequency: { kind: 'weekly' },
      section: '4.3.2 Disposición de RILes, e) · Tabla 13', evidence: 'Planilla de aplicaciones',
    },
    {
      ...base, id: 'r-respel', title: 'Retiro de residuos peligrosos',
      plain: 'Los residuos peligrosos no pueden quedar almacenados más de 6 meses.',
      component: 'Residuos', recipient: 'Interno', frequency: { kind: 'semiannual', dueMonth: 6 },
      section: '4.3.2 Residuos', evidence: 'Comprobante de retiro',
    },
    {
      ...base, id: 'r-carga', title: 'Carga máxima de 112 kg/día por hectárea',
      plain: 'Medir el caudal para no superar la carga máxima recomendada por el SAG.',
      component: 'Agua', recipient: 'Interno', frequency: { kind: 'continuous' },
      section: '4.3.2 Disposición de RILes', evidence: 'Cálculo de carga en la planilla',
    },
    {
      ...base, id: 'r-vivienda', title: 'Vivienda Este Interno 2 desocupada de junio a septiembre',
      plain: 'La vivienda más cercana al tranque no se ocupa mientras el tranque está en uso, para evitar olores.',
      component: 'Olores', recipient: 'Interno', frequency: { kind: 'continuous' },
      section: '4.3.2 Emisiones odorantes', evidence: 'Registro de uso de la vivienda',
    },
  ];
  return { project, obligations };
}

// —————————————————————— API ——————————————————————

async function api<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: init?.body instanceof FormData ? undefined : { 'content-type': 'application/json' },
      signal: init?.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined,
      ...init,
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new Error('La lectura tardó demasiado. Intenta de nuevo; si se repite, sube el PDF en partes más chicas.');
    throw new Error('No hay conexión con Vigía. Revisa tu internet e intenta de nuevo.');
  }
  // En /auth/* un 401 es "contraseña incorrecta" y trae su propio mensaje; en el resto, la sesión venció.
  if (res.status === 401 && !path.startsWith('/auth/')) throw Object.assign(new Error('Necesitas iniciar sesión'), { auth: true });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error ?? 'Error del servidor'), { field: body.field, exists: body.exists, noPassword: body.noPassword, invited: body.invited, expired: body.expired });
  }
  return res.json() as Promise<T>;
}

export class ApiSource implements DataSource {
  readonly demo = false;
  load() { return api<Snapshot>('/snapshot'); }
  complete(obligationId: string, due: string, note?: string, evidence: EvidenceRef[] = []) {
    return api<Completion>('/completions', { method: 'POST', body: JSON.stringify({ obligationId, due, note, evidenceIds: evidence.map((e) => e.id) }) });
  }
  async undo(obligationId: string, due: string) {
    await api(`/completions?obligationId=${encodeURIComponent(obligationId)}&due=${due}`, { method: 'DELETE' });
  }
  async addEvidence(obligationId: string, due: string, file: File) {
    const fd = new FormData();
    fd.set('obligationId', obligationId); fd.set('due', due);
    // Las fotos del celular se reducen antes de subir (máx. 1.600 px, JPEG): quedan bajo el límite gratuito.
    if (file.type.startsWith('image/')) {
      const blob = await (await fetch(await shrinkImage(file, 1600))).blob();
      fd.set('file', new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
    } else fd.set('file', file);
    return api<EvidenceRef>('/evidence', { method: 'POST', body: fd });
  }
  logEvent(obligationId: string, note?: string) {
    return api<EventLog>('/events', { method: 'POST', body: JSON.stringify({ obligationId, note }) });
  }
  async confirm(ids: string[]) { await api('/obligations/confirm', { method: 'POST', body: JSON.stringify({ ids }) }); }
  async updateObligation(o: Obligation) { await api(`/obligations/${o.id}`, { method: 'PUT', body: JSON.stringify(o) }); }
  extract(url: string) { return api<ImportDraft>('/import/extract', { method: 'POST', body: JSON.stringify({ url }), timeoutMs: 240_000 }); }
  extractFile(file: File) {
    const fd = new FormData();
    fd.set('file', file);
    return api<ImportDraft>('/import/extract-file', { method: 'POST', body: fd, timeoutMs: 240_000 });
  }
  saveImport(draft: ImportDraft, keep: string[], documentId?: string, feedback?: FeedbackItem[]) {
    return api<{ projectId: string }>('/import/save', { method: 'POST', body: JSON.stringify({ draft, keep, documentId, feedback }) });
  }
  uploadDocument(projectId: string, kind: DocumentKind, file: File) {
    const fd = new FormData();
    fd.set('projectId', projectId); fd.set('kind', kind); fd.set('file', file);
    return api<DocumentRef>('/documents', { method: 'POST', body: fd });
  }
  async deleteDocument(id: string) { await api(`/documents/${id}`, { method: 'DELETE' }); }
  extractDocument(id: string) { return api<ImportDraft>(`/documents/${id}/extract`, { method: 'POST', timeoutMs: 240_000 }); }
  team() { return api<TeamMember[]>('/team'); }
  invite(email: string, name: string) { return api<TeamMember & { mailed?: boolean; link?: string }>('/team/invite', { method: 'POST', body: JSON.stringify({ email, name }) }); }
  accessLink(id: string) { return api<{ link: string }>(`/team/${id}/link`, { method: 'POST' }); }
  mailTest() { return api<{ ok: boolean; provider: string; detail: string }>('/mail/test', { method: 'POST' }); }
  async removeMember(id: string) { await api(`/team/${id}`, { method: 'DELETE' }); }
  async renameOrg(name: string) { await api('/org', { method: 'PUT', body: JSON.stringify({ name }) }); }
  async deleteOrg(confirm: string) { await api('/org', { method: 'DELETE', body: JSON.stringify({ confirm }) }); }
  async logout() { await api('/auth/logout', { method: 'POST' }); }
  setVentanilla(projectId: string, answers: VentanillaAnswers) {
    return api<Obligation[]>(`/projects/${projectId}/ventanilla`, { method: 'PUT', body: JSON.stringify(answers) });
  }
  async setNotify(n: NotifySettings) { await api('/settings/notify', { method: 'PUT', body: JSON.stringify(n) }); }
  async subscribePush(vapidKey: string) {
    const reg = await navigator.serviceWorker.ready;
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('No diste permiso para notificaciones. Actívalo en los ajustes del navegador.');
    const key = Uint8Array.from(atob(vapidKey.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
  }
  signup(b: { email: string; password: string; name: string; company: string }) { return api<{ ok: true }>('/auth/signup', { method: 'POST', body: JSON.stringify(b) }); }
  login(b: { email: string; password: string }) { return api<{ ok: true; firstPassword?: boolean }>('/auth/login', { method: 'POST', body: JSON.stringify(b) }); }
  forgot(email: string) { return api<{ ok: true }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }); }
  reset(token: string, password: string) { return api<{ ok: true; email: string }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }); }
  sendTestEmail() { return api<{ ok: boolean; message: string }>('/settings/test-email', { method: 'POST' }); }
}

declare const __DEMO__: boolean;
export const source: DataSource = __DEMO__ || new URLSearchParams(location.search).has('demo') ? new DemoSource() : new ApiSource();
