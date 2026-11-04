// Acceso a datos de una organización.
import type { Completion, DocumentKind, DocumentRef, EventLog, EvidenceRef, Obligation, Project } from '../../shared/types';
import type { Env } from './env';

export interface OrgData {
  projects: Project[];
  obligations: Obligation[];
  completions: Completion[];
  events: EventLog[];
  documents: DocumentRef[];
}

export async function loadOrg(env: Env, orgId: string): Promise<OrgData> {
  const [p, o, c, e, ev, docs] = await env.DB.batch([
    env.DB.prepare('SELECT data FROM projects WHERE org_id = ? ORDER BY created_at').bind(orgId),
    env.DB.prepare('SELECT data FROM obligations WHERE org_id = ?').bind(orgId),
    env.DB.prepare('SELECT obligation_id, due, completed_at, by_user, note FROM completions WHERE org_id = ?').bind(orgId),
    env.DB.prepare('SELECT id, obligation_id, occurred_at, note FROM events WHERE org_id = ?').bind(orgId),
    env.DB.prepare('SELECT id, obligation_id, due, name, mime, size FROM evidence WHERE org_id = ?').bind(orgId),
    env.DB.prepare('SELECT id, project_id, kind, name, size, uploaded_by, read_at, created_at FROM documents WHERE org_id = ? ORDER BY created_at DESC').bind(orgId),
  ]);
  const evidence = new Map<string, EvidenceRef[]>();
  for (const r of ev.results as Record<string, string | number>[]) {
    const key = `${r.obligation_id}|${r.due}`;
    const mime = String(r.mime);
    const ref: EvidenceRef = {
      id: String(r.id), name: String(r.name), size: Number(r.size),
      kind: mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'other',
      url: `/api/evidence/${r.id}`,
    };
    evidence.set(key, [...(evidence.get(key) ?? []), ref]);
  }
  return {
    projects: (p.results as { data: string }[]).map((r) => JSON.parse(r.data)),
    obligations: (o.results as { data: string }[]).map((r) => JSON.parse(r.data)),
    completions: (c.results as Record<string, string>[]).map((r) => ({
      obligationId: r.obligation_id, due: r.due, completedAt: r.completed_at, by: r.by_user,
      note: r.note ?? undefined, evidence: evidence.get(`${r.obligation_id}|${r.due}`) ?? [],
    })),
    events: (e.results as Record<string, string>[]).map((r) => ({ id: r.id, obligationId: r.obligation_id, occurredAt: r.occurred_at, note: r.note ?? undefined })),
    documents: (docs.results as Record<string, string | number | null>[]).map((r) => ({
      id: String(r.id), projectId: String(r.project_id), kind: String(r.kind) as DocumentKind, name: String(r.name), size: Number(r.size),
      uploadedBy: String(r.uploaded_by), createdAt: String(r.created_at), readAt: r.read_at ? String(r.read_at) : undefined, url: `/api/documents/${r.id}`,
    })),
  };
}

export async function obligationOrg(env: Env, obligationId: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT org_id FROM obligations WHERE id = ?').bind(obligationId).first<{ org_id: string }>();
  return r?.org_id ?? null;
}

export function putObligation(env: Env, orgId: string, o: Obligation) {
  return env.DB.prepare(
    `INSERT INTO obligations (id, org_id, project_id, data, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
     WHERE obligations.org_id = excluded.org_id`,
  ).bind(o.id, orgId, o.projectId, JSON.stringify(o));
}

export function putProject(env: Env, orgId: string, p: Project) {
  return env.DB.prepare(
    `INSERT INTO projects (id, org_id, data) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE projects.org_id = excluded.org_id`,
  ).bind(p.id, orgId, JSON.stringify(p));
}
