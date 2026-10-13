import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { noteDenial, writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { formatQuantity } from "./catalog";
import { recordObservation } from "./chart";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart, canRegisterPatient } from "./session";
import { resolveFacilityConcept } from "./terminology";

export const LAB_RULE_VERSION = "lab-critical-2026.10";

const CRITICAL_PINS = [
  { id: "crit_2823_3", code: "2823-3", low: 2.5, high: 6 },
  { id: "crit_2345_7", code: "2345-7", low: 40, high: 500 },
] as const;

export type CriticalFlag = "none" | "critical-low" | "critical-high";

export type LabOrderView = {
  id: string;
  code: string;
  display: string;
  status: "requested" | "collected" | "resulted" | "cancelled";
  specimenId: string | null;
  result: {
    id: string;
    observationId: string;
    value: number;
    unit: string;
    unitSystemVersion: string;
    codeSystemVersion: string;
    bindingVersion: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    criticalFlag: CriticalFlag;
    ruleId: string | null;
    ruleVersion: string | null;
    alertStatus: "open" | "acknowledged" | null;
  } | null;
};

export type LabTrend = {
  code: string;
  display: string;
  direction: "none" | "single" | "rising" | "falling" | "unchanged";
  text: string;
  criticalFlag: CriticalFlag;
};

export type LabView = {
  patientId: string;
  orders: LabOrderView[];
  trends: LabTrend[];
};

export function holdCriticalFlag(flag: CriticalFlag, _aiOutput: unknown): CriticalFlag {
  return flag;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function visibleLabOrder(db: AppDatabase, ctx: SessionContext, orderId: string) {
  const facilityId = facilityOf(ctx);
  const order = get<{ id: string; organization_id: string; facility_id: string; patient_id: string; code: string; status: string }>(
    db,
    `SELECT id, organization_id, facility_id, patient_id, code, status FROM lab_orders WHERE id = ?`,
    orderId,
  );
  if (!order) throw new NotFoundError();
  if (order.organization_id !== ctx.organizationId || order.facility_id !== facilityId) {
    noteDenial(db, ctx, "lab.result", "LabOrder", orderId);
    throw new NotFoundError();
  }
  return order;
}

function mirroredObservation(
  db: AppDatabase,
  ctx: SessionContext,
  order: { patient_id: string; code: string; facility_id: string },
  observationId: string,
) {
  if (!/^obs_[A-Za-z0-9_-]{1,80}$/.test(observationId)) throw new ValidationError();
  const row = get<{ id: string }>(
    db,
    `SELECT id FROM observations WHERE id = ? AND patient_id = ? AND facility_id = ? AND code = ? AND organization_id = ?`,
    observationId,
    order.patient_id,
    order.facility_id,
    order.code,
    ctx.organizationId,
  );
  if (!row) throw new NotFoundError();
  return { id: row.id };
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) throw new ForbiddenError();
  return ctx.facilityId;
}

function criticalFlag(low: number | null, high: number | null, value: number): CriticalFlag {
  if (low !== null && value <= low) return "critical-low";
  if (high !== null && value >= high) return "critical-high";
  return "none";
}

export function seedLabRules(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM lab_critical_rules");
  if ((existing?.c ?? 0) > 0) return;
  for (const rule of CRITICAL_PINS) {
    execute(
      db,
      `INSERT INTO lab_critical_rules (id, code, critical_low, critical_high, rule_version) VALUES (?, ?, ?, ?, ?)`,
      rule.id,
      rule.code,
      rule.low,
      rule.high,
      LAB_RULE_VERSION,
    );
  }
}

export function ensureLabPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM lab_critical_rules");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedLabRules(db));
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

