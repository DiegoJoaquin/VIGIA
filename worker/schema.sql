-- Vigía · base de datos (Cloudflare D1 / SQLite)
-- Los proyectos y compromisos se guardan como JSON para poder cambiar el modelo sin migraciones.

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'owner',           -- owner | member | consultor
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS projects_org ON projects(org_id);

CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS obligations_org ON obligations(org_id);

CREATE TABLE IF NOT EXISTS completions (
  org_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  due TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  by_user TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (obligation_id, due)
);
CREATE INDEX IF NOT EXISTS completions_org ON completions(org_id);

-- Evidencias: archivos de hasta 1,5 MB guardados en la misma base (las fotos se comprimen en el celular).
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  due TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS evidence_occ ON evidence(obligation_id, due);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  notify TEXT NOT NULL,
  calendar_token TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  keys TEXT NOT NULL
);

-- Evita mandar dos veces el mismo aviso.
CREATE TABLE IF NOT EXISTS notification_log (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
