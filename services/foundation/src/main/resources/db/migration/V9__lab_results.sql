ALTER TABLE lab_orders DROP CONSTRAINT lab_orders_status_check;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_status_check CHECK (status IN ('requested', 'collected', 'resulted'));

CREATE TABLE lab_results (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES lab_orders (id),
  observation_id TEXT NOT NULL REFERENCES observations (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  code TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  reference_low NUMERIC,
  reference_high NUMERIC,
  critical_flag TEXT NOT NULL CHECK (critical_flag IN ('none', 'critical-low', 'critical-high')),
  rule_version TEXT,
  recorded_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

UPDATE foundation_meta SET schema_version = 8 WHERE id = 1;
