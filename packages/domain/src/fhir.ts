import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { recordObservation } from "./chart";
import { get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  assertValidR4,
  capabilityStatement,
  loadAllergy,
  loadCondition,
  loadEncounter,
  loadMedication,
  loadObservation,
  loadPatient,
  searchAllergies,
  searchConditions,
  searchEncounters,
  searchMedications,
  searchObservations,
  searchPatients,
  searchset,
  type FhirResource,
} from "./fhir-map";
import { subscriptionResource, createObservationSubscription } from "./subscriptions";
import { resolveFacilityConcept, TERMINOLOGY } from "./terminology";
import { canReadChart } from "./session";

const READ_TYPES = new Set([
  "Patient",
  "Observation",
  "Condition",
  "AllergyIntolerance",
  "MedicationStatement",
  "Encounter",
  "Subscription",
]);

type IdemRow = { request_hash: string; response_json: string };

function assertFacility(ctx: SessionContext): asserts ctx is SessionContext & { facilityId: string } {
  if (!ctx.facilityId) throw new ForbiddenError();
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function guardRead(db: AppDatabase, ctx: SessionContext, type: string, id: string | null) {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "fhir.read", resourceType: type, resourceId: id, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
}

function asObject(value: unknown): FhirResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("invalid", "The body must be a JSON object.");
  return value as FhirResource;
}

function patientIdFromReference(reference: unknown) {
  const text = String(reference ?? "");
  const id = text.startsWith("Patient/") ? text.slice("Patient/".length) : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new ValidationError("invalid", "The subject must be a Patient on this server.");
  return id;
}

function codingList(resource: FhirResource) {
  const code = asObject(resource.code);
  if (!Array.isArray(code.coding)) throw new ValidationError("invalid", "The observation needs a LOINC coding.");
  return code.coding.map((item) => asObject(item));
}

export function fhirCapability() {
  const statement = capabilityStatement();
  assertValidR4(statement);
  return statement;
}

export function readFhirResource(db: AppDatabase, ctx: SessionContext, type: string, id: string): FhirResource | null {
  guardRead(db, ctx, type, id);
  if (!READ_TYPES.has(type)) throw new ValidationError("invalid", "That resource type is not published.");
  const facilityId = ctx.facilityId as string;
  let resource: FhirResource | undefined;
  if (type === "Patient") resource = loadPatient(db, ctx.organizationId, facilityId, id);
  if (type === "Observation") resource = loadObservation(db, ctx.organizationId, facilityId, id);
  if (type === "Condition") resource = loadCondition(db, ctx.organizationId, facilityId, id);
  if (type === "AllergyIntolerance") resource = loadAllergy(db, ctx.organizationId, facilityId, id);
  if (type === "MedicationStatement") resource = loadMedication(db, ctx.organizationId, facilityId, id);
  if (type === "Encounter") resource = loadEncounter(db, ctx.organizationId, facilityId, id);
  if (type === "Subscription") resource = subscriptionResource(db, ctx, id);
  if (!resource) {
    const elsewhere = resourceExists(db, type, id);
    writeAudit(db, ctx, { action: "fhir.read", resourceType: type, resourceId: id, outcome: elsewhere ? "denied" : "not_found" });
    return null;
  }
  assertValidR4(resource);
  writeAudit(db, ctx, { action: "fhir.read", resourceType: type, resourceId: id, outcome: "success" });
  return resource;
}

function resourceExists(db: AppDatabase, type: string, id: string) {
  const table =
    type === "Patient"
      ? "patients"
      : type === "Observation"
        ? "observations"
        : type === "Condition"
          ? "conditions"
          : type === "AllergyIntolerance"
            ? "allergies"
            : type === "MedicationStatement"
              ? "medications"
              : type === "Encounter"
                ? "encounters"
                : type === "Subscription"
                  ? "fhir_subscriptions"
                  : "";
  if (!table) return false;
  return Boolean(get<{ id: string }>(db, `SELECT id FROM ${table} WHERE id = ?`, id));
}

export function searchFhir(db: AppDatabase, ctx: SessionContext, type: string, query: { name?: string; patient?: string }) {
  guardRead(db, ctx, type, null);
  const facilityId = ctx.facilityId as string;
  let resources: FhirResource[] = [];
  if (type === "Patient") resources = searchPatients(db, ctx.organizationId, facilityId, query.name ?? "");
  else if (type === "Observation") resources = searchObservations(db, ctx.organizationId, facilityId, query.patient);
  else if (type === "Condition") resources = searchConditions(db, ctx.organizationId, facilityId, query.patient);
  else if (type === "AllergyIntolerance") resources = searchAllergies(db, ctx.organizationId, facilityId, query.patient);
  else if (type === "MedicationStatement") resources = searchMedications(db, ctx.organizationId, facilityId, query.patient);
  else if (type === "Encounter") resources = searchEncounters(db, ctx.organizationId, facilityId, query.patient);
  else throw new ValidationError("invalid", "That resource type is not published.");
  const bundle = searchset(resources);
  assertValidR4(bundle);
  writeAudit(db, ctx, { action: "fhir.search", resourceType: type, resourceId: null, outcome: "success" });
  return bundle;
}

