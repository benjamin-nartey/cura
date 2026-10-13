import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";

export const ANALYTICS_GOVERNANCE_VERSION = "analytics-governance-2026.10";
export const ANALYTICS_DEID_VERSION = "analytics-deid-2026.10";
export const ANALYTICS_METRICS_VERSION = "analytics-metrics-2026.10";
export const ANALYTICS_REID_VERSION = "analytics-reid-2026.10";
export const ANALYTICS_CELL_MINIMUM = 5;

const METRICS = ["events-by-type", "events-by-facility"] as const;

export type AnalyticsMetricId = (typeof METRICS)[number];

export type AnalyticsFact = {
  id: string;
  outboxId: string;
  eventType: string;
  facilityId: string | null;
  droppedKeys: string[];
  sourceHash: string;
  deidVersion: string;
  ingestedAt: string;
};

export type AnalyticsCell = { key: string; count: number };

export type AnalyticsLineageCell = AnalyticsCell & { factIds: string[]; outboxIds: string[] };

export type AnalyticsAssessment = {
  version: string;
  cellMinimum: number;
  directIdentifierFound: boolean;
  suppressed: AnalyticsCell[];
  text: string;
};

export type AnalyticsExport = {
  exportId: string;
  metricId: AnalyticsMetricId;
  decision: "release" | "withhold";
  body: { metricId: AnalyticsMetricId; cells: AnalyticsCell[] } | null;
  lineage: { metricId: AnalyticsMetricId; metricVersion: string; cells: AnalyticsLineageCell[] };
  assessment: AnalyticsAssessment;
};

export type AnalyticsView = {
  governanceVersion: string;
  deidVersion: string;
  metricVersion: string;
  reidVersion: string;
  factCount: number;
  facts: AnalyticsFact[];
  exports: AnalyticsExport[];
};

