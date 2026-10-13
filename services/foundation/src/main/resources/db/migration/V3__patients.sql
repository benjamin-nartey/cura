CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  mrn TEXT NOT NULL,
  given_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('female', 'male', 'other', 'unknown')),
  author_id TEXT NOT NULL REFERENCES users (id),
  recorded_at TIMESTAMPTZ NOT NULL,
  UNIQUE (organization_id, mrn)
);

CREATE TABLE idempotency_keys (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, idempotency_key)
);

INSERT INTO patients (
  id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, author_id, recorded_at
) VALUES
  ('pat_elena', 'org_harborlight', 'fac_riverside', 'RIV-1001', 'Elena', 'Voss', '1959-03-12', 'female', 'usr_amira', '2024-02-01T00:00:00Z'),
  ('pat_mateo', 'org_harborlight', 'fac_riverside', 'RIV-1002', 'Mateo', 'Ruiz', '1985-06-02', 'male', 'usr_amira', '2020-03-01T00:00:00Z'),
  ('pat_helen', 'org_harborlight', 'fac_riverside', 'RIV-1003', 'Helen', 'Park', '1972-11-20', 'female', 'usr_amira', '2023-01-01T00:00:00Z'),
  ('pat_noor', 'org_harborlight', 'fac_east', 'EAS-1001', 'Noor', 'Ellis', '1990-01-09', 'female', 'usr_lea', '2026-01-09T00:00:00Z'),
  ('pat_samir', 'org_northwind', 'fac_lakeside', 'LAK-1001', 'Samir', 'Adeyemi', '1988-04-04', 'male', 'usr_evan', '2026-02-01T00:00:00Z');

UPDATE foundation_meta SET schema_version = 2 WHERE id = 1;
