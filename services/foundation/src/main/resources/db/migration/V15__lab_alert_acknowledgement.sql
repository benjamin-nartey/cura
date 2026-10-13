CREATE TABLE lab_alerts (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL UNIQUE REFERENCES lab_results (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  critical_flag TEXT NOT NULL CHECK (critical_flag IN ('critical-low', 'critical-high')),
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged')),
  acknowledged_by TEXT REFERENCES users (id),
  acknowledged_at TIMESTAMPTZ
);

UPDATE foundation_meta SET schema_version = 14 WHERE id = 1;
