CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE facilities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  name TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT REFERENCES facilities (id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('clinician', 'nurse', 'auditor', 'admin'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE foundation_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL
);

INSERT INTO foundation_meta (id, schema_version) VALUES (1, 1);
