import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { noteDenial, writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart, canRegisterPatient } from "./session";

export const RX_SOURCE = "local-pin";
export const FORMULARY_VERSION = "formulary-2026.10";
export const MED_SAFETY_VERSION = "med-safety-2026.10";

const FORMULARY = [
  { id: "frm_furosemide", code: "local-furosemide", display: "Furosemide", therapyClass: "loop-diuretic", status: "on-formulary" },
  { id: "frm_torsemide", code: "local-torsemide", display: "Torsemide", therapyClass: "loop-diuretic", status: "on-formulary" },
  { id: "frm_metformin", code: "local-metformin", display: "Metformin", therapyClass: "biguanide", status: "on-formulary" },
  { id: "frm_amoxicillin", code: "local-amoxicillin", display: "Amoxicillin", therapyClass: "penicillin", status: "on-formulary" },
  { id: "frm_warfarin", code: "local-warfarin", display: "Warfarin", therapyClass: "anticoagulant", status: "on-formulary" },
  { id: "frm_ibuprofen", code: "local-ibuprofen", display: "Ibuprofen", therapyClass: "nsaid", status: "non-formulary" },
] as const;

const SAFETY_RULES = [
  { id: "alg_penicillin", kind: "allergy", left: "Penicillin", right: "penicillin", severity: "high" },
  { id: "int_anticoag_nsaid", kind: "interaction", left: "anticoagulant", right: "nsaid", severity: "high" },
  { id: "dup_class", kind: "duplicate", left: "*", right: "*", severity: "high" },
  { id: "frm_nonformulary", kind: "formulary", left: "non-formulary", right: "", severity: "moderate" },
] as const;

export type RxWarning = {
  id: string;
  kind: "allergy" | "interaction" | "duplicate" | "formulary";
  severity: "high" | "moderate";
  ruleId: string;
  ruleVersion: string;
  source: string;
  summary: string;
  status: "open" | "acknowledged";
};

export type RxOrderView = {
  id: string;
  formularyId: string;
  display: string;
  therapyClass: string;
  dose: string;
  status: "proposed" | "active" | "dispensed" | "cancelled";
  medicationId: string | null;
  warnings: RxWarning[];
  dispensedUnits: number;
  administrations: number;
  adherence: { signal: "none" | "behind" | "matched" | "ahead"; text: string };
};

export type RxView = {
  patientId: string;
  formulary: { id: string; display: string; therapyClass: string; status: string }[];
  orders: RxOrderView[];
};

type DraftWarning = Omit<RxWarning, "id" | "status">;

export function holdSafetyWarnings<T>(warnings: T, _aiOutput: unknown): T {
  return warnings;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) throw new ForbiddenError();
  return ctx.facilityId;
}

function assertDose(dose: string) {
  const text = dose.trim();
  if (text.length < 1 || text.length > 80 || /[\r\n]/.test(text)) throw new ValidationError();
  return text;
}

export function seedRxRules(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM rx_safety_rules");
  if ((existing?.c ?? 0) > 0) return;
  for (const item of FORMULARY) {
    execute(
      db,
      `INSERT INTO rx_formulary (id, code, display, therapy_class, formulary_status, source, rule_version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.code,
      item.display,
      item.therapyClass,
      item.status,
      RX_SOURCE,
      FORMULARY_VERSION,
    );
  }
  for (const rule of SAFETY_RULES) {
    execute(
      db,
      `INSERT INTO rx_safety_rules (id, kind, left_key, right_key, severity, source, rule_version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      rule.id,
      rule.kind,
      rule.left,
      rule.right,
      rule.severity,
      RX_SOURCE,
      MED_SAFETY_VERSION,
    );
  }
}

export function ensureRxPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM rx_safety_rules");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedRxRules(db));
}

function requirePatient(db: AppDatabase, ctx: SessionContext, patientId: string) {
  const facilityId = facilityOf(ctx);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) throw new NotFoundError();
  return facilityId;
}

