CREATE TABLE rx_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  formulary_id TEXT NOT NULL,
  display TEXT NOT NULL,
  therapy_class TEXT NOT NULL,
  dose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed')),
  created_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

CREATE TABLE rx_warnings (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rx_orders (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  kind TEXT NOT NULL CHECK (kind IN ('allergy', 'interaction', 'duplicate', 'formulary')),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'moderate')),
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open')),
  created_at TIMESTAMPTZ NOT NULL
);

UPDATE foundation_meta SET schema_version = 9 WHERE id = 1;