export function placeLabOrder(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; code: string; idempotencyKey: string; orderId?: string },
) {
  assertKey(input.idempotencyKey);
  if (!canRegisterPatient(ctx)) {
    noteDenial(db, ctx, "lab.order", "LabOrder", null);
    throw new ForbiddenError();
  }
  const supplied = input.orderId?.trim() ?? "";
  if (supplied && !/^ord_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const facilityId = requirePatient(db, ctx, input.patientId);
  const concept = resolveFacilityConcept(db, facilityId, input.code);
  if (!concept) throw new ValidationError("code");
  const hash = canonicalHash({ patientId: input.patientId, code: input.code, ...(supplied ? { orderId: supplied } : {}) });
  const existing = replay<{ orderId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const orderId = supplied || `ord_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { orderId };
  transaction(db, () => {
    if (supplied) {
      const row = get<{ organization_id: string; facility_id: string; patient_id: string; code: string }>(
        db,
        `SELECT organization_id, facility_id, patient_id, code FROM lab_orders WHERE id = ?`,
        supplied,
      );
      if (row) {
        if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId) throw new NotFoundError();
        if (row.patient_id !== input.patientId || row.code !== concept.code) {
          throw new ConflictError("duplicate", "That order id is already stored for a different entry.");
        }
        saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
        return;
      }
    }
    execute(
      db,
      `INSERT INTO lab_orders (id, organization_id, facility_id, patient_id, code, display, status, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
      orderId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      concept.code,
      concept.display,
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'lab.order', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ orderId, patientId: input.patientId, code: concept.code, status: "requested" }),
      now,
    );
    writeAudit(db, ctx, { action: "lab.order", resourceType: "LabOrder", resourceId: orderId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function collectLabSpecimen(
  db: AppDatabase,
  ctx: SessionContext,
  input: { orderId: string; idempotencyKey: string; specimenId?: string },
) {
  assertKey(input.idempotencyKey);
  const supplied = input.specimenId?.trim() ?? "";
  if (supplied && !/^spc_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const facilityId = facilityOf(ctx);
  const order = get<{ id: string; organization_id: string; facility_id: string; status: string }>(
    db,
    `SELECT id, organization_id, facility_id, status FROM lab_orders WHERE id = ?`,
    input.orderId,
  );
  if (!order) throw new NotFoundError();
  if (order.organization_id !== ctx.organizationId || order.facility_id !== facilityId) {
    noteDenial(db, ctx, "lab.specimen", "LabOrder", input.orderId);
    throw new NotFoundError();
  }
  const hash = canonicalHash({ orderId: input.orderId, ...(supplied ? { specimenId: supplied } : {}) });
  const existing = replay<{ specimenId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const specimenId = supplied || `spc_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { specimenId };
  transaction(db, () => {
    if (supplied) {
      const row = get<{ organization_id: string; facility_id: string; order_id: string }>(
        db,
        `SELECT organization_id, facility_id, order_id FROM lab_specimens WHERE id = ?`,
        supplied,
      );
      if (row) {
        if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId || row.order_id !== order.id) throw new NotFoundError();
        saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
        return;
      }
    }
    if (order.status !== "requested") throw new ConflictError("conflict", "That order is not waiting for a specimen.");
    execute(
      db,
      `INSERT INTO lab_specimens (id, order_id, organization_id, facility_id, collected_by, collected_at) VALUES (?, ?, ?, ?, ?, ?)`,
      specimenId,
      order.id,
      ctx.organizationId,
      facilityId,
      ctx.userId,
      now,
    );
    execute(db, `UPDATE lab_orders SET status = 'collected' WHERE id = ? AND status = 'requested'`, order.id);
    writeAudit(db, ctx, { action: "lab.specimen", resourceType: "LabSpecimen", resourceId: specimenId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function readLabOrderForResult(db: AppDatabase, ctx: SessionContext, orderId: string) {
  const order = visibleLabOrder(db, ctx, orderId);
  return { patientId: order.patient_id, code: order.code };
}

export function recordLabResult(
  db: AppDatabase,
  ctx: SessionContext,
  input: { orderId: string; value: number; idempotencyKey: string; observationId?: string; resultId?: string; alertId?: string },
) {
  assertKey(input.idempotencyKey);
  const supplied = input.resultId?.trim() ?? "";
  if (supplied && !/^lbr_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const suppliedAlert = input.alertId?.trim() ?? "";
  if (suppliedAlert && !/^alt_[A-Za-z0-9_-]{1,80}$/.test(suppliedAlert)) throw new ValidationError();
  const facilityId = facilityOf(ctx);
  const order = visibleLabOrder(db, ctx, input.orderId);
  const hash = canonicalHash({
    orderId: input.orderId,
    value: input.value,
    ...(supplied ? { resultId: supplied } : {}),
    ...(suppliedAlert ? { alertId: suppliedAlert } : {}),
  });
  const existing = replay<{ resultId: string; criticalFlag: CriticalFlag }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (supplied) {
    const row = get<{ organization_id: string; facility_id: string; order_id: string; value: number; critical_flag: CriticalFlag }>(
      db,
      `SELECT organization_id, facility_id, order_id, value, critical_flag FROM lab_results WHERE id = ?`,
      supplied,
    );
    if (row) {
      if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId || row.order_id !== order.id) throw new NotFoundError();
      if (Number(row.value) !== input.value) throw new ConflictError("duplicate", "That result id is already stored for a different entry.");
      if (suppliedAlert) {
        const alert = get<{ id: string }>(db, `SELECT id FROM lab_alerts WHERE result_id = ?`, supplied);
        if (!alert || alert.id !== suppliedAlert) throw new ConflictError("duplicate", "That alert id is already stored for a different entry.");
      }
      const saved = { resultId: supplied, criticalFlag: row.critical_flag };
      const now = new Date().toISOString();
      transaction(db, () => saveKey(db, ctx, input.idempotencyKey, hash, saved, now));
      return saved;
    }
  }
  if (order.status !== "collected") throw new ConflictError("conflict", "A specimen is required before a result.");
  const concept = resolveFacilityConcept(db, facilityId, order.code);
  if (!concept) throw new ValidationError("code");
  if (!Number.isFinite(input.value) || input.value < concept.min || input.value > concept.max) throw new ValidationError("range");
  const rule = get<{ id: string; critical_low: number | null; critical_high: number | null; rule_version: string }>(
    db,
    `SELECT id, critical_low, critical_high, rule_version FROM lab_critical_rules WHERE code = ?`,
    order.code,
  );
  const flag = rule ? criticalFlag(rule.critical_low, rule.critical_high, input.value) : "none";
  if (flag === "none" && suppliedAlert) throw new ConflictError("conflict", "That result has no alert.");
  const childKey = `l${input.idempotencyKey}`;
  if (childKey.length > 80) throw new ValidationError();
  const observation = input.observationId
    ? mirroredObservation(db, ctx, order, input.observationId)
    : recordObservation(db, ctx, { patientId: order.patient_id, code: order.code, value: input.value, idempotencyKey: childKey });
  const resultId = supplied || `lbr_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { resultId, criticalFlag: flag };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO lab_results (
         id, order_id, observation_id, organization_id, facility_id, patient_id, code, value, unit, unit_system_version,
         code_system_version, binding_version, reference_low, reference_high, critical_flag, rule_id, rule_version, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      resultId,
      order.id,
      observation.id,
      ctx.organizationId,
      facilityId,
      order.patient_id,
      order.code,
      input.value,
      concept.unit,
      concept.unitSystemVersion,
      concept.codeSystemVersion,
      concept.bindingVersion,
      concept.low,
      concept.high,
      flag,
      rule?.id ?? null,
      rule?.rule_version ?? null,
      now,
    );
    if (flag !== "none") {
      execute(
        db,
        `INSERT INTO lab_alerts (id, result_id, organization_id, facility_id, critical_flag, status, acknowledged_by, acknowledged_at)
         VALUES (?, ?, ?, ?, ?, 'open', NULL, NULL)`,
        suppliedAlert || `alt_${randomUUID()}`,
        resultId,
        ctx.organizationId,
        facilityId,
        flag,
      );
    }
    execute(db, `UPDATE lab_orders SET status = 'resulted' WHERE id = ? AND status = 'collected'`, order.id);
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'lab.result', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ resultId, orderId: order.id, observationId: observation.id, criticalFlag: flag, ruleVersion: rule?.rule_version ?? null }),
      now,
    );
    writeAudit(db, ctx, { action: "lab.result", resourceType: "LabResult", resourceId: resultId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function acknowledgeLabAlert(db: AppDatabase, ctx: SessionContext, input: { resultId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const alert = get<{ id: string; organization_id: string; facility_id: string; status: string; critical_flag: string }>(
    db,
    `SELECT a.id, a.organization_id, a.facility_id, a.status, a.critical_flag
     FROM lab_alerts a WHERE a.result_id = ?`,
    input.resultId,
  );
  if (!alert) throw new NotFoundError();
  if (alert.organization_id !== ctx.organizationId || alert.facility_id !== facilityId) {
    noteDenial(db, ctx, "lab.alert", "LabAlert", input.resultId);
    throw new NotFoundError();
  }
  const hash = canonicalHash({ resultId: input.resultId });
  const existing = replay<{ alertId: string; criticalFlag: CriticalFlag }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (alert.status !== "open") throw new ConflictError("conflict", "That alert is already acknowledged.");
  const now = new Date().toISOString();
  const saved = { alertId: alert.id, criticalFlag: alert.critical_flag as CriticalFlag };
  transaction(db, () => {
    execute(
      db,
      `UPDATE lab_alerts SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ? WHERE id = ? AND status = 'open'`,
      ctx.userId,
      now,
      alert.id,
    );
    writeAudit(db, ctx, { action: "lab.alert", resourceType: "LabAlert", resourceId: alert.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  const still = get<{ critical_flag: string }>(db, `SELECT critical_flag FROM lab_results WHERE id = ?`, input.resultId);
  if (still?.critical_flag !== alert.critical_flag) throw new ValidationError("invalid", "A critical flag cannot be cleared.");
  return saved;
}

function trendFor(code: string, display: string, points: { value: number; unit: string; criticalFlag: CriticalFlag; ruleVersion: string | null }[]): LabTrend {
  if (points.length === 0) return { code, display, direction: "none", text: "No lab results are stored for this code.", criticalFlag: "none" };
  const last = points[points.length - 1];
  if (!last) return { code, display, direction: "none", text: "No lab results are stored for this code.", criticalFlag: "none" };
  if (points.length === 1) {
    return {
      code,
      display,
      direction: "single",
      criticalFlag: last.criticalFlag,
      text: `One stored result · ${display} · ${formatQuantity(last.value)} ${last.unit}.`,
    };
  }
  const prev = points[points.length - 2];
  if (!prev) return { code, display, direction: "single", text: `One stored result · ${display} · ${formatQuantity(last.value)} ${last.unit}.`, criticalFlag: last.criticalFlag };
  const direction = last.value > prev.value ? "rising" : last.value < prev.value ? "falling" : "unchanged";
  const verb = direction === "rising" ? "rose" : direction === "falling" ? "fell" : "stayed";
  const rule = last.criticalFlag === "none" ? "" : ` The later value meets ${last.criticalFlag} on rule ${last.ruleVersion}.`;
  return {
    code,
    display,
    direction,
    criticalFlag: last.criticalFlag,
    text: `Stored ${display} ${verb} from ${formatQuantity(prev.value)} to ${formatQuantity(last.value)} ${last.unit}.${rule}`,
  };
}

export function readLab(db: AppDatabase, ctx: SessionContext, patientId: string): LabView | null {
  const facilityId = facilityOf(ctx);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) return null;
  const orders = all<{
    id: string;
    code: string;
    display: string;
    status: LabOrderView["status"];
    specimen_id: string | null;
    result_id: string | null;
    observation_id: string | null;
    value: number | null;
    unit: string | null;
    unit_system_version: string | null;
    code_system_version: string | null;
    binding_version: string | null;
    reference_low: number | null;
    reference_high: number | null;
    critical_flag: CriticalFlag | null;
    rule_id: string | null;
    rule_version: string | null;
    alert_status: "open" | "acknowledged" | null;
  }>(
    db,
    `SELECT o.id, o.code, o.display, o.status, s.id AS specimen_id, r.id AS result_id, r.observation_id, r.value, r.unit,
            r.unit_system_version, r.code_system_version, r.binding_version, r.reference_low, r.reference_high,
            r.critical_flag, r.rule_id, r.rule_version, a.status AS alert_status
     FROM lab_orders o
     LEFT JOIN lab_specimens s ON s.order_id = o.id
     LEFT JOIN lab_results r ON r.order_id = o.id
     LEFT JOIN lab_alerts a ON a.result_id = r.id
     WHERE o.organization_id = ? AND o.facility_id = ? AND o.patient_id = ?
     ORDER BY o.created_at`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const grouped = new Map<string, { display: string; points: { value: number; unit: string; criticalFlag: CriticalFlag; ruleVersion: string | null }[] }>();
  const view: LabOrderView[] = orders.map((row) => {
    if (row.result_id && row.value !== null && row.unit && row.critical_flag) {
      const bucket = grouped.get(row.code) ?? { display: row.display, points: [] };
      bucket.points.push({ value: row.value, unit: row.unit, criticalFlag: row.critical_flag, ruleVersion: row.rule_version });
      grouped.set(row.code, bucket);
    }
    return {
      id: row.id,
      code: row.code,
      display: row.display,
      status: row.status,
      specimenId: row.specimen_id,
      result:
        row.result_id && row.observation_id && row.value !== null && row.unit && row.critical_flag
          ? {
              id: row.result_id,
              observationId: row.observation_id,
              value: row.value,
              unit: row.unit,
              unitSystemVersion: row.unit_system_version ?? "",
              codeSystemVersion: row.code_system_version ?? "",
              bindingVersion: row.binding_version ?? "",
              referenceLow: row.reference_low,
              referenceHigh: row.reference_high,
              criticalFlag: row.critical_flag,
              ruleId: row.rule_id,
              ruleVersion: row.rule_version,
              alertStatus: row.alert_status,
            }
          : null,
    };
  });
  writeAudit(db, ctx, { action: "lab.read", resourceType: "Lab", resourceId: patientId, outcome: "success" });
  return {
    patientId,
    orders: view,
    trends: [...grouped.entries()].map(([code, bucket]) => trendFor(code, bucket.display, bucket.points)),
  };
}

export function explainLabTrend(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; code: string; idempotencyKey: string },
  adapter?: GatewayAdapter,
) {
  assertKey(input.idempotencyKey);
  const lab = readLab(db, ctx, input.patientId);
  if (!lab) throw new NotFoundError();
  const trend = lab.trends.find((item) => item.code === input.code) ?? {
    code: input.code,
    display: input.code,
    direction: "none" as const,
    text: "No lab results are stored for this code.",
    criticalFlag: "none" as const,
  };
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Explain the listed lab identifiers.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  return {
    ...trend,
    criticalFlag: holdCriticalFlag(trend.criticalFlag, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}
