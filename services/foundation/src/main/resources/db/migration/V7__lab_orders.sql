CREATE TABLE lab_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested')),
  created_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

UPDATE foundation_meta SET schema_version = 6 WHERE id = 1;
