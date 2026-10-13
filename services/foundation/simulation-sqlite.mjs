import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const file = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "curasphere.sqlite");
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON");

const patients = [
  ["pat_jonah", "org_harborlight", "fac_riverside", "RIV-2001", "Jonah", "Adler", "1962-04-18", "male", "usr_amira", "2021-04-18T00:00:00.000Z"],
  ["pat_camille", "org_harborlight", "fac_riverside", "RIV-2002", "Camille", "Breton", "1985-09-03", "female", "usr_amira", "2019-09-03T00:00:00.000Z"],
  ["pat_owen", "org_harborlight", "fac_riverside", "RIV-2003", "Owen", "Brooks", "1968-01-22", "male", "usr_amira", "2022-01-22T00:00:00.000Z"],
  ["pat_sofia", "org_harborlight", "fac_riverside", "RIV-2004", "Sofia", "Mendes", "1993-07-14", "female", "usr_amira", "2024-07-14T00:00:00.000Z"],
  ["pat_walter", "org_harborlight", "fac_riverside", "RIV-2005", "Walter", "Chen", "1947-12-02", "male", "usr_amira", "2018-12-02T00:00:00.000Z"],
  ["pat_amina", "org_harborlight", "fac_riverside", "RIV-2006", "Amina", "Diallo", "1999-05-27", "female", "usr_amira", "2025-05-27T00:00:00.000Z"],
  ["pat_farah", "org_harborlight", "fac_east", "EAS-2001", "Farah", "Iqbal", "1974-08-19", "female", "usr_lea", "2023-08-19T00:00:00.000Z"],
  ["pat_luis", "org_harborlight", "fac_east", "EAS-2002", "Luis", "Ortega", "1980-02-11", "male", "usr_lea", "2024-02-11T00:00:00.000Z"],
  ["pat_grace", "org_northwind", "fac_lakeside", "LAK-2001", "Grace", "Holm", "1956-06-30", "female", "usr_evan", "2020-06-30T00:00:00.000Z"],
  ["pat_ben", "org_northwind", "fac_lakeside", "LAK-2002", "Ben", "Ibarra", "1990-10-08", "male", "usr_evan", "2022-10-08T00:00:00.000Z"],
];
const insertPatient = db.prepare(
  `INSERT OR IGNORE INTO patients (id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, confidentiality, retention_class, version, author_id, recorded_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'clinical-standard', 1, ?, ?)`,
);
for (const row of patients) insertPatient.run(...row);

const conditions = [
  ["con_jonah_htn", "org_harborlight", "fac_riverside", "pat_jonah", "I10", "Essential hypertension", "2021-04-18T00:00:00.000Z", "usr_amira"],
  ["con_camille_asthma", "org_harborlight", "fac_riverside", "pat_camille", "J45.909", "Asthma", "2019-09-03T00:00:00.000Z", "usr_amira"],
  ["con_owen_dm", "org_harborlight", "fac_riverside", "pat_owen", "E11.9", "Type 2 diabetes mellitus", "2022-01-22T00:00:00.000Z", "usr_amira"],
  ["con_sofia_rhinitis", "org_harborlight", "fac_riverside", "pat_sofia", "J30.2", "Seasonal allergic rhinitis", "2024-07-14T00:00:00.000Z", "usr_amira"],
  ["con_walter_hf", "org_harborlight", "fac_riverside", "pat_walter", "I50.9", "Heart failure", "2018-12-02T00:00:00.000Z", "usr_amira"],
  ["con_walter_htn", "org_harborlight", "fac_riverside", "pat_walter", "I10", "Essential hypertension", "2019-01-15T00:00:00.000Z", "usr_amira"],
  ["con_amina_back", "org_harborlight", "fac_riverside", "pat_amina", "M54.5", "Low back pain", "2025-05-27T00:00:00.000Z", "usr_amira"],
  ["con_farah_htn", "org_harborlight", "fac_east", "pat_farah", "I10", "Essential hypertension", "2023-08-19T00:00:00.000Z", "usr_lea"],
  ["con_luis_dm", "org_harborlight", "fac_east", "pat_luis", "E11.9", "Type 2 diabetes mellitus", "2024-02-11T00:00:00.000Z", "usr_lea"],
  ["con_grace_htn", "org_northwind", "fac_lakeside", "pat_grace", "I10", "Essential hypertension", "2020-06-30T00:00:00.000Z", "usr_evan"],
  ["con_ben_asthma", "org_northwind", "fac_lakeside", "pat_ben", "J45.909", "Asthma", "2022-10-08T00:00:00.000Z", "usr_evan"],
];
const insertCondition = db.prepare(
  `INSERT OR IGNORE INTO conditions (id, organization_id, facility_id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at, author_id)
   VALUES (?, ?, ?, ?, ?, 'http://hl7.org/fhir/sid/icd-10-cm', '2026', ?, 'active', ?, ?)`,
);
for (const row of conditions) insertCondition.run(...row);

