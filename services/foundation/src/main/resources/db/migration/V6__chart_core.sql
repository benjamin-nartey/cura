CREATE TABLE conditions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  clinical_status TEXT NOT NULL CHECK (clinical_status IN ('active')),
  recorded_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

CREATE TABLE allergies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  display TEXT NOT NULL,
  reaction TEXT NOT NULL,
  criticality TEXT NOT NULL CHECK (criticality IN ('low', 'high')),
  recorded_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

CREATE TABLE medications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  display TEXT NOT NULL,
  dose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active')),
  recorded_at TIMESTAMPTZ NOT NULL,
  author_id TEXT NOT NULL REFERENCES users (id)
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  patient_id TEXT NOT NULL REFERENCES patients (id),
  status TEXT NOT NULL CHECK (status IN ('booked')),
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL
);

INSERT INTO patients (
  id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, author_id, recorded_at
) VALUES
  ('pat_jonah', 'org_harborlight', 'fac_riverside', 'RIV-2001', 'Jonah', 'Adler', '1962-04-18', 'male', 'usr_amira', '2021-04-18T00:00:00Z'),
  ('pat_camille', 'org_harborlight', 'fac_riverside', 'RIV-2002', 'Camille', 'Breton', '1985-09-03', 'female', 'usr_amira', '2019-09-03T00:00:00Z'),
  ('pat_owen', 'org_harborlight', 'fac_riverside', 'RIV-2003', 'Owen', 'Brooks', '1968-01-22', 'male', 'usr_amira', '2022-01-22T00:00:00Z'),
  ('pat_sofia', 'org_harborlight', 'fac_riverside', 'RIV-2004', 'Sofia', 'Mendes', '1993-07-14', 'female', 'usr_amira', '2024-07-14T00:00:00Z'),
  ('pat_walter', 'org_harborlight', 'fac_riverside', 'RIV-2005', 'Walter', 'Chen', '1947-12-02', 'male', 'usr_amira', '2018-12-02T00:00:00Z'),
  ('pat_amina', 'org_harborlight', 'fac_riverside', 'RIV-2006', 'Amina', 'Diallo', '1999-05-27', 'female', 'usr_amira', '2025-05-27T00:00:00Z'),
  ('pat_farah', 'org_harborlight', 'fac_east', 'EAS-2001', 'Farah', 'Iqbal', '1974-08-19', 'female', 'usr_lea', '2023-08-19T00:00:00Z'),
  ('pat_luis', 'org_harborlight', 'fac_east', 'EAS-2002', 'Luis', 'Ortega', '1980-02-11', 'male', 'usr_lea', '2024-02-11T00:00:00Z'),
  ('pat_grace', 'org_northwind', 'fac_lakeside', 'LAK-2001', 'Grace', 'Holm', '1956-06-30', 'female', 'usr_evan', '2020-06-30T00:00:00Z'),
  ('pat_ben', 'org_northwind', 'fac_lakeside', 'LAK-2002', 'Ben', 'Ibarra', '1990-10-08', 'male', 'usr_evan', '2022-10-08T00:00:00Z');

