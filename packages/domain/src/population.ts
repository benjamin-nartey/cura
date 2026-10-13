import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { containsDirectIdentifier } from "./analytics";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";

export const POPULATION_JURISDICTION_VERSION = "population-jurisdiction-2026.10";
export const POPULATION_PRIVACY_VERSION = "population-privacy-2026.10";
export const POPULATION_COHORT_VERSION = "population-cohorts-2026.10";
export const POPULATION_CELL_MINIMUM = 5;

const TAGS = ["local-synthetic", "restricted"] as const;
const CHRONIC_CODES = ["E11.9", "I50.9", "I10", "J45.909"] as const;

export type PopulationTag = (typeof TAGS)[number];
export type PopulationCohortId = "chronic-problems" | "recorded-systolic" | "vaccination" | "facility-map";
export type PopulationCohortStatus = "suppressed" | "released" | "not-stored";

export type PopulationCohort = {
  id: PopulationCohortId;
  label: string;
  status: PopulationCohortStatus;
  total: number | null;
  facilities: { facilityId: string; count: number }[];
  text: string;
};

export type PopulationBody = {
  decision: "evaluated" | "withheld";
  text: string;
  cohorts: PopulationCohort[];
};

export type PopulationView = {
  built: boolean;
  version: number;
  builtAt: string | null;
  stale: boolean;
  jurisdiction: string | null;
  jurisdictionVersion: string;
  privacyVersion: string;
  cohortVersion: string;
  cellMinimum: number;
  state: PopulationBody | null;
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function isTag(value: string): value is PopulationTag {
  return (TAGS as readonly string[]).includes(value);
}

function assertAuditor(db: AppDatabase, ctx: SessionContext, action: string) {
  if (ctx.role !== "auditor" || ctx.purposeOfUse !== "AUDIT") {
    writeAudit(db, ctx, { action, resourceType: "PopulationSnapshot", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function jurisdictionOf(db: AppDatabase, organizationId: string) {
  return get<{ jurisdiction: string | null }>(db, `SELECT jurisdiction FROM organizations WHERE id = ?`, organizationId)?.jurisdiction ?? null;
}

function facilityCounts(db: AppDatabase, organizationId: string, sql: string, ...params: Array<string | number | null>) {
  return all<{ facility_id: string; c: number }>(db, sql, organizationId, ...params);
}

function releaseCounts(groups: { facilityId: string; count: number }[], total: number) {
  const facilities = groups.filter((group) => group.count >= POPULATION_CELL_MINIMUM);
  const shown = facilities.reduce((sum, group) => sum + group.count, 0);
  const totalReleased = total >= POPULATION_CELL_MINIMUM && total === shown;
  return { facilities, total: totalReleased ? total : null, released: totalReleased };
}

function chronicCohort(db: AppDatabase, organizationId: string): PopulationCohort {
  const rows = facilityCounts(
    db,
    organizationId,
    `SELECT facility_id, COUNT(DISTINCT patient_id) AS c
     FROM conditions
     WHERE organization_id = ? AND clinical_status = 'active' AND code IN (${CHRONIC_CODES.map(() => "?").join(",")})
     GROUP BY facility_id`,
    ...CHRONIC_CODES,
  );
  const totalRow = get<{ c: number }>(
    db,
    `SELECT COUNT(DISTINCT patient_id) AS c FROM conditions
     WHERE organization_id = ? AND clinical_status = 'active' AND code IN (${CHRONIC_CODES.map(() => "?").join(",")})`,
    organizationId,
    ...CHRONIC_CODES,
  );
  const judged = releaseCounts(
    rows.map((row) => ({ facilityId: row.facility_id, count: Number(row.c) })),
    Number(totalRow?.c ?? 0),
  );
  if (!judged.released) {
    return {
      id: "chronic-problems",
      label: "Stored chronic problems",
      status: "suppressed",
      total: null,
      facilities: [],
      text: "Below the minimum of 5. No count is shown. This is not a case list or a diagnosis.",
    };
  }
  return {
    id: "chronic-problems",
    label: "Stored chronic problems",
    status: "released",
    total: judged.total,
    facilities: judged.facilities,
    text: `${judged.total} patients have a stored problem in the pinned chronic set. This is not a case list or a diagnosis.`,
  };
}

function systolicCohort(db: AppDatabase, organizationId: string): PopulationCohort {
  const rows = facilityCounts(
    db,
    organizationId,
    `SELECT facility_id, COUNT(DISTINCT patient_id) AS c FROM observations WHERE organization_id = ? AND code = '8480-6' GROUP BY facility_id`,
  );
  const totalRow = get<{ c: number }>(
    db,
    `SELECT COUNT(DISTINCT patient_id) AS c FROM observations WHERE organization_id = ? AND code = '8480-6'`,
    organizationId,
  );
  const judged = releaseCounts(
    rows.map((row) => ({ facilityId: row.facility_id, count: Number(row.c) })),
    Number(totalRow?.c ?? 0),
  );
  if (!judged.released) {
    return {
      id: "recorded-systolic",
      label: "Recorded systolic results",
      status: "suppressed",
      total: null,
      facilities: [],
      text: "Below the minimum of 5. No count is shown. This is not a case list or a diagnosis.",
    };
  }
  return {
    id: "recorded-systolic",
    label: "Recorded systolic results",
    status: "released",
    total: judged.total,
    facilities: judged.facilities,
    text: `${judged.total} patients have a stored systolic result. This is not a case list or a diagnosis.`,
  };
}

function storedCohorts(db: AppDatabase, organizationId: string): PopulationCohort[] {
  return [
    chronicCohort(db, organizationId),
    systolicCohort(db, organizationId),
    {
      id: "vaccination",
      label: "Vaccination",
      status: "not-stored",
      total: null,
      facilities: [],
      text: "No immunization rows are stored. A vaccination count is not calculated.",
    },
    {
      id: "facility-map",
      label: "Facility map",
      status: "not-stored",
      total: null,
      facilities: [],
      text: "No facility coordinate is stored. A map trend is not calculated.",
    },
  ];
}

function compose(db: AppDatabase, organizationId: string, jurisdiction: string | null): PopulationBody {
  if (jurisdiction !== "local-synthetic") {
    const text = jurisdiction
      ? "The jurisdiction tag is restricted. Counts are not released."
      : "No jurisdiction tag is stored for secondary use. Counts are not released.";
    return { decision: "withheld", text, cohorts: [] };
  }
  const cohorts = storedCohorts(db, organizationId);
  const body: PopulationBody = {
    decision: "evaluated",
    text: "Counts use stored rows in this organization. A group below 5 is not shown. This is not a case list.",
    cohorts,
  };
  if (containsDirectIdentifier(db, organizationId, JSON.stringify(body))) {
    return {
      decision: "withheld",
      text: "A direct identifier was found in the count. Counts are not released.",
      cohorts: [],
    };
  }
  return body;
}

function sourceHash(body: PopulationBody, jurisdiction: string | null) {
  return canonicalHash({ jurisdiction, body });
}

type StateRow = { version: number; jurisdiction: string | null; source_hash: string; payload_json: string; built_at: string };

function readRow(db: AppDatabase, organizationId: string) {
  return get<StateRow>(
    db,
    `SELECT version, jurisdiction, source_hash, payload_json, built_at FROM population_state WHERE organization_id = ?`,
    organizationId,
  );
}

function toView(jurisdiction: string | null, row: StateRow | undefined, currentHash: string): PopulationView {
  const base = {
    jurisdiction,
    jurisdictionVersion: POPULATION_JURISDICTION_VERSION,
    privacyVersion: POPULATION_PRIVACY_VERSION,
    cohortVersion: POPULATION_COHORT_VERSION,
    cellMinimum: POPULATION_CELL_MINIMUM,
  };
  if (!row) {
    return { ...base, built: false, version: 0, builtAt: null, stale: true, state: null };
  }
  return {
    ...base,
    built: true,
    version: row.version,
    builtAt: row.built_at,
    stale: row.source_hash !== currentHash,
    state: JSON.parse(row.payload_json) as PopulationBody,
  };
}

export function readPopulation(db: AppDatabase, ctx: SessionContext): PopulationView {
  assertAuditor(db, ctx, "population.read");
  const jurisdiction = jurisdictionOf(db, ctx.organizationId);
  const current = compose(db, ctx.organizationId, jurisdiction);
  const view = toView(jurisdiction, readRow(db, ctx.organizationId), sourceHash(current, jurisdiction));
  writeAudit(db, ctx, { action: "population.read", resourceType: "PopulationSnapshot", resourceId: ctx.organizationId, outcome: "success" });
  return view;
}

export function recordPopulationJurisdiction(db: AppDatabase, ctx: SessionContext, input: { tag: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx, "population.jurisdiction");
  if (!isTag(input.tag)) throw new ValidationError("code");
  const requestHash = canonicalHash({ organizationId: ctx.organizationId, tag: input.tag });
  return transaction(db, () => {
    const existing = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(existing.response_json) as { tag: PopulationTag };
    }
    const now = new Date().toISOString();
    execute(db, `UPDATE organizations SET jurisdiction = ? WHERE id = ?`, input.tag, ctx.organizationId);
    const saved = { tag: input.tag };
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'population.jurisdiction', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ tag: input.tag }),
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
    writeAudit(db, ctx, { action: "population.jurisdiction", resourceType: "Organization", resourceId: ctx.organizationId, outcome: "success" });
    return saved;
  });
}

export function buildPopulation(db: AppDatabase, ctx: SessionContext, idempotencyKey: string) {
  assertKey(idempotencyKey);
  assertAuditor(db, ctx, "population.build");
  const jurisdiction = jurisdictionOf(db, ctx.organizationId);
  const body = compose(db, ctx.organizationId, jurisdiction);
  const hash = sourceHash(body, jurisdiction);
  const requestHash = canonicalHash({ organizationId: ctx.organizationId, sourceHash: hash });
  return transaction(db, () => {
    const existing = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(existing.response_json) as PopulationView;
    }
    const current = readRow(db, ctx.organizationId);
    const builtAt = new Date().toISOString();
    let stored = current;
    if (!current || current.source_hash !== hash) {
      const version = (current?.version ?? 0) + 1;
      const payload = JSON.stringify(body);
      if (current) {
        execute(
          db,
          `UPDATE population_state SET version = ?, jurisdiction = ?, source_hash = ?, payload_json = ?, built_at = ? WHERE organization_id = ?`,
          version,
          jurisdiction,
          hash,
          payload,
          builtAt,
          ctx.organizationId,
        );
      } else {
        execute(
          db,
          `INSERT INTO population_state (organization_id, version, jurisdiction, source_hash, payload_json, built_at) VALUES (?, ?, ?, ?, ?, ?)`,
          ctx.organizationId,
          version,
          jurisdiction,
          hash,
          payload,
          builtAt,
        );
      }
      execute(
        db,
        `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'population.build', ?, ?)`,
        randomUUID(),
        ctx.organizationId,
        JSON.stringify({ version }),
        builtAt,
      );
      stored = { version, jurisdiction, source_hash: hash, payload_json: payload, built_at: builtAt };
    }
    const result = toView(jurisdiction, stored, hash);
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(result),
      builtAt,
    );
    writeAudit(db, ctx, { action: "population.build", resourceType: "PopulationSnapshot", resourceId: ctx.organizationId, outcome: "success" });
    return result;
  });
}
