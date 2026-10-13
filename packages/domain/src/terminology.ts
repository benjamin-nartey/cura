import type { FacilityObservationChoice, SessionContext } from "@curasphere/contracts";
import { get, run, transaction, type AppDatabase } from "./db";
import { ForbiddenError } from "./errors";
import { canReadChart } from "./session";

export const TERMINOLOGY = {
  loincVersion: "2.78",
  icdVersion: "2026",
  ucumVersion: "2.2",
  bindingVersion: "facility-vitals-2026.10",
  loincUri: "http://loinc.org",
  icdUri: "http://hl7.org/fhir/sid/icd-10-cm",
  ucumUri: "http://unitsofmeasure.org",
};

type ObservationPin = {
  code: string;
  display: string;
  unit: string;
  low?: number;
  high?: number;
  min: number;
  max: number;
  catalog: "core" | "cardio" | "none";
};

const OBSERVATION_PINS: ObservationPin[] = [
  { code: "8480-6", display: "Systolic blood pressure", unit: "mmHg", low: 90, high: 140, min: 40, max: 300, catalog: "core" },
  { code: "8462-4", display: "Diastolic blood pressure", unit: "mmHg", low: 60, high: 90, min: 20, max: 200, catalog: "core" },
  { code: "8867-4", display: "Heart rate", unit: "/min", low: 50, high: 100, min: 20, max: 250, catalog: "core" },
  { code: "8310-5", display: "Body temperature", unit: "Cel", low: 35, high: 38, min: 30, max: 45, catalog: "core" },
  { code: "59408-5", display: "Oxygen saturation", unit: "%", low: 94, min: 50, max: 100, catalog: "core" },
  { code: "2823-3", display: "Potassium", unit: "mmol/L", low: 3.5, high: 5, min: 1, max: 9, catalog: "core" },
  { code: "2345-7", display: "Glucose", unit: "mg/dL", low: 70, high: 180, min: 20, max: 800, catalog: "core" },
  { code: "30934-4", display: "BNP", unit: "pg/mL", high: 100, min: 0, max: 10000, catalog: "cardio" },
  { code: "29463-7", display: "Body weight", unit: "kg", min: 1, max: 400, catalog: "none" },
];

const ICD_PINS: Array<[string, string]> = [
  ["E11.9", "Type 2 diabetes mellitus"],
  ["I50.9", "Heart failure"],
  ["J45.909", "Asthma"],
  ["I10", "Essential hypertension"],
  ["J30.2", "Seasonal allergic rhinitis"],
  ["M54.5", "Low back pain"],
];

export type ResolvedConcept = {
  code: string;
  display: string;
  unit: string;
  system: string;
  codeSystemVersion: string;
  unitSystemVersion: string;
  bindingVersion: string;
  low: number | null;
  high: number | null;
  min: number;
  max: number;
};

export function codeSystemLabel(uri: string) {
  if (uri === TERMINOLOGY.loincUri) return "LOINC";
  if (uri === TERMINOLOGY.icdUri) return "ICD-10-CM";
  if (uri === TERMINOLOGY.ucumUri) return "UCUM";
  return uri;
}