function replay<T>(db: AppDatabase, ctx: SessionContext, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function saveKey(db: AppDatabase, ctx: SessionContext, key: string, hash: string, body: unknown, now: string) {
  execute(
    db,
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(body),
    now,
  );
}

function pairMatches(left: string, right: string, a: string, b: string) {
  return (left === a && right === b) || (left === b && right === a);
}

function draftWarnings(db: AppDatabase, ctx: SessionContext, facilityId: string, patientId: string, drug: { display: string; therapy_class: string; formulary_status: string }): DraftWarning[] {
  const rules = all<{ id: string; kind: DraftWarning["kind"]; left_key: string; right_key: string; severity: DraftWarning["severity"]; source: string; rule_version: string }>(
    db,
    `SELECT id, kind, left_key, right_key, severity, source, rule_version FROM rx_safety_rules`,
  );
  const allergies = all<{ display: string }>(
    db,
    `SELECT display FROM allergies WHERE organization_id = ? AND facility_id = ? AND patient_id = ?`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const active = all<{ display: string }>(
    db,
    `SELECT display FROM medications WHERE organization_id = ? AND facility_id = ? AND patient_id = ? AND status = 'active'`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const catalog = all<{ display: string; therapy_class: string }>(db, `SELECT display, therapy_class FROM rx_formulary`);
  const classes = active.flatMap((med) => {
    const match = catalog.find((item) => item.display.toLowerCase() === med.display.toLowerCase());
    return match ? [{ display: match.display, therapyClass: match.therapy_class }] : [];
  });
  const warnings: DraftWarning[] = [];
  for (const rule of rules) {
    if (rule.kind === "allergy") {
      const hit = allergies.find((item) => item.display.toLowerCase() === rule.left_key.toLowerCase());
      if (hit && drug.therapy_class === rule.right_key) {
        warnings.push({
          kind: "allergy",
          severity: rule.severity,
          ruleId: rule.id,
          ruleVersion: rule.rule_version,
          source: rule.source,
          summary: `Allergy ${hit.display} is stored. ${drug.display} is in class ${drug.therapy_class} on rule ${rule.rule_version}.`,
        });
      }
    } else if (rule.kind === "interaction") {
      const other = classes.find((item) => pairMatches(rule.left_key, rule.right_key, item.therapyClass, drug.therapy_class));
      if (other) {
        warnings.push({
          kind: "interaction",
          severity: rule.severity,
          ruleId: rule.id,
          ruleVersion: rule.rule_version,
          source: rule.source,
          summary: `${other.display} class ${other.therapyClass} and ${drug.display} class ${drug.therapy_class} are paired on rule ${rule.rule_version}.`,
        });
      }
    } else if (rule.kind === "duplicate") {
      const other = classes.find((item) => item.therapyClass === drug.therapy_class);
      if (other) {
        warnings.push({
          kind: "duplicate",
          severity: rule.severity,
          ruleId: rule.id,
          ruleVersion: rule.rule_version,
          source: rule.source,
          summary: `${other.display} and ${drug.display} are both class ${drug.therapy_class} on rule ${rule.rule_version}.`,
        });
      }
    } else if (rule.kind === "formulary" && drug.formulary_status === rule.left_key) {
      warnings.push({
        kind: "formulary",
        severity: rule.severity,
        ruleId: rule.id,
        ruleVersion: rule.rule_version,
        source: rule.source,
        summary: `${drug.display} is non-formulary on ${FORMULARY_VERSION}.`,
      });
    }
  }
  return warnings;
}

export function prescribeMedication(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; formularyId: string; dose: string; idempotencyKey: string; orderId?: string; warningIds?: string[] },
) {
  assertKey(input.idempotencyKey);
  if (!canRegisterPatient(ctx)) {
    noteDenial(db, ctx, "rx.prescribe", "RxOrder", null);
    throw new ForbiddenError();
  }
  const supplied = input.orderId?.trim() ?? "";
  if (supplied && !/^rxo_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const warningIds = (input.warningIds ?? []).map((id) => id.trim());
  if (warningIds.some((id) => !/^rxw_[A-Za-z0-9_-]{1,80}$/.test(id))) throw new ValidationError();
  const facilityId = requirePatient(db, ctx, input.patientId);
  const dose = assertDose(input.dose);
  const drug = get<{ id: string; display: string; therapy_class: string; formulary_status: string }>(
    db,
    `SELECT id, display, therapy_class, formulary_status FROM rx_formulary WHERE id = ?`,
    input.formularyId,
  );
  if (!drug) throw new ValidationError("code");
  const hash = canonicalHash({ patientId: input.patientId, formularyId: drug.id, dose, ...(supplied ? { orderId: supplied } : {}) });
  const existing = replay<{ orderId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (supplied) {
    const row = get<{ organization_id: string; facility_id: string; patient_id: string; formulary_id: string; dose: string }>(
      db,
      `SELECT organization_id, facility_id, patient_id, formulary_id, dose FROM rx_orders WHERE id = ?`,
      supplied,
    );
    if (row) {
      if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId) throw new NotFoundError();
      if (row.patient_id !== input.patientId || row.formulary_id !== drug.id || row.dose !== dose) {
        throw new ConflictError("duplicate", "That prescription id is already stored for a different entry.");
      }
      const saved = { orderId: supplied };
      const now = new Date().toISOString();
      transaction(db, () => saveKey(db, ctx, input.idempotencyKey, hash, saved, now));
      return saved;
    }
  }
  const orderId = supplied || `rxo_${randomUUID()}`;
  const now = new Date().toISOString();
  const drafts = draftWarnings(db, ctx, facilityId, input.patientId, drug);
  if (supplied && warningIds.length !== drafts.length) {
    throw new ConflictError("conflict", "The safety warnings changed. Reload the chart.");
  }
  const ids = supplied ? warningIds : drafts.map(() => `rxw_${randomUUID()}`);
  const saved = { orderId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO rx_orders (id, organization_id, facility_id, patient_id, formulary_id, dose, status, medication_id, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'proposed', NULL, ?, ?)`,
      orderId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      drug.id,
      dose,
      ctx.userId,
      now,
    );
    drafts.forEach((warning, index) => {
      execute(
        db,
        `INSERT INTO rx_warnings (id, order_id, organization_id, facility_id, kind, severity, rule_id, rule_version, source, summary, status, acknowledged_by, acknowledged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL)`,
        ids[index],
        orderId,
        ctx.organizationId,
        facilityId,
        warning.kind,
        warning.severity,
        warning.ruleId,
        warning.ruleVersion,
        warning.source,
        warning.summary,
      );
    });
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'rx.prescribe', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ orderId, patientId: input.patientId, formularyId: drug.id, warningCount: drafts.length }),
      now,
    );
    writeAudit(db, ctx, { action: "rx.prescribe", resourceType: "RxOrder", resourceId: orderId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function acknowledgeRxWarning(db: AppDatabase, ctx: SessionContext, input: { warningId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const warning = get<{ id: string; organization_id: string; facility_id: string; status: string; severity: RxWarning["severity"] }>(
    db,
    `SELECT id, organization_id, facility_id, status, severity FROM rx_warnings WHERE id = ?`,
    input.warningId,
  );
  if (!warning) throw new NotFoundError();
  if (warning.organization_id !== ctx.organizationId || warning.facility_id !== facilityId) {
    noteDenial(db, ctx, "rx.warning", "RxWarning", input.warningId);
    throw new NotFoundError();
  }
  const hash = canonicalHash({ warningId: input.warningId });
  const existing = replay<{ warningId: string; severity: RxWarning["severity"] }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (warning.status !== "open") throw new ConflictError("conflict", "That warning is already acknowledged.");
  const now = new Date().toISOString();
  const saved = { warningId: warning.id, severity: warning.severity };
  transaction(db, () => {
    execute(
      db,
      `UPDATE rx_warnings SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ? WHERE id = ? AND status = 'open'`,
      ctx.userId,
      now,
      warning.id,
    );
    writeAudit(db, ctx, { action: "rx.warning", resourceType: "RxWarning", resourceId: warning.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  const still = get<{ severity: string }>(db, `SELECT severity FROM rx_warnings WHERE id = ?`, warning.id);
  if (still?.severity !== warning.severity) throw new ValidationError("invalid", "A safety warning cannot be cleared.");
  return saved;
}

export function readActivatableRxOrder(db: AppDatabase, ctx: SessionContext, orderId: string) {
  if (!canRegisterPatient(ctx)) {
    noteDenial(db, ctx, "rx.activate", "RxOrder", orderId);
    throw new ForbiddenError();
  }
  const order = proposedOrder(db, ctx, orderId);
  const openHigh = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM rx_warnings WHERE order_id = ? AND severity = 'high' AND status = 'open'`,
    order.id,
  );
  if ((openHigh?.c ?? 0) > 0) throw new ConflictError("conflict", "A high-risk warning is still open.");
  return { orderId: order.id, patientId: order.patient_id, display: order.display, dose: order.dose };
}

function proposedOrder(db: AppDatabase, ctx: SessionContext, orderId: string) {
  const facilityId = facilityOf(ctx);
  const order = get<{ id: string; organization_id: string; facility_id: string; patient_id: string; formulary_id: string; dose: string; status: string; display: string }>(
    db,
    `SELECT o.id, o.organization_id, o.facility_id, o.patient_id, o.formulary_id, o.dose, o.status, f.display
     FROM rx_orders o JOIN rx_formulary f ON f.id = o.formulary_id WHERE o.id = ?`,
    orderId,
  );
  if (!order) throw new NotFoundError();
  if (order.organization_id !== ctx.organizationId || order.facility_id !== facilityId) {
    noteDenial(db, ctx, "rx.activate", "RxOrder", orderId);
    throw new NotFoundError();
  }
  if (order.status !== "proposed") throw new ConflictError("conflict", "That prescription is not waiting to be recorded.");
  return order;
}

export function activateRxOrder(db: AppDatabase, ctx: SessionContext, input: { orderId: string; idempotencyKey: string; medicationId?: string }) {
  assertKey(input.idempotencyKey);
  if (!canRegisterPatient(ctx)) {
    noteDenial(db, ctx, "rx.activate", "RxOrder", input.orderId);
    throw new ForbiddenError();
  }
  const supplied = input.medicationId?.trim() ?? "";
  if (supplied && !/^med_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const hash = canonicalHash(supplied ? { orderId: input.orderId, medicationId: supplied } : { orderId: input.orderId });
  const existing = replay<{ medicationId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const order = proposedOrder(db, ctx, input.orderId);
  const openHigh = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM rx_warnings WHERE order_id = ? AND severity = 'high' AND status = 'open'`,
    order.id,
  );
  if ((openHigh?.c ?? 0) > 0) throw new ConflictError("conflict", "A high-risk warning is still open.");
  const medicationId = supplied || `med_${randomUUID()}`;
  const facilityId = order.facility_id;
  const now = new Date().toISOString();
  const saved = { medicationId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO medications (id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      medicationId,
      ctx.organizationId,
      facilityId,
      order.patient_id,
      order.display,
      order.dose,
      now,
      ctx.userId,
    );
    execute(db, `UPDATE rx_orders SET status = 'active', medication_id = ? WHERE id = ? AND status = 'proposed'`, medicationId, order.id);
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'rx.activate', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ orderId: order.id, medicationId, formularyId: order.formulary_id }),
      now,
    );
    writeAudit(db, ctx, { action: "rx.activate", resourceType: "RxOrder", resourceId: order.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

function requireDispensable(db: AppDatabase, ctx: SessionContext, orderId: string) {
  const facilityId = facilityOf(ctx);
  const order = get<{ id: string; organization_id: string; facility_id: string; status: string }>(
    db,
    `SELECT id, organization_id, facility_id, status FROM rx_orders WHERE id = ?`,
    orderId,
  );
  if (!order) throw new NotFoundError();
  if (order.organization_id !== ctx.organizationId || order.facility_id !== facilityId) {
    noteDenial(db, ctx, "rx.dispense", "RxOrder", orderId);
    throw new NotFoundError();
  }
  if (order.status !== "active" && order.status !== "dispensed") throw new ConflictError("conflict", "Record the prescription before dispensing it.");
  return { order, facilityId };
}

export function dispenseRx(
  db: AppDatabase,
  ctx: SessionContext,
  input: { orderId: string; quantity: number; idempotencyKey: string; dispenseId?: string },
) {
  assertKey(input.idempotencyKey);
  const supplied = input.dispenseId?.trim() ?? "";
  if (supplied && !/^rxd_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 90) throw new ValidationError("range");
  const { order, facilityId } = requireDispensable(db, ctx, input.orderId);
  const hash = canonicalHash({ orderId: input.orderId, quantity: input.quantity, ...(supplied ? { dispenseId: supplied } : {}) });
  const existing = replay<{ dispenseId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (supplied) {
    const row = get<{ organization_id: string; facility_id: string; order_id: string; quantity: number }>(
      db,
      `SELECT organization_id, facility_id, order_id, quantity FROM rx_dispenses WHERE id = ?`,
      supplied,
    );
    if (row) {
      if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId) throw new NotFoundError();
      if (row.order_id !== order.id || row.quantity !== input.quantity) {
        throw new ConflictError("duplicate", "That dispense id is already stored for a different entry.");
      }
      const saved = { dispenseId: supplied };
      const now = new Date().toISOString();
      transaction(db, () => saveKey(db, ctx, input.idempotencyKey, hash, saved, now));
      return saved;
    }
  }
  const dispenseId = supplied || `rxd_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { dispenseId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO rx_dispenses (id, order_id, organization_id, facility_id, quantity, dispensed_by, dispensed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      dispenseId,
      order.id,
      ctx.organizationId,
      facilityId,
      input.quantity,
      ctx.userId,
      now,
    );
    execute(db, `UPDATE rx_orders SET status = 'dispensed' WHERE id = ?`, order.id);
    writeAudit(db, ctx, { action: "rx.dispense", resourceType: "RxDispense", resourceId: dispenseId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function administerRx(
  db: AppDatabase,
  ctx: SessionContext,
  input: { orderId: string; idempotencyKey: string; administrationId?: string },
) {
  assertKey(input.idempotencyKey);
  const supplied = input.administrationId?.trim() ?? "";
  if (supplied && !/^rxa_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const { order, facilityId } = requireDispensable(db, ctx, input.orderId);
  const hash = canonicalHash({ orderId: input.orderId, action: "administer", ...(supplied ? { administrationId: supplied } : {}) });
  const existing = replay<{ administrationId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (supplied) {
    const row = get<{ organization_id: string; facility_id: string; order_id: string }>(
      db,
      `SELECT organization_id, facility_id, order_id FROM rx_administrations WHERE id = ?`,
      supplied,
    );
    if (row) {
      if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId) throw new NotFoundError();
      if (row.order_id !== order.id) throw new ConflictError("duplicate", "That administration id is already stored for a different entry.");
      const saved = { administrationId: supplied };
      const now = new Date().toISOString();
      transaction(db, () => saveKey(db, ctx, input.idempotencyKey, hash, saved, now));
      return saved;
    }
  }
  const administrationId = supplied || `rxa_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { administrationId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO rx_administrations (id, order_id, organization_id, facility_id, administered_by, administered_at) VALUES (?, ?, ?, ?, ?, ?)`,
      administrationId,
      order.id,
      ctx.organizationId,
      facilityId,
      ctx.userId,
      now,
    );
    writeAudit(db, ctx, { action: "rx.administer", resourceType: "RxAdministration", resourceId: administrationId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

function adherence(dispensed: number, administered: number): RxOrderView["adherence"] {
  if (dispensed === 0 && administered === 0) return { signal: "none", text: "No dispense or administration is stored." };
  const given = administered === 1 ? "1 administration is stored" : `${administered} administrations are stored`;
  const text = `${given} against ${dispensed} dispensed units.`;
  if (administered < dispensed) return { signal: "behind", text };
  if (administered === dispensed) return { signal: "matched", text };
  return { signal: "ahead", text };
}

export function readRx(db: AppDatabase, ctx: SessionContext, patientId: string): RxView | null {
  const facilityId = facilityOf(ctx);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) return null;
  const formulary = all<{ id: string; display: string; therapy_class: string; formulary_status: string }>(
    db,
    `SELECT id, display, therapy_class, formulary_status FROM rx_formulary ORDER BY display`,
  );
  const orders = all<{ id: string; formulary_id: string; display: string; therapy_class: string; dose: string; status: RxOrderView["status"]; medication_id: string | null }>(
    db,
    `SELECT o.id, o.formulary_id, f.display, f.therapy_class, o.dose, o.status, o.medication_id
     FROM rx_orders o JOIN rx_formulary f ON f.id = o.formulary_id
     WHERE o.organization_id = ? AND o.facility_id = ? AND o.patient_id = ?
     ORDER BY o.created_at`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const view = orders.map((order) => {
    const warnings = all<{ id: string; kind: RxWarning["kind"]; severity: RxWarning["severity"]; rule_id: string; rule_version: string; source: string; summary: string; status: RxWarning["status"] }>(
      db,
      `SELECT id, kind, severity, rule_id, rule_version, source, summary, status FROM rx_warnings WHERE order_id = ? ORDER BY id`,
      order.id,
    );
    const dispensed = get<{ q: number }>(db, `SELECT COALESCE(SUM(quantity), 0) AS q FROM rx_dispenses WHERE order_id = ?`, order.id);
    const given = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM rx_administrations WHERE order_id = ?`, order.id);
    return {
      id: order.id,
      formularyId: order.formulary_id,
      display: order.display,
      therapyClass: order.therapy_class,
      dose: order.dose,
      status: order.status,
      medicationId: order.medication_id,
      warnings: warnings.map((warning) => ({
        id: warning.id,
        kind: warning.kind,
        severity: warning.severity,
        ruleId: warning.rule_id,
        ruleVersion: warning.rule_version,
        source: warning.source,
        summary: warning.summary,
        status: warning.status,
      })),
      dispensedUnits: dispensed?.q ?? 0,
      administrations: given?.c ?? 0,
      adherence: adherence(dispensed?.q ?? 0, given?.c ?? 0),
    };
  });
  writeAudit(db, ctx, { action: "rx.read", resourceType: "Rx", resourceId: patientId, outcome: "success" });
  return {
    patientId,
    formulary: formulary.map((item) => ({ id: item.id, display: item.display, therapyClass: item.therapy_class, status: item.formulary_status })),
    orders: view,
  };
}

export function explainRx(db: AppDatabase, ctx: SessionContext, input: { orderId: string; idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const order = get<{ id: string; organization_id: string; facility_id: string; patient_id: string }>(
    db,
    `SELECT id, organization_id, facility_id, patient_id FROM rx_orders WHERE id = ?`,
    input.orderId,
  );
  if (!order || order.organization_id !== ctx.organizationId || order.facility_id !== facilityId) throw new NotFoundError();
  const rx = readRx(db, ctx, order.patient_id);
  const found = rx?.orders.find((item) => item.id === order.id);
  if (!found) throw new NotFoundError();
  const gateway = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Explain the listed medication identifiers.", idempotencyKey: input.idempotencyKey },
    adapter,
  );
  return {
    orderId: found.id,
    warnings: holdSafetyWarnings(found.warnings, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}
