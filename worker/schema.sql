-- Vigía · base de datos (Cloudflare D1 / SQLite)
-- Los proyectos y compromisos se guardan como JSON para poder cambiar el modelo sin migraciones.

-- Cada empresa es una isla: todo lo demás cuelga de org_id y ninguna consulta cruza empresas.
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rut TEXT,
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
  expires_at INTEGER NOT NULL,
  signup TEXT                                   -- JSON {name, company} cuando es una cuenta nueva
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

-- Documentos del proyecto (RCA, resoluciones, adendas, informes). Se guardan en trozos de 900 KB
-- dentro de la misma base gratuita: no hace falta R2 ni tarjeta de crédito.
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,                           -- rca | resolucion | programa | informe | otro
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  read_at TEXT,                                 -- cuándo se leyeron sus compromisos
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS documents_org ON documents(org_id, project_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  document_id TEXT NOT NULL REFERENCES documents(id),
  idx INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (document_id, idx)
);

-- Contraseñas (PBKDF2-SHA256, 100.000 iteraciones, sal aleatoria). Tabla aparte para no alterar "users".
CREATE TABLE IF NOT EXISTS credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Freno a los intentos fallidos de contraseña: 5 errores bloquean ese correo 15 minutos.
CREATE TABLE IF NOT EXISTS auth_throttle (
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- Correcciones hechas al revisar una lectura automática: enseñan a las próximas lecturas.
-- Se guarda la frase pública de la RCA y la decisión, sin fechas ni evidencias de la empresa.
CREATE TABLE IF NOT EXISTS reading_feedback (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT,
  action TEXT NOT NULL,
  quote_key TEXT NOT NULL,
  quote TEXT NOT NULL,
  section TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reading_feedback_key ON reading_feedback (quote_key);
CREATE INDEX IF NOT EXISTS reading_feedback_action ON reading_feedback (action, created_at);
