import { TERMINOLOGY } from "./terminology";
import type { AppDatabase } from "./db";
import { all, get } from "./db";

export const FHIR_VERSION = "4.0.1";
export const LOCAL_INBOX = "local-inbox";

const VITAL_CODES = new Set(["8480-6", "8462-4", "8867-4", "8310-5", "59408-5", "29463-7"]);

export type FhirResource = Record<string, unknown>;

type PatientRow = {
  id: string;
  mrn: string;
  given_name: string;
  family_name: string;
  birth_date: string;
  sex: string;
  version: number;
  recorded_at: string;
};

type ObservationRow = {
  id: string;
  patient_id: string;
  code: string;
  code_system: string;
  code_system_version: string;
  display: string;
  value: number;
  unit: string;
  unit_system_version: string;
  binding_version: string;
  interpretation: string;
  effective_at: string;
};

type ConditionRow = {
  id: string;
  patient_id: string;
  code: string;
  code_system: string;
  code_system_version: string;
  display: string;
  clinical_status: string;
  recorded_at: string;
};

type AllergyRow = {
  id: string;
  patient_id: string;
  display: string;
  reaction: string;
  criticality: string;
  recorded_at: string;
};

type MedicationRow = {
  id: string;
  patient_id: string;
  display: string;
  dose: string;
  status: string;
  recorded_at: string;
};

type EncounterRow = {
  id: string;
  patient_id: string;
  status: string;
  class_code: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  version: number;
};

function fail(path: string): never {
  throw new Error(`FHIR resource failed structural check at ${path}`);
}

function asRecord(value: unknown, path: string): FhirResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path);
  return value as FhirResource;
}

function first(value: unknown, path: string): FhirResource {
  if (!Array.isArray(value) || value.length < 1) fail(path);
  return asRecord(value[0], path);
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string" || value.length < 1) fail(path);
}

export function assertValidR4(resource: FhirResource): void {
  const type = resource.resourceType;
  if (type === "Patient") {
    requireString(resource.id, "Patient.id");
    const name = first(resource.name, "Patient.name");
    requireString(name.family, "Patient.name.family");
    if (!Array.isArray(name.given) || typeof name.given[0] !== "string") fail("Patient.name.given");
    if (!["male", "female", "other", "unknown"].includes(String(resource.gender))) fail("Patient.gender");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(resource.birthDate))) fail("Patient.birthDate");
    const identifier = first(resource.identifier, "Patient.identifier");
    requireString(identifier.value, "Patient.identifier.value");
    return;
  }
  if (type === "Observation") {
    requireString(resource.id, "Observation.id");
    if (resource.status !== "final") fail("Observation.status");
    const coding = first(asRecord(resource.code, "Observation.code").coding, "Observation.code.coding");
    if (coding.system !== TERMINOLOGY.loincUri) fail("Observation.code.coding.system");
    requireString(coding.code, "Observation.code.coding.code");
    requireString(coding.version, "Observation.code.coding.version");
    const quantity = asRecord(resource.valueQuantity, "Observation.valueQuantity");
    if (typeof quantity.value !== "number" || !Number.isFinite(quantity.value)) fail("Observation.valueQuantity.value");
    if (quantity.system !== TERMINOLOGY.ucumUri) fail("Observation.valueQuantity.system");
    requireString(quantity.code, "Observation.valueQuantity.code");
    const subject = asRecord(resource.subject, "Observation.subject");
    if (!String(subject.reference).startsWith("Patient/")) fail("Observation.subject");
    const extension = first(resource.extension, "Observation.extension");
    if (extension.url !== "urn:curasphere:binding") fail("Observation.extension");
    return;
  }
  if (type === "Condition") {
    requireString(resource.id, "Condition.id");
    const clinical = first(asRecord(resource.clinicalStatus, "Condition.clinicalStatus").coding, "Condition.clinicalStatus.coding");
    requireString(clinical.code, "Condition.clinicalStatus.coding.code");
    const coding = first(asRecord(resource.code, "Condition.code").coding, "Condition.code.coding");
    if (coding.system !== TERMINOLOGY.icdUri) fail("Condition.code.coding.system");
    requireString(coding.version, "Condition.code.coding.version");
    if (!String(asRecord(resource.subject, "Condition.subject").reference).startsWith("Patient/")) fail("Condition.subject");
    return;
  }
  if (type === "AllergyIntolerance") {
    requireString(resource.id, "AllergyIntolerance.id");
    requireString(asRecord(resource.code, "AllergyIntolerance.code").text, "AllergyIntolerance.code.text");
    if (!String(asRecord(resource.patient, "AllergyIntolerance.patient").reference).startsWith("Patient/")) fail("AllergyIntolerance.patient");
    if (!["low", "high", "unable-to-assess"].includes(String(resource.criticality))) fail("AllergyIntolerance.criticality");
    return;
  }
  if (type === "MedicationStatement") {
    requireString(resource.id, "MedicationStatement.id");
    if (!["active", "completed", "stopped", "on-hold", "unknown", "intended", "entered-in-error", "not-taken"].includes(String(resource.status))) {
      fail("MedicationStatement.status");
    }
    requireString(asRecord(resource.medicationCodeableConcept, "MedicationStatement.medication").text, "MedicationStatement.medication.text");
    if (!String(asRecord(resource.subject, "MedicationStatement.subject").reference).startsWith("Patient/")) fail("MedicationStatement.subject");
    return;
  }
  if (type === "Encounter") {
    requireString(resource.id, "Encounter.id");
    if (!["planned", "arrived", "triaged", "in-progress", "onleave", "finished", "cancelled"].includes(String(resource.status))) {
      fail("Encounter.status");
    }
    requireString(asRecord(resource.class, "Encounter.class").code, "Encounter.class.code");
    if (!String(asRecord(resource.subject, "Encounter.subject").reference).startsWith("Patient/")) fail("Encounter.subject");
    return;
  }
  if (type === "Subscription") {
    requireString(resource.id, "Subscription.id");
    if (resource.status !== "active") fail("Subscription.status");
    if (resource.criteria !== "Observation") fail("Subscription.criteria");
    const channel = asRecord(resource.channel, "Subscription.channel");
    if (channel.type !== "rest-hook" || channel.endpoint !== LOCAL_INBOX) fail("Subscription.channel");
    return;
  }
  if (type === "CapabilityStatement") {
    if (resource.fhirVersion !== FHIR_VERSION) fail("CapabilityStatement.fhirVersion");
    const rest = first(resource.rest, "CapabilityStatement.rest");
    if (rest.mode !== "server") fail("CapabilityStatement.rest.mode");
    const security = asRecord(rest.security, "CapabilityStatement.rest.security");
    if (Array.isArray(security.service) && security.service.length > 0) fail("CapabilityStatement.rest.security.service");
    return;
  }
  if (type === "Bundle") {
    if (resource.type !== "searchset" && resource.type !== "history") fail("Bundle.type");
    if (!Array.isArray(resource.entry)) fail("Bundle.entry");
    for (const entry of resource.entry) {
      assertValidR4(asRecord(asRecord(entry, "Bundle.entry").resource, "Bundle.entry.resource"));
    }
    return;
  }
  fail("resourceType");
}