INSERT INTO conditions (
  id, organization_id, facility_id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at, author_id
) VALUES
  ('con_elena_dm', 'org_harborlight', 'fac_riverside', 'pat_elena', 'E11.9', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Type 2 diabetes mellitus', 'active', '2024-02-01T00:00:00Z', 'usr_amira'),
  ('con_elena_hf', 'org_harborlight', 'fac_riverside', 'pat_elena', 'I50.9', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Heart failure', 'active', '2025-11-01T00:00:00Z', 'usr_amira'),
  ('con_mateo_asthma', 'org_harborlight', 'fac_riverside', 'pat_mateo', 'J45.909', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Asthma', 'active', '2020-03-01T00:00:00Z', 'usr_amira'),
  ('con_helen_htn', 'org_harborlight', 'fac_riverside', 'pat_helen', 'I10', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Essential hypertension', 'active', '2023-01-01T00:00:00Z', 'usr_amira'),
  ('con_noor', 'org_harborlight', 'fac_east', 'pat_noor', 'J30.2', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Seasonal allergic rhinitis', 'active', '2026-01-09T00:00:00Z', 'usr_lea'),
  ('con_samir', 'org_northwind', 'fac_lakeside', 'pat_samir', 'M54.5', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Low back pain', 'active', '2026-02-01T00:00:00Z', 'usr_evan'),
  ('con_jonah_htn', 'org_harborlight', 'fac_riverside', 'pat_jonah', 'I10', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Essential hypertension', 'active', '2021-04-18T00:00:00Z', 'usr_amira'),
  ('con_camille_asthma', 'org_harborlight', 'fac_riverside', 'pat_camille', 'J45.909', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Asthma', 'active', '2019-09-03T00:00:00Z', 'usr_amira'),
  ('con_owen_dm', 'org_harborlight', 'fac_riverside', 'pat_owen', 'E11.9', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Type 2 diabetes mellitus', 'active', '2022-01-22T00:00:00Z', 'usr_amira'),
  ('con_sofia_rhinitis', 'org_harborlight', 'fac_riverside', 'pat_sofia', 'J30.2', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Seasonal allergic rhinitis', 'active', '2024-07-14T00:00:00Z', 'usr_amira'),
  ('con_walter_hf', 'org_harborlight', 'fac_riverside', 'pat_walter', 'I50.9', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Heart failure', 'active', '2018-12-02T00:00:00Z', 'usr_amira'),
  ('con_walter_htn', 'org_harborlight', 'fac_riverside', 'pat_walter', 'I10', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Essential hypertension', 'active', '2019-01-15T00:00:00Z', 'usr_amira'),
  ('con_amina_back', 'org_harborlight', 'fac_riverside', 'pat_amina', 'M54.5', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Low back pain', 'active', '2025-05-27T00:00:00Z', 'usr_amira'),
  ('con_farah_htn', 'org_harborlight', 'fac_east', 'pat_farah', 'I10', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Essential hypertension', 'active', '2023-08-19T00:00:00Z', 'usr_lea'),
  ('con_luis_dm', 'org_harborlight', 'fac_east', 'pat_luis', 'E11.9', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Type 2 diabetes mellitus', 'active', '2024-02-11T00:00:00Z', 'usr_lea'),
  ('con_grace_htn', 'org_northwind', 'fac_lakeside', 'pat_grace', 'I10', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Essential hypertension', 'active', '2020-06-30T00:00:00Z', 'usr_evan'),
  ('con_ben_asthma', 'org_northwind', 'fac_lakeside', 'pat_ben', 'J45.909', 'http://hl7.org/fhir/sid/icd-10-cm', '2026', 'Asthma', 'active', '2022-10-08T00:00:00Z', 'usr_evan');

INSERT INTO allergies (
  id, organization_id, facility_id, patient_id, display, reaction, criticality, recorded_at, author_id
) VALUES
  ('all_elena', 'org_harborlight', 'fac_riverside', 'pat_elena', 'Penicillin', 'Rash', 'high', '2018-05-01T00:00:00Z', 'usr_amira'),
  ('all_camille', 'org_harborlight', 'fac_riverside', 'pat_camille', 'Aspirin', 'Hives', 'high', '2019-09-03T00:00:00Z', 'usr_amira'),
  ('all_walter', 'org_harborlight', 'fac_riverside', 'pat_walter', 'Sulfa', 'Rash', 'low', '2018-12-02T00:00:00Z', 'usr_amira'),
  ('all_luis', 'org_harborlight', 'fac_east', 'pat_luis', 'Peanuts', 'Swelling', 'high', '2024-02-11T00:00:00Z', 'usr_lea');

INSERT INTO medications (
  id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id
) VALUES
  ('med_elena_furosemide', 'org_harborlight', 'fac_riverside', 'pat_elena', 'Furosemide', '40 mg daily', 'active', '2026-09-01T16:00:00Z', 'usr_amira'),
  ('med_elena_metformin', 'org_harborlight', 'fac_riverside', 'pat_elena', 'Metformin', '500 mg twice daily', 'active', '2024-02-01T00:00:00Z', 'usr_amira'),
  ('med_mateo', 'org_harborlight', 'fac_riverside', 'pat_mateo', 'Albuterol inhaler', '2 puffs as needed', 'active', '2020-03-01T00:00:00Z', 'usr_amira'),
  ('med_jonah', 'org_harborlight', 'fac_riverside', 'pat_jonah', 'Lisinopril', '10 mg daily', 'active', '2021-04-18T00:00:00Z', 'usr_amira'),
  ('med_camille', 'org_harborlight', 'fac_riverside', 'pat_camille', 'Albuterol inhaler', '2 puffs as needed', 'active', '2019-09-03T00:00:00Z', 'usr_amira'),
  ('med_owen', 'org_harborlight', 'fac_riverside', 'pat_owen', 'Metformin', '1000 mg twice daily', 'active', '2022-01-22T00:00:00Z', 'usr_amira'),
  ('med_sofia', 'org_harborlight', 'fac_riverside', 'pat_sofia', 'Loratadine', '10 mg daily', 'active', '2024-07-14T00:00:00Z', 'usr_amira'),
  ('med_walter_furosemide', 'org_harborlight', 'fac_riverside', 'pat_walter', 'Furosemide', '20 mg daily', 'active', '2018-12-02T00:00:00Z', 'usr_amira'),
  ('med_walter_lisinopril', 'org_harborlight', 'fac_riverside', 'pat_walter', 'Lisinopril', '5 mg daily', 'active', '2019-01-15T00:00:00Z', 'usr_amira'),
  ('med_amina', 'org_harborlight', 'fac_riverside', 'pat_amina', 'Ibuprofen', '400 mg as needed', 'active', '2025-05-27T00:00:00Z', 'usr_amira'),
  ('med_farah', 'org_harborlight', 'fac_east', 'pat_farah', 'Amlodipine', '5 mg daily', 'active', '2023-08-19T00:00:00Z', 'usr_lea'),
  ('med_luis', 'org_harborlight', 'fac_east', 'pat_luis', 'Metformin', '500 mg twice daily', 'active', '2024-02-11T00:00:00Z', 'usr_lea'),
  ('med_grace', 'org_northwind', 'fac_lakeside', 'pat_grace', 'Lisinopril', '20 mg daily', 'active', '2020-06-30T00:00:00Z', 'usr_evan'),
  ('med_ben', 'org_northwind', 'fac_lakeside', 'pat_ben', 'Albuterol inhaler', '2 puffs as needed', 'active', '2022-10-08T00:00:00Z', 'usr_evan');

INSERT INTO appointments (
  id, organization_id, facility_id, patient_id, status, reason, starts_at, ends_at
) VALUES
  ('apt_elena', 'org_harborlight', 'fac_riverside', 'pat_elena', 'booked', 'Heart failure follow-up', '2026-10-08T13:20:00Z', '2026-10-08T13:40:00Z'),
  ('apt_helen', 'org_harborlight', 'fac_riverside', 'pat_helen', 'booked', 'Blood pressure follow-up', '2026-10-08T15:00:00Z', '2026-10-08T15:20:00Z'),
  ('apt_jonah', 'org_harborlight', 'fac_riverside', 'pat_jonah', 'booked', 'Blood pressure check', '2026-10-08T09:00:00Z', '2026-10-08T09:20:00Z'),
  ('apt_camille', 'org_harborlight', 'fac_riverside', 'pat_camille', 'booked', 'Asthma follow-up', '2026-10-08T09:40:00Z', '2026-10-08T10:00:00Z'),
  ('apt_owen', 'org_harborlight', 'fac_riverside', 'pat_owen', 'booked', 'Diabetes follow-up', '2026-10-08T10:20:00Z', '2026-10-08T10:40:00Z'),
  ('apt_sofia', 'org_harborlight', 'fac_riverside', 'pat_sofia', 'booked', 'Allergy follow-up', '2026-10-08T11:00:00Z', '2026-10-08T11:20:00Z'),
  ('apt_walter', 'org_harborlight', 'fac_riverside', 'pat_walter', 'booked', 'Heart failure follow-up', '2026-10-08T11:40:00Z', '2026-10-08T12:00:00Z'),
  ('apt_amina', 'org_harborlight', 'fac_riverside', 'pat_amina', 'booked', 'Back pain follow-up', '2026-10-08T14:10:00Z', '2026-10-08T14:30:00Z'),
  ('apt_farah', 'org_harborlight', 'fac_east', 'pat_farah', 'booked', 'Blood pressure check', '2026-10-08T10:00:00Z', '2026-10-08T10:20:00Z'),
  ('apt_luis', 'org_harborlight', 'fac_east', 'pat_luis', 'booked', 'Diabetes follow-up', '2026-10-08T11:20:00Z', '2026-10-08T11:40:00Z'),
  ('apt_grace', 'org_northwind', 'fac_lakeside', 'pat_grace', 'booked', 'Blood pressure check', '2026-10-08T09:30:00Z', '2026-10-08T09:50:00Z'),
  ('apt_ben', 'org_northwind', 'fac_lakeside', 'pat_ben', 'booked', 'Asthma follow-up', '2026-10-08T13:00:00Z', '2026-10-08T13:20:00Z');

INSERT INTO observations (
  id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version,
  display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id
) VALUES
  ('obs_jonah_sbp', 'org_harborlight', 'fac_riverside', 'pat_jonah', NULL, '8480-6', 'http://loinc.org', '2.78', 'Systolic blood pressure', 136, 'mmHg', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T09:05:00Z', 'usr_amira'),
  ('obs_camille_spo2', 'org_harborlight', 'fac_riverside', 'pat_camille', NULL, '59408-5', 'http://loinc.org', '2.78', 'Oxygen saturation', 96, '%', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T09:45:00Z', 'usr_amira'),
  ('obs_owen_glucose', 'org_harborlight', 'fac_riverside', 'pat_owen', NULL, '2345-7', 'http://loinc.org', '2.78', 'Glucose', 164, 'mg/dL', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T10:25:00Z', 'usr_amira'),
  ('obs_sofia_hr', 'org_harborlight', 'fac_riverside', 'pat_sofia', NULL, '8867-4', 'http://loinc.org', '2.78', 'Heart rate', 78, '/min', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T11:05:00Z', 'usr_amira'),
  ('obs_walter_bnp', 'org_harborlight', 'fac_riverside', 'pat_walter', NULL, '30934-4', 'http://loinc.org', '2.78', 'BNP', 220, 'pg/mL', '2.2', 'facility-vitals-2026.10', 'high', 'above 100 pg/mL', '2026-10-08T11:45:00Z', 'usr_amira'),
  ('obs_walter_sbp', 'org_harborlight', 'fac_riverside', 'pat_walter', NULL, '8480-6', 'http://loinc.org', '2.78', 'Systolic blood pressure', 132, 'mmHg', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T11:46:00Z', 'usr_amira'),
  ('obs_amina_hr', 'org_harborlight', 'fac_riverside', 'pat_amina', NULL, '8867-4', 'http://loinc.org', '2.78', 'Heart rate', 88, '/min', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T14:15:00Z', 'usr_amira'),
  ('obs_farah_sbp', 'org_harborlight', 'fac_east', 'pat_farah', NULL, '8480-6', 'http://loinc.org', '2.78', 'Systolic blood pressure', 146, 'mmHg', '2.2', 'facility-vitals-2026.10', 'high', 'above 140 mmHg', '2026-10-08T10:05:00Z', 'usr_lea'),
  ('obs_luis_glucose', 'org_harborlight', 'fac_east', 'pat_luis', NULL, '2345-7', 'http://loinc.org', '2.78', 'Glucose', 142, 'mg/dL', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T11:25:00Z', 'usr_lea'),
  ('obs_grace_sbp', 'org_northwind', 'fac_lakeside', 'pat_grace', NULL, '8480-6', 'http://loinc.org', '2.78', 'Systolic blood pressure', 158, 'mmHg', '2.2', 'facility-vitals-2026.10', 'high', 'above 140 mmHg', '2026-10-08T09:35:00Z', 'usr_evan'),
  ('obs_ben_spo2', 'org_northwind', 'fac_lakeside', 'pat_ben', NULL, '59408-5', 'http://loinc.org', '2.78', 'Oxygen saturation', 98, '%', '2.2', 'facility-vitals-2026.10', 'normal', 'inside the configured bounds', '2026-10-08T13:05:00Z', 'usr_evan');

UPDATE foundation_meta SET schema_version = 5 WHERE id = 1;
