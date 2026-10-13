CREATE TABLE observation_pins (
  code TEXT PRIMARY KEY,
  display TEXT NOT NULL,
  unit TEXT NOT NULL,
  low_bound NUMERIC,
  high_bound NUMERIC,
  entry_min NUMERIC NOT NULL,
  entry_max NUMERIC NOT NULL,
  catalog TEXT NOT NULL CHECK (catalog IN ('core', 'cardio'))
);

CREATE TABLE facility_observation_catalogs (
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  catalog TEXT NOT NULL CHECK (catalog IN ('core', 'cardio')),
  PRIMARY KEY (facility_id, catalog)
);

INSERT INTO observation_pins (code, display, unit, low_bound, high_bound, entry_min, entry_max, catalog) VALUES
  ('8480-6', 'Systolic blood pressure', 'mmHg', 90, 140, 40, 300, 'core'),
  ('8462-4', 'Diastolic blood pressure', 'mmHg', 60, 90, 20, 200, 'core'),
  ('8867-4', 'Heart rate', '/min', 50, 100, 20, 250, 'core'),
  ('8310-5', 'Body temperature', 'Cel', 35, 38, 30, 45, 'core'),
  ('59408-5', 'Oxygen saturation', '%', 94, NULL, 50, 100, 'core'),
  ('2823-3', 'Potassium', 'mmol/L', 3.5, 5, 1, 9, 'core'),
  ('2345-7', 'Glucose', 'mg/dL', 70, 180, 20, 800, 'core'),
  ('30934-4', 'BNP', 'pg/mL', NULL, 100, 0, 10000, 'cardio');

INSERT INTO facility_observation_catalogs (facility_id, catalog) VALUES
  ('fac_riverside', 'core'),
  ('fac_riverside', 'cardio'),
  ('fac_east', 'core'),
  ('fac_east', 'cardio'),
  ('fac_lakeside', 'core');

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  encounter_id TEXT REFERENCES encounters (id),
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  interpretation TEXT NOT NULL CHECK (interpretation IN ('normal', 'high', 'low')),
  threshold_text TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

INSERT INTO observations (
  id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version,
  display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id
) VALUES
  ('obs_elena_k_normal', 'org_harborlight', 'fac_riverside', 'pat_elena', 'enc_elena', '2823-3', 'http://loinc.org', '2.78', 'Potassium', 4.2, 'mmol/L', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-09-01T15:10:00Z', 'usr_amira'),
  ('obs_elena_k_high', 'org_harborlight', 'fac_riverside', 'pat_elena', NULL, '2823-3', 'http://loinc.org', '2.78', 'Potassium', 5.4, 'mmol/L', '2.2', 'facility-vitals-2026.10', 'high', 'above 5 mmol/L', '2026-10-01T15:00:00Z', 'usr_amira'),
  ('obs_elena_bnp', 'org_harborlight', 'fac_riverside', 'pat_elena', NULL, '30934-4', 'http://loinc.org', '2.78', 'BNP', 480, 'pg/mL', '2.2', 'facility-vitals-2026.10', 'high', 'above 100 pg/mL', '2026-10-01T15:05:00Z', 'usr_amira'),
  ('obs_elena_sbp', 'org_harborlight', 'fac_riverside', 'pat_elena', NULL, '8480-6', 'http://loinc.org', '2.78', 'Systolic blood pressure', 148, 'mmHg', '2.2', 'facility-vitals-2026.10', 'high', 'above 140 mmHg', '2026-10-01T15:10:00Z', 'usr_amira'),
  ('obs_mateo_spo2', 'org_harborlight', 'fac_riverside', 'pat_mateo', 'enc_mateo', '59408-5', 'http://loinc.org', '2.78', 'Oxygen saturation', 97, '%', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-07T18:10:00Z', 'usr_amira'),
  ('obs_helen_sbp', 'org_harborlight', 'fac_riverside', 'pat_helen', NULL, '8480-6', 'http://loinc.org', '2.78', 'Systolic blood pressure', 152, 'mmHg', '2.2', 'facility-vitals-2026.10', 'high', 'above 140 mmHg', '2026-10-07T14:00:00Z', 'usr_amira'),
  ('obs_helen_dbp', 'org_harborlight', 'fac_riverside', 'pat_helen', NULL, '8462-4', 'http://loinc.org', '2.78', 'Diastolic blood pressure', 94, 'mmHg', '2.2', 'facility-vitals-2026.10', 'high', 'above 90 mmHg', '2026-10-07T14:01:00Z', 'usr_amira');

UPDATE foundation_meta SET schema_version = 4 WHERE id = 1;