function subject(patientId: string) {
  return { reference: `Patient/${patientId}` };
}

function interpretationCode(value: string) {
  if (value === "high") return "H";
  if (value === "low") return "L";
  return "N";
}

function category(code: string) {
  return VITAL_CODES.has(code) ? "vital-signs" : "laboratory";
}

export function patientResource(row: PatientRow): FhirResource {
  return {
    resourceType: "Patient",
    id: row.id,
    meta: { versionId: String(row.version), lastUpdated: row.recorded_at },
    identifier: [{ system: "urn:curasphere:mrn", value: row.mrn }],
    name: [{ use: "official", family: row.family_name, given: [row.given_name] }],
    gender: row.sex,
    birthDate: row.birth_date,
  };
}

export function observationResource(row: ObservationRow): FhirResource {
  return {
    resourceType: "Observation",
    id: row.id,
    meta: { versionId: "1", lastUpdated: row.effective_at },
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: category(row.code),
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: row.code_system,
          version: row.code_system_version,
          code: row.code,
          display: row.display,
        },
      ],
      text: row.display,
    },
    subject: subject(row.patient_id),
    effectiveDateTime: row.effective_at,
    valueQuantity: {
      value: row.value,
      unit: row.unit,
      system: TERMINOLOGY.ucumUri,
      code: row.unit,
    },
    interpretation: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            code: interpretationCode(row.interpretation),
          },
        ],
      },
    ],
    extension: [{ url: "urn:curasphere:binding", valueString: `${row.binding_version} UCUM ${row.unit_system_version}` }],
  };
}

function conditionResource(row: ConditionRow): FhirResource {
  return {
    resourceType: "Condition",
    id: row.id,
    clinicalStatus: {
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: row.clinical_status }],
    },
    code: {
      coding: [
        {
          system: row.code_system,
          version: row.code_system_version,
          code: row.code,
          display: row.display,
        },
      ],
      text: row.display,
    },
    subject: subject(row.patient_id),
    recordedDate: row.recorded_at.slice(0, 10),
  };
}

