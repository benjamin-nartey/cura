import type { AppDatabase } from "./db";
import { run, transaction } from "./db";
import { seedAgentRecords } from "./agents";
import { seedDocumentationRecords } from "./documentation";
import { seedLabRules } from "./lab";
import { seedCoordinationRecords } from "./coordination";
import { seedFacilityRecords } from "./facility";
import { seedPatientRecords } from "./portal";
import { seedRxRules } from "./rx";
import { seedGatewayRecords } from "./gateway";
import { seedTerminology, TERMINOLOGY } from "./terminology";

export const FIXTURES = {
  elena: "pat_elena",
  mateo: "pat_mateo",
  helen: "pat_helen",
  noor: "pat_noor",
  samir: "pat_samir",
  amira: "usr_amira",
  jordan: "usr_jordan",
  lea: "usr_lea",
  priya: "usr_priya",
  nabil: "usr_nabil",
  admin: "usr_admin",
  evan: "usr_evan",
  elenaPortal: "pac_elena",
  mateoPortal: "pac_mateo",
  obsPotassiumNormal: "obs_elena_k_normal",
  obsPotassiumHigh: "obs_elena_k_high",
  encounterElena: "enc_elena",
  encounterMateo: "enc_mateo",
};

export function seed(db: AppDatabase) {
  transaction(db, () => {
    const org = (id: string, name: string) => run(db, `INSERT INTO organizations (id, name) VALUES (?, ?)`, id, name);
    const fac = (id: string, orgId: string, name: string) =>
      run(db, `INSERT INTO facilities (id, organization_id, name, timezone) VALUES (?, ?, ?, 'UTC')`, id, orgId, name);
    const user = (id: string, orgId: string, facilityId: string | null, name: string, role: string) =>
      run(db, `INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES (?, ?, ?, ?, ?)`, id, orgId, facilityId, name, role);
    org("org_harborlight", "Harborlight Health");
    org("org_northwind", "Northwind Medical");
    run(db, `UPDATE organizations SET jurisdiction = 'local-synthetic'`);
    fac("fac_riverside", "org_harborlight", "Riverside Clinic");
    fac("fac_east", "org_harborlight", "East Annex");
    fac("fac_lakeside", "org_northwind", "Lakeside Hospital");
    user("usr_amira", "org_harborlight", "fac_riverside", "Amira Solano", "clinician");
    user("usr_jordan", "org_harborlight", "fac_riverside", "Jordan Hale", "nurse");
    user("usr_lea", "org_harborlight", "fac_east", "Lea Okonkwo", "clinician");
    user("usr_priya", "org_harborlight", null, "Priya Raman", "auditor");
    user("usr_nabil", "org_harborlight", null, "Nabil Rahman", "auditor");
    user("usr_admin", "org_harborlight", null, "Harborlight Admin", "admin");
    user("usr_evan", "org_northwind", "fac_lakeside", "Evan Cho", "clinician");
    run(
      db,
      `INSERT INTO enterprise_residency (organization_id, region, author_id, updated_at) VALUES ('org_harborlight', 'local-sqlite', 'usr_admin', '2026-10-08T00:00:00.000Z')`,
    );
    run(
      db,
      `INSERT INTO enterprise_residency (organization_id, region, author_id, updated_at) VALUES ('org_northwind', 'local-sqlite', 'usr_evan', '2026-10-08T00:00:00.000Z')`,
    );
    seedTerminology(db);

    const patient = (
      id: string,
      orgId: string,
      facilityId: string,
      mrn: string,
      given: string,
      family: string,
      birth: string,
      sex: string,
      author: string,
      recorded: string,
    ) =>
      run(
        db,
        `INSERT INTO patients (id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, confidentiality, retention_class, version, author_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'clinical-standard', 1, ?, ?)`,
        id,
        orgId,
        facilityId,
        mrn,
        given,
        family,
        birth,
        sex,
        author,
        recorded,
      );
    patient("pat_elena", "org_harborlight", "fac_riverside", "RIV-1001", "Elena", "Voss", "1959-03-12", "female", "usr_amira", "2024-02-01T00:00:00.000Z");
    patient("pat_mateo", "org_harborlight", "fac_riverside", "RIV-1002", "Mateo", "Ruiz", "1985-06-02", "male", "usr_amira", "2020-03-01T00:00:00.000Z");
    patient("pat_helen", "org_harborlight", "fac_riverside", "RIV-1003", "Helen", "Park", "1972-11-20", "female", "usr_amira", "2023-01-01T00:00:00.000Z");
    patient("pat_noor", "org_harborlight", "fac_east", "EAS-1001", "Noor", "Ellis", "1990-01-09", "female", "usr_lea", "2026-01-09T00:00:00.000Z");
    patient("pat_samir", "org_northwind", "fac_lakeside", "LAK-1001", "Samir", "Adeyemi", "1988-04-04", "male", "usr_evan", "2026-02-01T00:00:00.000Z");

    const condition = (id: string, orgId: string, facilityId: string, patientId: string, code: string, display: string, at: string, author: string) =>
      run(
        db,
        `INSERT INTO conditions (id, organization_id, facility_id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at, author_id)
         VALUES (?, ?, ?, ?, ?, 'http://hl7.org/fhir/sid/icd-10-cm', '${TERMINOLOGY.icdVersion}', ?, 'active', ?, ?)`,
        id,
        orgId,
        facilityId,
        patientId,
        code,
        display,
        at,
        author,
      );
    condition("con_elena_dm", "org_harborlight", "fac_riverside", "pat_elena", "E11.9", "Type 2 diabetes mellitus", "2024-02-01T00:00:00.000Z", "usr_amira");
    condition("con_elena_hf", "org_harborlight", "fac_riverside", "pat_elena", "I50.9", "Heart failure", "2025-11-01T00:00:00.000Z", "usr_amira");
    condition("con_mateo_asthma", "org_harborlight", "fac_riverside", "pat_mateo", "J45.909", "Asthma", "2020-03-01T00:00:00.000Z", "usr_amira");
    condition("con_helen_htn", "org_harborlight", "fac_riverside", "pat_helen", "I10", "Essential hypertension", "2023-01-01T00:00:00.000Z", "usr_amira");
    condition("con_noor", "org_harborlight", "fac_east", "pat_noor", "J30.2", "Seasonal allergic rhinitis", "2026-01-09T00:00:00.000Z", "usr_lea");
    condition("con_samir", "org_northwind", "fac_lakeside", "pat_samir", "M54.5", "Low back pain", "2026-02-01T00:00:00.000Z", "usr_evan");

    run(
      db,
      `INSERT INTO allergies (id, organization_id, facility_id, patient_id, display, reaction, criticality, recorded_at, author_id)
       VALUES ('all_elena', 'org_harborlight', 'fac_riverside', 'pat_elena', 'Penicillin', 'Rash', 'high', '2018-05-01T00:00:00.000Z', 'usr_amira')`,
    );
    run(
      db,
      `INSERT INTO medications (id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id)
       VALUES ('med_elena_furosemide', 'org_harborlight', 'fac_riverside', 'pat_elena', 'Furosemide', '40 mg daily', 'active', '2026-09-01T16:00:00.000Z', 'usr_amira')`,
    );
    run(
      db,
      `INSERT INTO medications (id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id)
       VALUES ('med_elena_metformin', 'org_harborlight', 'fac_riverside', 'pat_elena', 'Metformin', '500 mg twice daily', 'active', '2024-02-01T00:00:00.000Z', 'usr_amira')`,
    );
    run(
      db,
      `INSERT INTO medications (id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id)
       VALUES ('med_mateo', 'org_harborlight', 'fac_riverside', 'pat_mateo', 'Albuterol inhaler', '2 puffs as needed', 'active', '2020-03-01T00:00:00.000Z', 'usr_amira')`,
    );

    run(
      db,
      `INSERT INTO encounters (id, organization_id, facility_id, patient_id, status, class, reason, started_at, ended_at, author_id, version, recorded_at)
       VALUES ('enc_elena', 'org_harborlight', 'fac_riverside', 'pat_elena', 'finished', 'ambulatory', 'Diabetes follow-up', '2026-09-01T15:00:00.000Z', '2026-09-01T16:00:00.000Z', 'usr_amira', 2, '2026-09-01T15:00:00.000Z')`,
    );
    run(
      db,
      `INSERT INTO encounters (id, organization_id, facility_id, patient_id, status, class, reason, started_at, ended_at, author_id, version, recorded_at)
       VALUES ('enc_mateo', 'org_harborlight', 'fac_riverside', 'pat_mateo', 'in-progress', 'ambulatory', 'Wheeze since yesterday', '2026-10-07T18:00:00.000Z', NULL, 'usr_amira', 1, '2026-10-07T18:00:00.000Z')`,
    );
    run(
      db,
      `INSERT INTO encounters (id, organization_id, facility_id, patient_id, status, class, reason, started_at, ended_at, author_id, version, recorded_at)
       VALUES ('enc_helen', 'org_harborlight', 'fac_riverside', 'pat_helen', 'finished', 'ambulatory', 'Blood pressure follow-up', '2026-08-01T15:00:00.000Z', '2026-08-01T15:40:00.000Z', 'usr_amira', 2, '2026-08-01T15:00:00.000Z')`,
    );

    const obs = (
      id: string,
      patientId: string,
      encounterId: string | null,
      code: string,
      display: string,
      value: number,
      unit: string,
      interpretation: string,
      threshold: string,
      at: string,
    ) =>
      run(
        db,
        `INSERT INTO observations (id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id, recorded_at)
         VALUES (?, 'org_harborlight', 'fac_riverside', ?, ?, ?, 'http://loinc.org', '${TERMINOLOGY.loincVersion}', ?, ?, ?, '${TERMINOLOGY.ucumVersion}', '${TERMINOLOGY.bindingVersion}', ?, ?, ?, 'usr_amira', ?)`,
        id,
        patientId,
        encounterId,
        code,
        display,
        value,
        unit,
        interpretation,
        threshold,
        at,
        at,
      );
    obs("obs_elena_k_normal", "pat_elena", "enc_elena", "2823-3", "Potassium", 4.2, "mmol/L", "normal", "inside the configured bounds", "2026-09-01T15:10:00.000Z");
    obs("obs_elena_k_high", "pat_elena", null, "2823-3", "Potassium", 5.4, "mmol/L", "high", "above 5 mmol/L", "2026-10-01T15:00:00.000Z");
    obs("obs_elena_bnp", "pat_elena", null, "30934-4", "BNP", 480, "pg/mL", "high", "above 100 pg/mL", "2026-10-01T15:05:00.000Z");
    obs("obs_elena_sbp", "pat_elena", null, "8480-6", "Systolic blood pressure", 148, "mmHg", "high", "above 140 mmHg", "2026-10-01T15:10:00.000Z");
    obs("obs_mateo_spo2", "pat_mateo", "enc_mateo", "59408-5", "Oxygen saturation", 97, "%", "normal", "inside the configured bounds", "2026-10-07T18:10:00.000Z");
    obs("obs_helen_sbp", "pat_helen", null, "8480-6", "Systolic blood pressure", 152, "mmHg", "high", "above 140 mmHg", "2026-10-07T14:00:00.000Z");
    obs("obs_helen_dbp", "pat_helen", null, "8462-4", "Diastolic blood pressure", 94, "mmHg", "high", "above 90 mmHg", "2026-10-07T14:01:00.000Z");

    const appt = (id: string, patientId: string, reason: string, starts: string, ends: string) =>
      run(
        db,
        `INSERT INTO appointments (id, organization_id, facility_id, patient_id, status, reason, starts_at, ends_at)
         VALUES (?, 'org_harborlight', 'fac_riverside', ?, 'booked', ?, ?, ?)`,
        id,
        patientId,
        reason,
        starts,
        ends,
      );
    appt("apt_elena", "pat_elena", "Heart failure follow-up", "2026-10-08T13:20:00.000Z", "2026-10-08T13:40:00.000Z");
    appt("apt_helen", "pat_helen", "Blood pressure follow-up", "2026-10-08T15:00:00.000Z", "2026-10-08T15:20:00.000Z");
    seedGatewayRecords(db);
    seedAgentRecords(db);
    seedDocumentationRecords(db);
    seedLabRules(db);
    seedRxRules(db);
    seedCoordinationRecords(db);
    seedPatientRecords(db);
    seedFacilityRecords(db);
  });
}
