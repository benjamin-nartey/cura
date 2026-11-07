import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { authorize } from "./authorization";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";

export type BillingActor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };

const CHARGE_NEXT: Record<string, string[]> = {
  draft: ["recorded", "voided"],
  recorded: ["reviewed", "voided"],
  reviewed: ["finalized-local", "voided"],
  "finalized-local": ["voided"],
  voided: [],
};

const CATALOG = [
  {
    id: "cat_gh_consultation",
    organizationId: "org_demo_gh",
    facilityId: "fac_gh_accra",
    code: "syn-consultation",
    display: "Synthetic outpatient consultation",
    category: "consultation",
    currency: "GHS",
    minorUnits: 2,
    unitPriceMinor: 15000,
    effectiveOn: "2026-01-01",
    expiresOn: null as string | null,
  },
  {
    id: "cat_gh_follow_up",
    organizationId: "org_demo_gh",
    facilityId: "fac_gh_accra",
    code: "syn-follow-up-charge",
    display: "Synthetic follow-up consultation",
    category: "consultation",
    currency: "GHS",
    minorUnits: 2,
    unitPriceMinor: 8000,
    effectiveOn: "2026-01-01",
    expiresOn: null as string | null,
  },
];

export function listBillingCatalog(db: AppDatabase, actor: BillingActor) {
  gate(db, actor, "billing.catalog.read");
  const rows = all<{
    id: string;
    code: string;
    display: string;
    category: string;
    currency: string;
    minor_units: number;
    unit_price_minor: number;
    version: number;
    status: string;
  }>(
    db,
    `SELECT id, code, display, category, currency, minor_units, unit_price_minor, version, status
     FROM billing_catalog WHERE organization_id = ? AND (facility_id IS NULL OR facility_id = ?) AND status = 'active'
     ORDER BY code`,
    actor.organizationId,
    actor.facilityId,
  );
  audit(db, actor, "billing.catalog.read", "BillingCatalog", actor.facilityId ?? actor.organizationId);
  return {
    items: rows,
    note: "Synthetic catalog prices only. Not a national tariff and not an invoice.",
  };
}