function allergyResource(row: AllergyRow): FhirResource {
  const criticality = row.criticality === "high" || row.criticality === "low" ? row.criticality : "unable-to-assess";
  return {
    resourceType: "AllergyIntolerance",
    id: row.id,
    clinicalStatus: {
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }],
    },
    criticality,
    code: { text: row.display },
    patient: subject(row.patient_id),
    recordedDate: row.recorded_at.slice(0, 10),
    reaction: [{ manifestation: [{ text: row.reaction }] }],
  };
}

function medicationResource(row: MedicationRow): FhirResource {
  const allowed = new Set(["active", "completed", "stopped", "on-hold", "unknown", "intended", "entered-in-error", "not-taken"]);
  return {
    resourceType: "MedicationStatement",
    id: row.id,
    status: allowed.has(row.status) ? row.status : "unknown",
    medicationCodeableConcept: { text: row.display },
    subject: subject(row.patient_id),
    effectiveDateTime: row.recorded_at,
    dosage: [{ text: row.dose }],
  };
}

function encounterClass(value: string) {
  if (value === "ambulatory") return "AMB";
  return "AMB";
}

function encounterResource(row: EncounterRow): FhirResource {
  return {
    resourceType: "Encounter",
    id: row.id,
    meta: { versionId: String(row.version) },
    status: row.status,
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: encounterClass(row.class_code) },
    subject: subject(row.patient_id),
    period: { start: row.started_at, ...(row.ended_at ? { end: row.ended_at } : {}) },
    reasonCode: [{ text: row.reason }],
  };
}

const SCOPE = `organization_id = ? AND facility_id = ?`;

export function loadPatient(db: AppDatabase, organizationId: string, facilityId: string, id: string) {
  const row = get<PatientRow>(
    db,
    `SELECT id, mrn, given_name, family_name, birth_date, sex, version, recorded_at FROM patients WHERE id = ? AND ${SCOPE}`,
    id,
    organizationId,
    facilityId,
  );
  return row ? patientResource(row) : undefined;
}

export function loadObservation(db: AppDatabase, organizationId: string, facilityId: string, id: string) {
  const row = get<ObservationRow>(
    db,
    `SELECT id, patient_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, effective_at
     FROM observations WHERE id = ? AND ${SCOPE}`,
    id,
    organizationId,
    facilityId,
  );
  return row ? observationResource(row) : undefined;
}

export function searchPatients(db: AppDatabase, organizationId: string, facilityId: string, name: string) {
  const q = name.trim().toLowerCase().replace(/[%_]/g, "");
  const like = `%${q}%`;
  const rows = all<PatientRow>(
    db,
    `SELECT id, mrn, given_name, family_name, birth_date, sex, version, recorded_at FROM patients
     WHERE ${SCOPE} AND (? = '' OR lower(given_name) LIKE ? OR lower(family_name) LIKE ? OR lower(mrn) LIKE ?)
     ORDER BY family_name, given_name LIMIT 200`,
    organizationId,
    facilityId,
    q,
    like,
    like,
    like,
  );
  return rows.map(patientResource);
}

function patientFilter(reference: string | undefined) {
  if (!reference) return "";
  const id = reference.startsWith("Patient/") ? reference.slice("Patient/".length) : reference;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return "\u0000";
  return id;
}

export function searchObservations(db: AppDatabase, organizationId: string, facilityId: string, patient: string | undefined) {
  const patientId = patientFilter(patient);
  const rows = all<ObservationRow>(
    db,
    `SELECT id, patient_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, effective_at
     FROM observations WHERE ${SCOPE} AND (? = '' OR patient_id = ?) ORDER BY effective_at DESC LIMIT 200`,
    organizationId,
    facilityId,
    patientId,
    patientId,
  );
  return rows.map(observationResource);
}

export function searchConditions(db: AppDatabase, organizationId: string, facilityId: string, patient: string | undefined) {
  const patientId = patientFilter(patient);
  return all<ConditionRow>(
    db,
    `SELECT id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at
     FROM conditions WHERE ${SCOPE} AND (? = '' OR patient_id = ?) ORDER BY recorded_at LIMIT 200`,
    organizationId,
    facilityId,
    patientId,
    patientId,
  ).map(conditionResource);
}