const allergies = [
  ["all_camille", "org_harborlight", "fac_riverside", "pat_camille", "Aspirin", "Hives", "high", "2019-09-03T00:00:00.000Z", "usr_amira"],
  ["all_walter", "org_harborlight", "fac_riverside", "pat_walter", "Sulfa", "Rash", "low", "2018-12-02T00:00:00.000Z", "usr_amira"],
  ["all_luis", "org_harborlight", "fac_east", "pat_luis", "Peanuts", "Swelling", "high", "2024-02-11T00:00:00.000Z", "usr_lea"],
];
const insertAllergy = db.prepare(
  `INSERT OR IGNORE INTO allergies (id, organization_id, facility_id, patient_id, display, reaction, criticality, recorded_at, author_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
for (const row of allergies) insertAllergy.run(...row);

const medications = [
  ["med_jonah", "org_harborlight", "fac_riverside", "pat_jonah", "Lisinopril", "10 mg daily", "2021-04-18T00:00:00.000Z", "usr_amira"],
  ["med_camille", "org_harborlight", "fac_riverside", "pat_camille", "Albuterol inhaler", "2 puffs as needed", "2019-09-03T00:00:00.000Z", "usr_amira"],
  ["med_owen", "org_harborlight", "fac_riverside", "pat_owen", "Metformin", "1000 mg twice daily", "2022-01-22T00:00:00.000Z", "usr_amira"],
  ["med_sofia", "org_harborlight", "fac_riverside", "pat_sofia", "Loratadine", "10 mg daily", "2024-07-14T00:00:00.000Z", "usr_amira"],
  ["med_walter_furosemide", "org_harborlight", "fac_riverside", "pat_walter", "Furosemide", "20 mg daily", "2018-12-02T00:00:00.000Z", "usr_amira"],
  ["med_walter_lisinopril", "org_harborlight", "fac_riverside", "pat_walter", "Lisinopril", "5 mg daily", "2019-01-15T00:00:00.000Z", "usr_amira"],
  ["med_amina", "org_harborlight", "fac_riverside", "pat_amina", "Ibuprofen", "400 mg as needed", "2025-05-27T00:00:00.000Z", "usr_amira"],
  ["med_farah", "org_harborlight", "fac_east", "pat_farah", "Amlodipine", "5 mg daily", "2023-08-19T00:00:00.000Z", "usr_lea"],
  ["med_luis", "org_harborlight", "fac_east", "pat_luis", "Metformin", "500 mg twice daily", "2024-02-11T00:00:00.000Z", "usr_lea"],
  ["med_grace", "org_northwind", "fac_lakeside", "pat_grace", "Lisinopril", "20 mg daily", "2020-06-30T00:00:00.000Z", "usr_evan"],
  ["med_ben", "org_northwind", "fac_lakeside", "pat_ben", "Albuterol inhaler", "2 puffs as needed", "2022-10-08T00:00:00.000Z", "usr_evan"],
];
const insertMedication = db.prepare(
  `INSERT OR IGNORE INTO medications (id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id)
   VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
);
for (const row of medications) insertMedication.run(...row);

const appointments = [
  ["apt_jonah", "org_harborlight", "fac_riverside", "pat_jonah", "Blood pressure check", "2026-10-08T09:00:00.000Z", "2026-10-08T09:20:00.000Z"],
  ["apt_camille", "org_harborlight", "fac_riverside", "pat_camille", "Asthma follow-up", "2026-10-08T09:40:00.000Z", "2026-10-08T10:00:00.000Z"],
  ["apt_owen", "org_harborlight", "fac_riverside", "pat_owen", "Diabetes follow-up", "2026-10-08T10:20:00.000Z", "2026-10-08T10:40:00.000Z"],
  ["apt_sofia", "org_harborlight", "fac_riverside", "pat_sofia", "Allergy follow-up", "2026-10-08T11:00:00.000Z", "2026-10-08T11:20:00.000Z"],
  ["apt_walter", "org_harborlight", "fac_riverside", "pat_walter", "Heart failure follow-up", "2026-10-08T11:40:00.000Z", "2026-10-08T12:00:00.000Z"],
  ["apt_amina", "org_harborlight", "fac_riverside", "pat_amina", "Back pain follow-up", "2026-10-08T14:10:00.000Z", "2026-10-08T14:30:00.000Z"],
  ["apt_farah", "org_harborlight", "fac_east", "pat_farah", "Blood pressure check", "2026-10-08T10:00:00.000Z", "2026-10-08T10:20:00.000Z"],
  ["apt_luis", "org_harborlight", "fac_east", "pat_luis", "Diabetes follow-up", "2026-10-08T11:20:00.000Z", "2026-10-08T11:40:00.000Z"],
  ["apt_grace", "org_northwind", "fac_lakeside", "pat_grace", "Blood pressure check", "2026-10-08T09:30:00.000Z", "2026-10-08T09:50:00.000Z"],
  ["apt_ben", "org_northwind", "fac_lakeside", "pat_ben", "Asthma follow-up", "2026-10-08T13:00:00.000Z", "2026-10-08T13:20:00.000Z"],
];
const insertAppointment = db.prepare(
  `INSERT OR IGNORE INTO appointments (id, organization_id, facility_id, patient_id, status, reason, starts_at, ends_at)
   VALUES (?, ?, ?, ?, 'booked', ?, ?, ?)`,
);
for (const row of appointments) insertAppointment.run(...row);

