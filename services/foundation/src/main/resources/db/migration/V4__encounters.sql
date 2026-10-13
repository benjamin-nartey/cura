CREATE TABLE encounters (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  status TEXT NOT NULL CHECK (status IN ('in-progress', 'finished')),
  class TEXT NOT NULL CHECK (class IN ('ambulatory')),
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  author_id TEXT NOT NULL REFERENCES users (id),
  version INTEGER NOT NULL
);

INSERT INTO encounters (
  id, organization_id, facility_id, patient_id, status, class, reason, started_at, ended_at, author_id, version
) VALUES
  ('enc_elena', 'org_harborlight', 'fac_riverside', 'pat_elena', 'finished', 'ambulatory', 'Diabetes follow-up', '2026-09-01T15:00:00Z', '2026-09-01T16:00:00Z', 'usr_amira', 2),
  ('enc_mateo', 'org_harborlight', 'fac_riverside', 'pat_mateo', 'in-progress', 'ambulatory', 'Wheeze since yesterday', '2026-10-07T18:00:00Z', NULL, 'usr_amira', 1),
  ('enc_helen', 'org_harborlight', 'fac_riverside', 'pat_helen', 'finished', 'ambulatory', 'Blood pressure follow-up', '2026-08-01T15:00:00Z', '2026-08-01T15:40:00Z', 'usr_amira', 2);

UPDATE foundation_meta SET schema_version = 3 WHERE id = 1;