type FactRow = {
  id: string;
  outbox_id: string;
  event_type: string;
  facility_id: string | null;
  dropped_keys_json: string;
  source_hash: string;
  deid_version: string;
  ingested_at: string;
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function isMetric(value: string): value is AnalyticsMetricId {
  return (METRICS as readonly string[]).includes(value);
}

function assertAnalytics(db: AppDatabase, ctx: SessionContext, action: string) {
  if (ctx.role !== "auditor" || ctx.purposeOfUse !== "AUDIT") {
    writeAudit(db, ctx, { action, resourceType: "AnalyticsMart", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function deidentify(payload: string) {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(payload) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const dropped: string[] = [];
  const kept: { facilityId?: string } = {};
  for (const key of Object.keys(parsed).sort()) {
    const value = parsed[key];
    if (key === "facilityId" && typeof value === "string" && /^fac_[A-Za-z0-9_-]{1,64}$/.test(value)) {
      kept.facilityId = value;
    } else {
      dropped.push(key);
    }
  }
  return { kept, dropped, facilityId: kept.facilityId ?? null };
}

function loadFacts(db: AppDatabase, organizationId: string): FactRow[] {
  return all<FactRow>(
    db,
    `SELECT id, outbox_id, event_type, facility_id, dropped_keys_json, source_hash, deid_version, ingested_at
     FROM analytics_facts WHERE organization_id = ? ORDER BY ingested_at, id`,
    organizationId,
  );
}

function toFact(row: FactRow): AnalyticsFact {
  return {
    id: row.id,
    outboxId: row.outbox_id,
    eventType: row.event_type,
    facilityId: row.facility_id,
    droppedKeys: JSON.parse(row.dropped_keys_json) as string[],
    sourceHash: row.source_hash,
    deidVersion: row.deid_version,
    ingestedAt: row.ingested_at,
  };
}

function identifierValues(db: AppDatabase, organizationId: string) {
  return all<{ given_name: string; family_name: string; mrn: string; birth_date: string }>(
    db,
    `SELECT given_name, family_name, mrn, birth_date FROM patients WHERE organization_id = ?`,
    organizationId,
  ).flatMap((row) => [row.given_name, row.family_name, row.mrn, row.birth_date]);
}

export function containsDirectIdentifier(db: AppDatabase, organizationId: string, text: string) {
  return identifierValues(db, organizationId).some((value) => value.length >= 3 && text.includes(value));
}

function groupFacts(metricId: AnalyticsMetricId, facts: FactRow[]) {
  const groups = new Map<string, FactRow[]>();
  for (const fact of facts) {
    const key = metricId === "events-by-type" ? fact.event_type : fact.facility_id ?? "none";
    const list = groups.get(key) ?? [];
    list.push(fact);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      factIds: rows.map((row) => row.id),
      outboxIds: rows.map((row) => row.outbox_id),
    }));
}

function buildExport(db: AppDatabase, organizationId: string, metricId: AnalyticsMetricId, facts: FactRow[]) {
  const grouped = groupFacts(metricId, facts);
  const released = grouped.filter((cell) => cell.count >= ANALYTICS_CELL_MINIMUM);
  const suppressed = grouped.filter((cell) => cell.count < ANALYTICS_CELL_MINIMUM).map((cell) => ({ key: cell.key, count: cell.count }));
  const body = { metricId, cells: released.map((cell) => ({ key: cell.key, count: cell.count })) };
  const directIdentifierFound = containsDirectIdentifier(db, organizationId, JSON.stringify(body));
  const lineage = {
    metricId,
    metricVersion: ANALYTICS_METRICS_VERSION,
    cells: directIdentifierFound
      ? []
      : released.map((cell) => ({ key: cell.key, count: cell.count, factIds: cell.factIds, outboxIds: cell.outboxIds })),
  };
  const assessment: AnalyticsAssessment = {
    version: ANALYTICS_REID_VERSION,
    cellMinimum: ANALYTICS_CELL_MINIMUM,
    directIdentifierFound,
    suppressed,
    text: directIdentifierFound
      ? "A direct identifier was found in the count. The export is withheld. This is not a patient list."
      : "Cells below 5 are suppressed. The released cells are counts of de-identified events. This is not a patient list.",
  };
  return {
    decision: directIdentifierFound ? ("withhold" as const) : ("release" as const),
    body: directIdentifierFound ? null : body,
    lineage,
    assessment,
  };
}

function loadExports(db: AppDatabase, organizationId: string): AnalyticsExport[] {
  return all<{ id: string; metric_id: string; decision: string; body_json: string | null; lineage_json: string; assessment_json: string }>(
    db,
    `SELECT id, metric_id, decision, body_json, lineage_json, assessment_json FROM analytics_exports WHERE organization_id = ? ORDER BY created_at, id`,
    organizationId,
  ).map((row) => ({
    exportId: row.id,
    metricId: row.metric_id as AnalyticsMetricId,
    decision: row.decision === "withhold" ? "withhold" : "release",
    body: row.body_json ? (JSON.parse(row.body_json) as AnalyticsExport["body"]) : null,
    lineage: JSON.parse(row.lineage_json) as AnalyticsExport["lineage"],
    assessment: JSON.parse(row.assessment_json) as AnalyticsAssessment,
  }));
}

export function readAnalytics(db: AppDatabase, ctx: SessionContext): AnalyticsView {
  assertAnalytics(db, ctx, "analytics.read");
  const facts = loadFacts(db, ctx.organizationId);
  const view: AnalyticsView = {
    governanceVersion: ANALYTICS_GOVERNANCE_VERSION,
    deidVersion: ANALYTICS_DEID_VERSION,
    metricVersion: ANALYTICS_METRICS_VERSION,
    reidVersion: ANALYTICS_REID_VERSION,
    factCount: facts.length,
    facts: facts.map(toFact),
    exports: loadExports(db, ctx.organizationId),
  };
  writeAudit(db, ctx, { action: "analytics.read", resourceType: "AnalyticsMart", resourceId: ctx.organizationId, outcome: "success" });
  return view;
}

export function ingestAnalytics(db: AppDatabase, ctx: SessionContext, idempotencyKey: string) {
  assertKey(idempotencyKey);
  assertAnalytics(db, ctx, "analytics.ingest");
  const requestHash = canonicalHash({ organizationId: ctx.organizationId, action: "ingest" });
  return transaction(db, () => {
    const existing = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(existing.response_json) as { copied: number; governanceVersion: string; deidVersion: string };
    }
    const pending = all<{ id: string; event_type: string; payload_json: string; created_at: string }>(
      db,
      `SELECT o.id, o.event_type, o.payload_json, o.created_at
       FROM outbox o
       WHERE o.organization_id = ?
         AND NOT EXISTS (SELECT 1 FROM analytics_facts f WHERE f.organization_id = o.organization_id AND f.outbox_id = o.id)
       ORDER BY o.created_at, o.id`,
      ctx.organizationId,
    );
    const now = new Date().toISOString();
    for (const event of pending) {
      const reduced = deidentify(event.payload_json);
      execute(
        db,
        `INSERT INTO analytics_facts (id, organization_id, outbox_id, event_type, facility_id, kept_json, dropped_keys_json, source_hash, deid_version, ingested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `af_${randomUUID()}`,
        ctx.organizationId,
        event.id,
        event.event_type,
        reduced.facilityId,
        JSON.stringify(reduced.kept),
        JSON.stringify(reduced.dropped),
        canonicalHash(reduced.kept),
        ANALYTICS_DEID_VERSION,
        now,
      );
    }
    const saved = { copied: pending.length, governanceVersion: ANALYTICS_GOVERNANCE_VERSION, deidVersion: ANALYTICS_DEID_VERSION };
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'analytics.ingest', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ copied: pending.length }),
      now,
    );
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    writeAudit(db, ctx, { action: "analytics.ingest", resourceType: "AnalyticsMart", resourceId: ctx.organizationId, outcome: "success" });
    return saved;
  });
}

export function exportAnalytics(db: AppDatabase, ctx: SessionContext, input: { metricId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAnalytics(db, ctx, "analytics.export");
  if (!isMetric(input.metricId)) throw new ValidationError("code");
  const metricId = input.metricId;
  const requestHash = canonicalHash({ organizationId: ctx.organizationId, metricId });
  return transaction(db, () => {
    const existing = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(existing.response_json) as AnalyticsExport;
    }
    const facts = loadFacts(db, ctx.organizationId);
    const built = buildExport(db, ctx.organizationId, metricId, facts);
    const exportId = `ax_${randomUUID()}`;
    const now = new Date().toISOString();
    const saved: AnalyticsExport = { exportId, metricId, ...built };
    execute(
      db,
      `INSERT INTO analytics_exports (id, organization_id, metric_id, decision, body_json, lineage_json, assessment_json, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      exportId,
      ctx.organizationId,
      metricId,
      saved.decision,
      saved.body ? JSON.stringify(saved.body) : null,
      JSON.stringify(saved.lineage),
      JSON.stringify(saved.assessment),
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'analytics.export', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ exportId }),
      now,
    );
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    writeAudit(db, ctx, { action: "analytics.export", resourceType: "AnalyticsExport", resourceId: exportId, outcome: "success" });
    return saved;
  });
}