export function createCharge(
  db: AppDatabase,
  actor: BillingActor,
  input: {
    patientId: string;
    encounterId: string;
    catalogId: string;
    quantity: number;
    idempotencyKey: string;
  },
) {
  gate(db, actor, "billing.charge.create");
  assertKey(input.idempotencyKey);
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) throw new ValidationError("range", "That quantity is not valid.");
  assertPatient(db, actor, input.patientId);
  assertEncounter(db, actor, input.encounterId, input.patientId);
  const catalog = catalogRow(db, actor, input.catalogId);
  const amount = multiplyMinor(catalog.unit_price_minor, input.quantity);
  const hash = JSON.stringify(["create-charge", input.patientId, input.encounterId, input.catalogId, input.quantity]);
  const prior = readCommand<{ id: string; version: number; status: string; totalMinor: number; currency: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) {
    chargeRow(db, actor, prior.id);
    return { ...prior, idempotent: true };
  }
  const id = newId("chg_");
  const itemId = newId("cit_");
  const now = new Date().toISOString();
  const response = { id, version: 1, status: "recorded", totalMinor: amount, currency: catalog.currency };
  try {
    transaction(db, () => {
      run(
        db,
        `INSERT INTO billing_charges (id, organization_id, facility_id, patient_id, encounter_id, source, status, currency, total_minor, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'manual', 'recorded', ?, ?, ?, ?, 1, ?, ?, ?)`,
        id,
        actor.organizationId,
        actor.facilityId,
        input.patientId,
        input.encounterId,
        catalog.currency,
        amount,
        now,
        actor.userId,
        actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
        now,
        now,
      );
      run(
        db,
        `INSERT INTO billing_charge_items (id, charge_id, organization_id, catalog_id, catalog_version, code, display, quantity, unit_price_minor, amount_minor, currency, status, recorded_at, recorded_by, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recorded', ?, ?, 1)`,
        itemId,
        id,
        actor.organizationId,
        catalog.id,
        catalog.version,
        catalog.code,
        catalog.display,
        input.quantity,
        catalog.unit_price_minor,
        amount,
        catalog.currency,
        now,
        actor.userId,
      );
      remember(db, actor, "charge", id, 1, null, input.encounterId, null, { status: "recorded", totalMinor: amount, currency: catalog.currency, itemId, catalogId: catalog.id, catalogVersion: catalog.version }, now);
      run(db, `INSERT INTO billing_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
      countMetric(db, actor, "billing.charge.created");
      audit(db, actor, "billing.charge.create", "BillingCharge", id);
    });
  } catch (error) {
    const stored = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
    if (stored) return { ...stored, idempotent: true };
    throw error;
  }
  const stored = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
  return stored ? { ...stored, idempotent: false } : { ...response, idempotent: false };
}

export function reviewCharge(db: AppDatabase, actor: BillingActor, id: string, input: { expectedVersion: number; idempotencyKey: string }) {
  return transition(db, actor, id, "reviewed", "billing.charge.review", input.expectedVersion, input.idempotencyKey, "review");
}

export function finalizeCharge(db: AppDatabase, actor: BillingActor, id: string, input: { expectedVersion: number; idempotencyKey: string }) {
  const result = transition(db, actor, id, "finalized-local", "billing.charge.review", input.expectedVersion, input.idempotencyKey, "finalize");
  return { ...result, note: "Local finalization only. No invoice was issued and no payment is due." };
}

export function voidCharge(db: AppDatabase, actor: BillingActor, id: string, input: { expectedVersion: number; reason: string; idempotencyKey: string }) {
  gate(db, actor, "billing.charge.void");
  assertKey(input.idempotencyKey);
  if (input.reason !== "entered-in-error" && input.reason !== "no-longer-needed") throw new ValidationError("invalid", "A void reason is required.");
  const row = chargeRow(db, actor, id);
  const hash = JSON.stringify(["void", id, input.expectedVersion, input.reason]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  move(row.status, "voided");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: "voided" };
  return transaction(db, () => {
    const replay = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
    if (replay) return { ...replay, idempotent: true };
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion !== row.version) throw new ConflictError("conflict", "The record changed. Review the current version.");
    const changed = run(db, `UPDATE billing_charges SET status = 'voided', version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    run(db, `UPDATE billing_charge_items SET status = 'voided', version = version + 1 WHERE charge_id = ? AND status != 'voided'`, id);
    remember(db, actor, "charge", id, row.version + 1, row.version, row.encounter_id, input.reason, { status: "voided", totalMinor: row.total_minor, currency: row.currency }, now);
    run(db, `INSERT INTO billing_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, actor, "billing.charge.voided");
    audit(db, actor, "billing.charge.void", "BillingCharge", id);
    return { ...response, idempotent: false };
  });
}

export function adjustCharge(
  db: AppDatabase,
  actor: BillingActor,
  id: string,
  input: { expectedVersion: number; itemId: string; amountMinor: number; reason: string; idempotencyKey: string },
) {
  gate(db, actor, "billing.charge.adjust");
  assertKey(input.idempotencyKey);
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0 || input.amountMinor > 10_000_000) throw new ValidationError("range", "That adjustment amount is not valid.");
  if (input.reason !== "price-correction" && input.reason !== "quantity-correction") throw new ValidationError("invalid", "An adjustment reason is required.");
  const row = chargeRow(db, actor, id);
  const hash = JSON.stringify(["adjust", id, input.expectedVersion, input.itemId, input.amountMinor, input.reason]);
  const prior = readCommand<{ id: string; version: number; status: string; totalMinor: number }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  if (row.status !== "recorded" && row.status !== "reviewed") throw new ConflictError("conflict", "That charge cannot be adjusted.");
  const item = get<{ id: string; charge_id: string; amount_minor: number; version: number; status: string }>(db, `SELECT id, charge_id, amount_minor, version, status FROM billing_charge_items WHERE id = ?`, input.itemId);
  if (!item || item.charge_id !== id || item.status === "voided") throw new NotFoundError("That charge item is not available.");
  const delta = input.amountMinor - item.amount_minor;
  const nextTotal = row.total_minor + delta;
  if (nextTotal < 0) throw new ValidationError("range", "That total would be negative.");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: row.status, totalMinor: nextTotal };
  const adjustmentId = newId("adj_");
  return transaction(db, () => {
    const replay = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
    if (replay) return { ...replay, idempotent: true };
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion !== row.version) throw new ConflictError("conflict", "The record changed. Review the current version.");
    const changed = run(db, `UPDATE billing_charges SET total_minor = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, nextTotal, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    run(db, `UPDATE billing_charge_items SET amount_minor = ?, version = version + 1 WHERE id = ? AND version = ?`, input.amountMinor, input.itemId, item.version);
    run(
      db,
      `INSERT INTO billing_adjustments (id, organization_id, charge_id, item_id, adjustment_type, amount_minor, prior_amount_minor, reason, recorded_at, recorded_by, prior_version, resulting_version)
       VALUES (?, ?, ?, ?, 'amount', ?, ?, ?, ?, ?, ?, ?)`,
      adjustmentId,
      actor.organizationId,
      id,
      input.itemId,
      input.amountMinor,
      item.amount_minor,
      input.reason,
      now,
      actor.userId,
      row.version,
      row.version + 1,
    );
    remember(db, actor, "charge", id, row.version + 1, row.version, row.encounter_id, input.reason, { status: row.status, totalMinor: nextTotal, currency: row.currency, priorTotal: row.total_minor, itemId: input.itemId }, now);
    run(db, `INSERT INTO billing_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, actor, "billing.charge.adjusted");
    audit(db, actor, "billing.charge.adjust", "BillingCharge", id);
    return { ...response, idempotent: false };
  });
}

export function readCharge(db: AppDatabase, actor: BillingActor, id: string) {
  gate(db, actor, "billing.charge.read");
  const row = chargeRow(db, actor, id);
  const items = all<{ id: string; catalog_id: string; catalog_version: number; code: string; display: string; quantity: number; unit_price_minor: number; amount_minor: number; currency: string; status: string; version: number }>(
    db,
    `SELECT id, catalog_id, catalog_version, code, display, quantity, unit_price_minor, amount_minor, currency, status, version FROM billing_charge_items WHERE charge_id = ? ORDER BY recorded_at`,
    id,
  );
  audit(db, actor, "billing.charge.read", "BillingCharge", id);
  return { ...row, items, note: "Synthetic charge. No payment was collected." };
}

export function chargeStatus(db: AppDatabase, actor: BillingActor, patientId: string) {
  gate(db, actor, "billing.charge.status");
  assertPatient(db, actor, patientId);
  const rows = all<{ id: string; status: string; encounter_id: string }>(
    db,
    `SELECT id, status, encounter_id FROM billing_charges WHERE organization_id = ? AND facility_id = ? AND patient_id = ? AND status != 'voided' ORDER BY created_at DESC`,
    actor.organizationId,
    actor.facilityId,
    patientId,
  );
  audit(db, actor, "billing.charge.status", "BillingQueue", patientId);
  return { counts: { open: rows.filter((row) => row.status !== "finalized-local").length, finalized: rows.filter((row) => row.status === "finalized-local").length }, charges: rows.map((row) => ({ id: row.id, status: row.status, encounterId: row.encounter_id })) };
}

export function listCharges(db: AppDatabase, actor: BillingActor, patientId?: string) {
  gate(db, actor, "billing.charge.read");
  if (patientId) assertPatient(db, actor, patientId);
  const rows = patientId
    ? all<{ id: string; patient_id: string; encounter_id: string; status: string; currency: string; total_minor: number; version: number; created_at: string }>(
        db,
        `SELECT id, patient_id, encounter_id, status, currency, total_minor, version, created_at FROM billing_charges WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at DESC`,
        actor.organizationId,
        actor.facilityId,
        patientId,
      )
    : all<{ id: string; patient_id: string; encounter_id: string; status: string; currency: string; total_minor: number; version: number; created_at: string }>(
        db,
        `SELECT id, patient_id, encounter_id, status, currency, total_minor, version, created_at FROM billing_charges WHERE organization_id = ? AND facility_id = ? ORDER BY created_at DESC`,
        actor.organizationId,
        actor.facilityId,
      );
  audit(db, actor, "billing.charge.read", "BillingQueue", patientId ?? actor.facilityId!);
  return rows;
}

export function encounterBillingSummary(db: AppDatabase, actor: BillingActor, encounterId: string) {
  gate(db, actor, "billing.charge.read");
  const encounter = get<{ patient_id: string; organization_id: string; facility_id: string }>(db, `SELECT patient_id, organization_id, facility_id FROM visit_encounters WHERE id = ?`, encounterId);
  if (!encounter || encounter.organization_id !== actor.organizationId || encounter.facility_id !== actor.facilityId) throw new NotFoundError("That encounter is not available.");
  const rows = all<{ id: string; status: string; currency: string; total_minor: number; version: number }>(
    db,
    `SELECT id, status, currency, total_minor, version FROM billing_charges WHERE organization_id = ? AND encounter_id = ? ORDER BY created_at`,
    actor.organizationId,
    encounterId,
  );
  audit(db, actor, "billing.charge.read", "BillingQueue", encounterId);
  return { encounterId, patientId: encounter.patient_id, charges: rows, note: "Synthetic totals only. No settlement." };
}

export function chargeHistory(db: AppDatabase, actor: BillingActor, id: string) {
  gate(db, actor, "billing.history.read");
  chargeRow(db, actor, id);
  const rows = all<{ version: number; prior_version: number | null; actor_id: string; reason: string | null; snapshot_json: string; recorded_at: string; amended_at: string | null }>(
    db,
    `SELECT version, prior_version, actor_id, reason, snapshot_json, recorded_at, amended_at FROM billing_versions WHERE organization_id = ? AND record_kind = 'charge' AND record_id = ? ORDER BY version`,
    actor.organizationId,
    id,
  ).map((row) => ({
    version: row.version,
    priorVersion: row.prior_version,
    actorId: row.actor_id,
    reason: row.reason,
    recordedAt: row.recorded_at,
    amendedAt: row.amended_at,
    snapshot: JSON.parse(row.snapshot_json) as Record<string, unknown>,
  }));
  audit(db, actor, "billing.history.read", "BillingCharge", id);
  return rows;
}

export function transmitCharge(db: AppDatabase, actor: BillingActor) {
  gate(db, actor, "billing.charge.read");
  countMetric(db, actor, "billing.transmit.denied");
  throw new ForbiddenError("forbidden", "Charge transmission and payment collection are disabled.");
}

export function billingSnapshot(db: AppDatabase, actor: BillingActor, input: { traceId?: string } = {}) {
  gate(db, actor, "billing.charge.read");
  const trace = (input.traceId ?? "none").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const count = (name: string) => get<{ value: number }>(db, `SELECT value FROM billing_metrics WHERE name = ?`, `${actor.organizationId}:${actor.facilityId}:${name}`)?.value ?? 0;
  return { created: count("billing.charge.created"), adjusted: count("billing.charge.adjusted"), voided: count("billing.charge.voided"), transmitted: 0, transmissionDenied: count("billing.transmit.denied"), trace };
}

export function setBillingDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `UPDATE billing_controls SET value = ? WHERE name = 'dependency'`, value);
}

export function seedBillingPrimitives(db: AppDatabase) {
  run(db, `INSERT INTO billing_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
  for (const item of CATALOG) {
    run(
      db,
      `INSERT INTO billing_catalog (id, organization_id, facility_id, code, display, category, currency, minor_units, unit_price_minor, effective_on, expires_on, status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')
       ON CONFLICT(id) DO NOTHING`,
      item.id,
      item.organizationId,
      item.facilityId,
      item.code,
      item.display,
      item.category,
      item.currency,
      item.minorUnits,
      item.unitPriceMinor,
      item.effectiveOn,
      item.expiresOn,
    );
  }
  run(
    db,
    `INSERT OR IGNORE INTO retention_policies (
      id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit,
      expiry_action, approval_state, status, version, effective_at, created_at, updated_at
    ) VALUES ('pol_syn_gh_billing', 'org_demo_gh', NULL, 'SYNTHETIC_GH', 'billing', 'synthetic', 'record-created', NULL, NULL, 'retain', 'pending_policy_approval', 'active', 1, '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')`,
  );
  const exists = get(db, `SELECT id FROM users WHERE id = 'usr_gh_billing'`);
  if (!exists) {
    run(db, `INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_gh_billing', 'org_demo_gh', 'fac_gh_accra', 'Aba Mensah', 'admin')`);
  }
  run(
    db,
    `INSERT INTO organization_memberships (id, organization_id, user_id, status, version)
     VALUES ('om_org_demo_gh_usr_gh_billing', 'org_demo_gh', 'usr_gh_billing', 'active', 1)
     ON CONFLICT(organization_id, user_id) DO NOTHING`,
  );
  run(
    db,
    `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
     VALUES ('fm_fac_gh_accra_usr_gh_billing', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_billing', 'billing-officer', 'active', 1)
     ON CONFLICT(facility_id, user_id) DO NOTHING`,
  );
}

export const BILLING_ROLLBACK = `
DROP TABLE IF EXISTS billing_controls;
DROP TABLE IF EXISTS billing_metrics;
DROP TABLE IF EXISTS billing_commands;
DROP TABLE IF EXISTS billing_versions;
DROP TABLE IF EXISTS billing_adjustments;
DROP TABLE IF EXISTS billing_charge_items;
DROP TABLE IF EXISTS billing_charges;
DROP TABLE IF EXISTS billing_catalog;
DELETE FROM schema_migrations WHERE version = 42;
DELETE FROM schema_migrations WHERE version = 43;
INSERT OR IGNORE INTO schema_migrations (version) VALUES (41);
`;

function transition(db: AppDatabase, actor: BillingActor, id: string, next: string, permission: string, expectedVersion: number, idempotencyKey: string, label: string) {
  gate(db, actor, permission);
  assertKey(idempotencyKey);
  const row = chargeRow(db, actor, id);
  const hash = JSON.stringify([label, id, expectedVersion, next]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  move(row.status, next);
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: next };
  return transaction(db, () => {
    const replay = readCommand<typeof response>(db, actor.organizationId, idempotencyKey, hash);
    if (replay) return { ...replay, idempotent: true };
    if (!Number.isInteger(expectedVersion) || expectedVersion !== row.version) throw new ConflictError("conflict", "The record changed. Review the current version.");
    const changed = run(db, `UPDATE billing_charges SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, next, now, id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "charge", id, row.version + 1, row.version, row.encounter_id, next, { status: next, totalMinor: row.total_minor, currency: row.currency }, now);
    run(db, `INSERT INTO billing_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, actor, `billing.charge.${label}`);
    audit(db, actor, permission, "BillingCharge", id);
    return { ...response, idempotent: false };
  });
}

function requireOpen(db: AppDatabase) {
  const control = get<{ value: string }>(db, `SELECT value FROM billing_controls WHERE name = 'dependency'`);
  if (!control || control.value !== "available") throw new ConflictError("conflict", "Billing is unavailable.");
}

function gate(db: AppDatabase, actor: BillingActor, permission: string) {
  assertLocalHealthcareSandbox();
  requireOpen(db);
  if (!actor.sessionId || !actor.facilityId) throw new ForbiddenError();
  const decision = authorize(
    db,
    { principalId: actor.userId, accountActive: true },
    permission,
    { type: "BillingCharge", organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "administrative" },
    { purpose: "OPERATIONS", assurance: "directory", sessionActive: true, activeFacilityId: actor.facilityId, correlationId: actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Billing is not permitted for this session.");
}

function sessionFor(db: AppDatabase, actor: BillingActor): SessionContext {
  const user = get<{ display_name: string; role: SessionContext["role"]; organization_name: string; facility_name: string | null }>(
    db,
    `SELECT u.display_name, u.role, o.name AS organization_name, f.name AS facility_name
     FROM users u JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN facilities f ON f.id = ?
     WHERE u.id = ?`,
    actor.facilityId,
    actor.userId,
  );
  if (!user || !actor.facilityId) throw new ForbiddenError();
  return {
    sessionId: actor.sessionId,
    userId: actor.userId,
    displayName: user.display_name,
    role: user.role,
    purposeOfUse: "OPERATIONS",
    organizationId: actor.organizationId,
    organizationName: user.organization_name,
    facilityId: actor.facilityId,
    facilityName: user.facility_name ?? "Facility",
  };
}

function countMetric(db: AppDatabase, actor: BillingActor, name: string) {
  run(db, `INSERT INTO billing_metrics (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1`, `${actor.organizationId}:${actor.facilityId}:${name}`);
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function readCommand<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(db, `SELECT request_hash, response_json FROM billing_commands WHERE organization_id = ? AND command_key = ?`, organizationId, key);
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function newId(prefix: string) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function assertPatient(db: AppDatabase, actor: BillingActor, patientId: string) {
  const patient = get<{ organization_id: string; facility_id: string; registration_status: string }>(db, `SELECT organization_id, facility_id, registration_status FROM patients WHERE id = ?`, patientId);
  if (!patient || patient.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (patient.registration_status === "merged") throw new ValidationError("invalid", "That patient is superseded. Use the surviving record.");
  if (patient.registration_status !== "active") throw new ValidationError("invalid", "That patient is not active.");
  const registered = patient.facility_id === actor.facilityId || get(db, `SELECT id FROM patient_facility_registrations WHERE patient_id = ? AND facility_id = ? AND status = 'active'`, patientId, actor.facilityId);
  if (!registered) throw new NotFoundError("That patient is not available.");
}

function assertEncounter(db: AppDatabase, actor: BillingActor, encounterId: string, patientId: string) {
  const row = get<{ patient_id: string; organization_id: string; facility_id: string; status: string }>(db, `SELECT patient_id, organization_id, facility_id, status FROM visit_encounters WHERE id = ?`, encounterId);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That encounter is not available.");
  if (row.patient_id !== patientId) throw new ConflictError("conflict", "That encounter is not for this patient.");
  if (row.status !== "in-progress" && row.status !== "completed") throw new ConflictError("conflict", "That encounter is not available for billing.");
}

function catalogRow(db: AppDatabase, actor: BillingActor, id: string) {
  const row = get<{ id: string; organization_id: string; facility_id: string | null; code: string; display: string; currency: string; minor_units: number; unit_price_minor: number; version: number; status: string; effective_on: string; expires_on: string | null }>(
    db,
    `SELECT id, organization_id, facility_id, code, display, currency, minor_units, unit_price_minor, version, status, effective_on, expires_on FROM billing_catalog WHERE id = ?`,
    id,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That catalog item is not available.");
  if (row.facility_id && row.facility_id !== actor.facilityId) throw new NotFoundError("That catalog item is not available.");
  if (row.status !== "active") throw new ConflictError("conflict", "That catalog item is not active.");
  const today = new Date().toISOString().slice(0, 10);
  if (row.effective_on > today || (row.expires_on !== null && row.expires_on < today)) throw new ConflictError("conflict", "That catalog price is outside its effective dates.");
  if (row.currency !== "GHS" || row.minor_units !== 2) throw new ValidationError("invalid", "That currency is not supported for this catalog.");
  return row;
}

function chargeRow(db: AppDatabase, actor: BillingActor, id: string) {
  const row = get<{ id: string; organization_id: string; facility_id: string; patient_id: string; encounter_id: string; status: string; currency: string; total_minor: number; version: number }>(
    db,
    `SELECT id, organization_id, facility_id, patient_id, encounter_id, status, currency, total_minor, version FROM billing_charges WHERE id = ?`,
    id,
  );
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  return row;
}

function multiplyMinor(unit: number, quantity: number) {
  if (!Number.isInteger(unit) || unit < 0) throw new ValidationError("range");
  const total = unit * quantity;
  if (!Number.isInteger(total) || total < 0 || total > 100_000_000) throw new ValidationError("range");
  return total;
}

function remember(db: AppDatabase, actor: BillingActor, kind: string, recordId: string, version: number, prior: number | null, encounterId: string | null, reason: string | null, snapshot: unknown, now: string) {
  run(
    db,
    `INSERT INTO billing_versions (id, organization_id, record_kind, record_id, version, prior_version, actor_id, facility_id, encounter_id, recorded_at, amended_at, reason, snapshot_json, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    actor.organizationId,
    kind,
    recordId,
    version,
    prior,
    actor.userId,
    actor.facilityId,
    encounterId,
    now,
    prior === null ? null : now,
    reason,
    JSON.stringify(snapshot),
    actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
  );
}

function move(current: string, next: string) {
  if (!CHARGE_NEXT[current]?.includes(next)) throw new ConflictError("conflict", "That charge change is not allowed.");
}

function audit(db: AppDatabase, actor: BillingActor, action: string, resourceType: string, resourceId: string) {
  writeAudit(db, sessionFor(db, actor), { action, resourceType, resourceId, outcome: "success" });
}