const observations = [
  ["obs_jonah_sbp", "org_harborlight", "fac_riverside", "pat_jonah", "8480-6", "Systolic blood pressure", 136, "mmHg", "normal", "inside the configured bounds", "2026-10-08T09:05:00.000Z", "usr_amira"],
  ["obs_camille_spo2", "org_harborlight", "fac_riverside", "pat_camille", "59408-5", "Oxygen saturation", 96, "%", "normal", "inside the configured bounds", "2026-10-08T09:45:00.000Z", "usr_amira"],
  ["obs_owen_glucose", "org_harborlight", "fac_riverside", "pat_owen", "2345-7", "Glucose", 164, "mg/dL", "normal", "inside the configured bounds", "2026-10-08T10:25:00.000Z", "usr_amira"],
  ["obs_sofia_hr", "org_harborlight", "fac_riverside", "pat_sofia", "8867-4", "Heart rate", 78, "/min", "normal", "inside the configured bounds", "2026-10-08T11:05:00.000Z", "usr_amira"],
  ["obs_walter_bnp", "org_harborlight", "fac_riverside", "pat_walter", "30934-4", "BNP", 220, "pg/mL", "high", "above 100 pg/mL", "2026-10-08T11:45:00.000Z", "usr_amira"],
  ["obs_walter_sbp", "org_harborlight", "fac_riverside", "pat_walter", "8480-6", "Systolic blood pressure", 132, "mmHg", "normal", "inside the configured bounds", "2026-10-08T11:46:00.000Z", "usr_amira"],
  ["obs_amina_hr", "org_harborlight", "fac_riverside", "pat_amina", "8867-4", "Heart rate", 88, "/min", "normal", "inside the configured bounds", "2026-10-08T14:15:00.000Z", "usr_amira"],
  ["obs_farah_sbp", "org_harborlight", "fac_east", "pat_farah", "8480-6", "Systolic blood pressure", 146, "mmHg", "high", "above 140 mmHg", "2026-10-08T10:05:00.000Z", "usr_lea"],
  ["obs_luis_glucose", "org_harborlight", "fac_east", "pat_luis", "2345-7", "Glucose", 142, "mg/dL", "normal", "inside the configured bounds", "2026-10-08T11:25:00.000Z", "usr_lea"],
  ["obs_grace_sbp", "org_northwind", "fac_lakeside", "pat_grace", "8480-6", "Systolic blood pressure", 158, "mmHg", "high", "above 140 mmHg", "2026-10-08T09:35:00.000Z", "usr_evan"],
  ["obs_ben_spo2", "org_northwind", "fac_lakeside", "pat_ben", "59408-5", "Oxygen saturation", 98, "%", "normal", "inside the configured bounds", "2026-10-08T13:05:00.000Z", "usr_evan"],
];
const insertObservation = db.prepare(
  `INSERT OR IGNORE INTO observations (id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id, recorded_at)
   VALUES (?, ?, ?, ?, NULL, ?, 'http://loinc.org', '2.78', ?, ?, ?, '2.2', 'facility-vitals-2026.10', ?, ?, ?, ?, ?)`,
);
for (const row of observations) insertObservation.run(...row, row[10]);

const count = db.prepare("SELECT COUNT(*) AS c FROM patients WHERE id LIKE 'pat_%' AND id NOT IN ('pat_elena', 'pat_mateo', 'pat_helen', 'pat_noor', 'pat_samir')").get();
console.log(`sqlite simulation patients ${count.c}`);