export function prepareFhirObservation(db: AppDatabase, ctx: SessionContext, body: unknown, idempotencyKey: string) {
  assertKey(idempotencyKey);
  const resource = asObject(body);
  if (resource.resourceType !== "Observation") throw new ValidationError("invalid", "Only an Observation can be created here.");
  if (resource.id) throw new ValidationError("invalid", "The server assigns the observation id.");
  if (resource.status !== "final") throw new ValidationError("invalid", "Only a final observation can be stored.");
  if (resource.effectiveDateTime) throw new ValidationError("invalid", "The server assigns the effective time.");
  if (resource.interpretation) throw new ValidationError("invalid", "The server assigns the threshold flag.");
  const coding = codingList(resource).find((item) => item.system === TERMINOLOGY.loincUri);
  if (!coding || typeof coding.code !== "string") throw new ValidationError("invalid", "The observation needs a LOINC coding.");
  const quantity = asObject(resource.valueQuantity);
  if (typeof quantity.value !== "number" || !Number.isFinite(quantity.value)) {
    throw new ValidationError("invalid", "The observation needs a numeric value.");
  }
  if (quantity.system && quantity.system !== TERMINOLOGY.ucumUri) {
    throw new ValidationError("invalid", "The unit system must be UCUM.");
  }
  assertFacility(ctx);
  const entry = resolveFacilityConcept(db, ctx.facilityId, coding.code);
  if (!entry) throw new ValidationError("code", "That observation is not in this facility catalog.");
  const sentUnit = typeof quantity.code === "string" ? quantity.code : typeof quantity.unit === "string" ? quantity.unit : "";
  if (sentUnit && sentUnit !== entry.unit) throw new ValidationError("invalid", "The unit does not match the facility catalog.");
  const subject = asObject(resource.subject);
  return { patientId: patientIdFromReference(subject.reference), code: coding.code, value: quantity.value };
}

export function createFhirObservation(db: AppDatabase, ctx: SessionContext, body: unknown, idempotencyKey: string, observationId?: string) {
  const draft = prepareFhirObservation(db, ctx, body, idempotencyKey);
  const created = recordObservation(db, ctx, {
    patientId: draft.patientId,
    code: draft.code,
    value: draft.value,
    idempotencyKey,
    observationId,
  });
  const stored = readFhirResource(db, ctx, "Observation", created.id);
  if (!stored) throw new NotFoundError();
  return stored;
}

function readIdem<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<IdemRow>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) {
    throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  }
  return JSON.parse(row.response_json) as T;
}

export function startFhirExport(db: AppDatabase, ctx: SessionContext, idempotencyKey: string) {
  guardRead(db, ctx, "Bundle", null);
  assertKey(idempotencyKey);
  const hash = canonicalHash({ export: "facility" });
  return transaction(db, () => {
    const replay = readIdem<{ id: string }>(db, ctx.organizationId, idempotencyKey, hash);
    if (replay) return replay;
    const id = `exp_${randomUUID()}`;
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO export_jobs (id, organization_id, facility_id, actor_id, status, created_at) VALUES (?, ?, ?, ?, 'complete', ?)`,
      id,
      ctx.organizationId,
      ctx.facilityId,
      ctx.userId,
      now,
    );
    writeAudit(db, ctx, { action: "fhir.export", resourceType: "Bundle", resourceId: id, outcome: "success" });
    const created = { id };
    run(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      idempotencyKey,
      ctx.userId,
      hash,
      JSON.stringify(created),
      now,
    );
    return created;
  });
}

export function readFhirExport(db: AppDatabase, ctx: SessionContext, jobId: string) {
  guardRead(db, ctx, "Bundle", jobId);
  const job = get<{ id: string; organization_id: string; facility_id: string }>(db, `SELECT id, organization_id, facility_id FROM export_jobs WHERE id = ?`, jobId);
  if (!job || job.organization_id !== ctx.organizationId || job.facility_id !== ctx.facilityId) {
    writeAudit(db, ctx, {
      action: "fhir.export.read",
      resourceType: "Bundle",
      resourceId: jobId,
      outcome: job ? "denied" : "not_found",
    });
    throw new NotFoundError();
  }
  const facilityId = ctx.facilityId as string;
  const resources = [
    ...searchPatients(db, ctx.organizationId, facilityId, ""),
    ...searchObservations(db, ctx.organizationId, facilityId, undefined),
    ...searchConditions(db, ctx.organizationId, facilityId, undefined),
    ...searchAllergies(db, ctx.organizationId, facilityId, undefined),
    ...searchMedications(db, ctx.organizationId, facilityId, undefined),
    ...searchEncounters(db, ctx.organizationId, facilityId, undefined),
  ];
  for (const resource of resources) assertValidR4(resource);
  writeAudit(db, ctx, { action: "fhir.export.read", resourceType: "Bundle", resourceId: jobId, outcome: "success" });
  const ndjson = resources.map((resource) => JSON.stringify(resource)).join("\n");
  return { id: job.id, ndjson, lineCount: resources.length };
}

export function createFhirSubscription(db: AppDatabase, ctx: SessionContext, body: unknown, idempotencyKey: string) {
  const resource = asObject(body);
  if (resource.resourceType !== "Subscription") throw new ValidationError("invalid", "Only a Subscription can be created here.");
  if (resource.criteria !== "Observation") throw new ValidationError("invalid", "Only Observation subscriptions are published.");
  const channel = asObject(resource.channel);
  if (channel.type !== "rest-hook" || channel.endpoint !== "local-inbox") {
    throw new ValidationError("invalid", "Notifications stay in the local inbox.");
  }
  const created = createObservationSubscription(db, ctx, idempotencyKey);
  const stored = readFhirResource(db, ctx, "Subscription", created.id);
  if (!stored) throw new NotFoundError();
  return stored;
}