export function searchAllergies(db: AppDatabase, organizationId: string, facilityId: string, patient: string | undefined) {
  const patientId = patientFilter(patient);
  return all<AllergyRow>(
    db,
    `SELECT id, patient_id, display, reaction, criticality, recorded_at FROM allergies
     WHERE ${SCOPE} AND (? = '' OR patient_id = ?) ORDER BY recorded_at LIMIT 200`,
    organizationId,
    facilityId,
    patientId,
    patientId,
  ).map(allergyResource);
}

export function searchMedications(db: AppDatabase, organizationId: string, facilityId: string, patient: string | undefined) {
  const patientId = patientFilter(patient);
  return all<MedicationRow>(
    db,
    `SELECT id, patient_id, display, dose, status, recorded_at FROM medications
     WHERE ${SCOPE} AND (? = '' OR patient_id = ?) ORDER BY recorded_at LIMIT 200`,
    organizationId,
    facilityId,
    patientId,
    patientId,
  ).map(medicationResource);
}

export function searchEncounters(db: AppDatabase, organizationId: string, facilityId: string, patient: string | undefined) {
  const patientId = patientFilter(patient);
  return all<EncounterRow>(
    db,
    `SELECT id, patient_id, status, "class" AS class_code, reason, started_at, ended_at, version FROM encounters
     WHERE ${SCOPE} AND (? = '' OR patient_id = ?) ORDER BY started_at DESC LIMIT 200`,
    organizationId,
    facilityId,
    patientId,
    patientId,
  ).map(encounterResource);
}

export function loadCondition(db: AppDatabase, organizationId: string, facilityId: string, id: string) {
  const row = get<ConditionRow>(
    db,
    `SELECT id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at
     FROM conditions WHERE id = ? AND ${SCOPE}`,
    id,
    organizationId,
    facilityId,
  );
  return row ? conditionResource(row) : undefined;
}

export function loadAllergy(db: AppDatabase, organizationId: string, facilityId: string, id: string) {
  const row = get<AllergyRow>(
    db,
    `SELECT id, patient_id, display, reaction, criticality, recorded_at FROM allergies WHERE id = ? AND ${SCOPE}`,
    id,
    organizationId,
    facilityId,
  );
  return row ? allergyResource(row) : undefined;
}

export function loadMedication(db: AppDatabase, organizationId: string, facilityId: string, id: string) {
  const row = get<MedicationRow>(
    db,
    `SELECT id, patient_id, display, dose, status, recorded_at FROM medications WHERE id = ? AND ${SCOPE}`,
    id,
    organizationId,
    facilityId,
  );
  return row ? medicationResource(row) : undefined;
}

export function loadEncounter(db: AppDatabase, organizationId: string, facilityId: string, id: string) {
  const row = get<EncounterRow>(
    db,
    `SELECT id, patient_id, status, "class" AS class_code, reason, started_at, ended_at, version FROM encounters WHERE id = ? AND ${SCOPE}`,
    id,
    organizationId,
    facilityId,
  );
  return row ? encounterResource(row) : undefined;
}

export function searchset(resources: FhirResource[]): FhirResource {
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: resources.length,
    entry: resources.map((resource) => ({ resource })),
  };
}

export function historyBundle(resource: FhirResource): FhirResource {
  return { resourceType: "Bundle", type: "history", entry: [{ resource }] };
}

export function capabilityStatement(): FhirResource {
  const readSearch = (type: string) => ({
    type,
    interaction: [{ code: "read" }, { code: "search-type" }],
    searchParam: [{ name: "patient", type: "reference" }],
  });
  return {
    resourceType: "CapabilityStatement",
    id: "curasphere-local",
    status: "active",
    date: "2026-10-08",
    kind: "instance",
    fhirVersion: FHIR_VERSION,
    format: ["json"],
    implementation: {
      description: "Local R4 projection of one facility chart. R5 is not served. SMART on FHIR bearer tokens are not accepted.",
    },
    rest: [
      {
        mode: "server",
        security: {
          description: "Requests use the local directory session cookie. SMART on FHIR is not implemented.",
        },
        resource: [
          {
            type: "Patient",
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [{ name: "name", type: "string" }],
          },
          {
            type: "Observation",
            interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }],
            searchParam: [{ name: "patient", type: "reference" }],
          },
          readSearch("Condition"),
          readSearch("AllergyIntolerance"),
          readSearch("MedicationStatement"),
          readSearch("Encounter"),
          {
            type: "Subscription",
            interaction: [{ code: "read" }, { code: "create" }],
          },
        ],
        operation: [
          {
            name: "export",
            definition: "urn:curasphere:operation-export",
            documentation:
              "Facility-scoped NDJSON generated from source rows when the job is read. Outbound webhooks and the HL7 Bulk Data file protocol are not implemented.",
          },
        ],
      },
    ],
  };
}