export function seedTerminology(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM code_systems");
  if ((existing?.c ?? 0) > 0) return;
  run(db, `INSERT INTO code_systems (id, uri, name, version) VALUES ('cs_loinc', ?, 'LOINC', ?)`, TERMINOLOGY.loincUri, TERMINOLOGY.loincVersion);
  run(db, `INSERT INTO code_systems (id, uri, name, version) VALUES ('cs_icd', ?, 'ICD-10-CM', ?)`, TERMINOLOGY.icdUri, TERMINOLOGY.icdVersion);
  run(db, `INSERT INTO code_systems (id, uri, name, version) VALUES ('cs_ucum', ?, 'UCUM', ?)`, TERMINOLOGY.ucumUri, TERMINOLOGY.ucumVersion);
  run(db, `INSERT INTO value_sets (id, name, version) VALUES ('vs_core', 'Facility vitals', ?)`, TERMINOLOGY.bindingVersion);
  run(db, `INSERT INTO value_sets (id, name, version) VALUES ('vs_cardio', 'Facility cardiac markers', ?)`, TERMINOLOGY.bindingVersion);
  for (const item of OBSERVATION_PINS) {
    const id = `loinc_${item.code.replaceAll("-", "_")}`;
    run(
      db,
      `INSERT INTO concepts (id, code_system_id, code, display, unit_code, low_bound, high_bound, entry_min, entry_max)
       VALUES (?, 'cs_loinc', ?, ?, ?, ?, ?, ?, ?)`,
      id,
      item.code,
      item.display,
      item.unit,
      item.low ?? null,
      item.high ?? null,
      item.min,
      item.max,
    );
    if (item.catalog === "core") {
      run(db, `INSERT INTO value_set_members (value_set_id, concept_id) VALUES ('vs_core', ?)`, id);
    }
    if (item.catalog === "cardio") {
      run(db, `INSERT INTO value_set_members (value_set_id, concept_id) VALUES ('vs_cardio', ?)`, id);
    }
  }
  for (const [code, display] of ICD_PINS) {
    run(
      db,
      `INSERT INTO concepts (id, code_system_id, code, display, unit_code, low_bound, high_bound, entry_min, entry_max)
       VALUES (?, 'cs_icd', ?, ?, NULL, NULL, NULL, NULL, NULL)`,
      `icd_${code.replaceAll(".", "_")}`,
      code,
      display,
    );
  }
  const facilities = [
    ["fac_riverside", "vs_core"],
    ["fac_riverside", "vs_cardio"],
    ["fac_east", "vs_core"],
    ["fac_east", "vs_cardio"],
    ["fac_lakeside", "vs_core"],
  ] as const;
  for (const [facilityId, valueSetId] of facilities) {
    const facility = get<{ id: string }>(db, "SELECT id FROM facilities WHERE id = ?", facilityId);
    if (!facility) continue;
    run(db, `INSERT INTO facility_catalogs (facility_id, value_set_id) VALUES (?, ?)`, facilityId, valueSetId);
  }
}

export function ensureTerminology(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM code_systems");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedTerminology(db));
}

export function resolveFacilityConcept(db: AppDatabase, facilityId: string, code: string): ResolvedConcept | undefined {
  const row = get<{
    code: string;
    display: string;
    unit_code: string;
    uri: string;
    version: string;
    low_bound: number | null;
    high_bound: number | null;
    entry_min: number;
    entry_max: number;
  }>(
    db,
    `SELECT c.code, c.display, c.unit_code, s.uri, s.version, c.low_bound, c.high_bound, c.entry_min, c.entry_max
     FROM concepts c
     JOIN code_systems s ON s.id = c.code_system_id
     JOIN value_set_members m ON m.concept_id = c.id
     JOIN facility_catalogs f ON f.value_set_id = m.value_set_id
     WHERE c.code = ? AND f.facility_id = ? AND s.id = 'cs_loinc'`,
    code,
    facilityId,
  );
  if (!row || row.entry_min === null || row.entry_max === null) return undefined;
  return {
    code: row.code,
    display: row.display,
    unit: row.unit_code,
    system: row.uri,
    codeSystemVersion: row.version,
    unitSystemVersion: TERMINOLOGY.ucumVersion,
    bindingVersion: TERMINOLOGY.bindingVersion,
    low: row.low_bound,
    high: row.high_bound,
    min: row.entry_min,
    max: row.entry_max,
  };
}

export function listFacilityObservationCatalog(db: AppDatabase, ctx: SessionContext): FacilityObservationChoice[] {
  if (!canReadChart(ctx) || !ctx.facilityId) throw new ForbiddenError();
  return listCatalog(db, ctx.facilityId);
}

function listCatalog(db: AppDatabase, facilityId: string): FacilityObservationChoice[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.code, c.display, c.unit_code
       FROM concepts c
       JOIN value_set_members m ON m.concept_id = c.id
       JOIN facility_catalogs f ON f.value_set_id = m.value_set_id
       WHERE f.facility_id = ? AND c.code_system_id = 'cs_loinc'
       ORDER BY c.display`,
    )
    .all(facilityId) as Array<{ code: string; display: string; unit_code: string }>;
  return rows.map((row) => ({ code: row.code, display: row.display, unit: row.unit_code }));
}
