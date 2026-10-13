import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { containsDirectIdentifier } from "./analytics";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import type { PopulationBody } from "./population";

export const RESEARCH_ETHICS_NOTE = "No ethics board decision is stored. This label is not an approval.";
export const RESEARCH_NOTEBOOK_NOTE = "No analysis notebook is running. The frozen payload is the count snapshot.";

export type ResearchDataset = {
  id: string;
  workspaceId: string;
  version: number;
  populationVersion: number;
  sourceHash: string;
  payload: PopulationBody;
  authorId: string;
  createdAt: string;
  notebookNote: string;
};

export type ResearchExport = {
  id: string;
  datasetId: string;
  status: "awaiting-approval" | "approved" | "declined";
  requesterId: string;
  approverId: string | null;
  createdAt: string;
  decidedAt: string | null;
  body: PopulationBody | null;
};

export type ResearchWorkspace = {
  id: string;
  title: string;
  protocolLabel: string;
  ethicsStatus: "not-reviewed";
  ethicsNote: string;
  purposeOfUse: "AUDIT";
  authorId: string;
  createdAt: string;
  datasets: ResearchDataset[];
  exports: ResearchExport[];
};

export type ResearchView = {
  workspaces: ResearchWorkspace[];
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function clean(value: string, min: number, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new ValidationError();
  return trimmed;
}

function assertAuditor(db: AppDatabase, ctx: SessionContext, action: string) {
  if (ctx.role !== "auditor" || ctx.purposeOfUse !== "AUDIT") {
    writeAudit(db, ctx, { action, resourceType: "ResearchWorkspace", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
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
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(body),
    now,
  );
}

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: Record<string, string | number>, now: string) {
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    eventType,
    JSON.stringify(payload),
    now,
  );
}

function toDataset(row: {
  id: string;
  workspace_id: string;
  version: number;
  population_version: number;
  source_hash: string;
  payload_json: string;
  author_id: string;
  created_at: string;
}): ResearchDataset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    version: row.version,
    populationVersion: row.population_version,
    sourceHash: row.source_hash,
    payload: JSON.parse(row.payload_json) as PopulationBody,
    authorId: row.author_id,
    createdAt: row.created_at,
    notebookNote: RESEARCH_NOTEBOOK_NOTE,
  };
}

function toExport(
  row: {
    id: string;
    dataset_id: string;
    status: string;
    requester_id: string;
    approver_id: string | null;
    created_at: string;
    decided_at: string | null;
  },
  datasets: Map<string, ResearchDataset>,
): ResearchExport {
  const status = row.status === "approved" || row.status === "declined" ? row.status : "awaiting-approval";
  return {
    id: row.id,
    datasetId: row.dataset_id,
    status,
    requesterId: row.requester_id,
    approverId: row.approver_id,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    body: status === "approved" ? datasets.get(row.dataset_id)?.payload ?? null : null,
  };
}

export function readResearch(db: AppDatabase, ctx: SessionContext): ResearchView {
  assertAuditor(db, ctx, "research.read");
  const workspaces = all<{
    id: string;
    title: string;
    protocol_label: string;
    ethics_status: "not-reviewed";
    ethics_note: string;
    purpose_of_use: "AUDIT";
    author_id: string;
    created_at: string;
  }>(
    db,
    `SELECT id, title, protocol_label, ethics_status, ethics_note, purpose_of_use, author_id, created_at
     FROM research_workspaces WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const datasetRows = all<{
    id: string;
    workspace_id: string;
    version: number;
    population_version: number;
    source_hash: string;
    payload_json: string;
    author_id: string;
    created_at: string;
  }>(
    db,
    `SELECT id, workspace_id, version, population_version, source_hash, payload_json, author_id, created_at
     FROM research_datasets WHERE organization_id = ? ORDER BY version, id`,
    ctx.organizationId,
  );
  const datasets = datasetRows.map(toDataset);
  const byWorkspace = new Map<string, ResearchDataset[]>();
  const byId = new Map(datasets.map((item) => [item.id, item]));
  for (const dataset of datasets) {
    const list = byWorkspace.get(dataset.workspaceId) ?? [];
    list.push(dataset);
    byWorkspace.set(dataset.workspaceId, list);
  }
  const exportRows = all<{
    id: string;
    dataset_id: string;
    status: string;
    requester_id: string;
    approver_id: string | null;
    created_at: string;
    decided_at: string | null;
  }>(
    db,
    `SELECT id, dataset_id, status, requester_id, approver_id, created_at, decided_at
     FROM research_exports WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const exports = exportRows.map((row) => toExport(row, byId));
  const exportsByDataset = new Map<string, ResearchExport[]>();
  for (const item of exports) {
    const list = exportsByDataset.get(item.datasetId) ?? [];
    list.push(item);
    exportsByDataset.set(item.datasetId, list);
  }
  const view: ResearchView = {
    workspaces: workspaces.map((row) => ({
      id: row.id,
      title: row.title,
      protocolLabel: row.protocol_label,
      ethicsStatus: "not-reviewed",
      ethicsNote: row.ethics_note,
      purposeOfUse: "AUDIT",
      authorId: row.author_id,
      createdAt: row.created_at,
      datasets: byWorkspace.get(row.id) ?? [],
      exports: (byWorkspace.get(row.id) ?? []).flatMap((dataset) => exportsByDataset.get(dataset.id) ?? []),
    })),
  };
  writeAudit(db, ctx, { action: "research.read", resourceType: "ResearchWorkspace", resourceId: ctx.organizationId, outcome: "success" });
  return view;
}

export function openResearchWorkspace(
  db: AppDatabase,
  ctx: SessionContext,
  input: { title: string; protocolLabel: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx, "research.workspace");
  const title = clean(input.title, 2, 80);
  const protocolLabel = clean(input.protocolLabel, 2, 80);
  const hash = canonicalHash({ organizationId: ctx.organizationId, title, protocolLabel });
  const existing = replay<{ workspaceId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const workspaceId = `rws_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { workspaceId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO research_workspaces (id, organization_id, title, protocol_label, ethics_status, ethics_note, purpose_of_use, author_id, created_at)
       VALUES (?, ?, ?, ?, 'not-reviewed', ?, 'AUDIT', ?, ?)`,
      workspaceId,
      ctx.organizationId,
      title,
      protocolLabel,
      RESEARCH_ETHICS_NOTE,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "research.workspace", { workspaceId }, now);
    writeAudit(db, ctx, { action: "research.workspace", resourceType: "ResearchWorkspace", resourceId: workspaceId, outcome: "success" });
  });
  return saved;
}

export function snapshotResearchDataset(db: AppDatabase, ctx: SessionContext, input: { workspaceId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx, "research.dataset");
  const workspace = get<{ id: string }>(
    db,
    `SELECT id FROM research_workspaces WHERE id = ? AND organization_id = ?`,
    input.workspaceId,
    ctx.organizationId,
  );
  if (!workspace) throw new NotFoundError();
  const population = get<{ version: number; source_hash: string; payload_json: string }>(
    db,
    `SELECT version, source_hash, payload_json FROM population_state WHERE organization_id = ?`,
    ctx.organizationId,
  );
  if (!population) throw new ValidationError();
  const payload = JSON.parse(population.payload_json) as PopulationBody;
  if (payload.decision !== "evaluated") throw new ValidationError();
  if (containsDirectIdentifier(db, ctx.organizationId, population.payload_json)) throw new ValidationError();
  const hash = canonicalHash({ workspaceId: workspace.id, sourceHash: population.source_hash });
  const existing = replay<{ datasetId: string; version: number }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const current = get<{ id: string; version: number; source_hash: string }>(
    db,
    `SELECT id, version, source_hash FROM research_datasets WHERE workspace_id = ? AND organization_id = ? ORDER BY version DESC LIMIT 1`,
    workspace.id,
    ctx.organizationId,
  );
  if (current && current.source_hash === population.source_hash) {
    const saved = { datasetId: current.id, version: current.version };
    const now = new Date().toISOString();
    transaction(db, () => {
      saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
      writeAudit(db, ctx, { action: "research.dataset", resourceType: "ResearchDataset", resourceId: current.id, outcome: "success" });
    });
    return saved;
  }
  const version = (current?.version ?? 0) + 1;
  const datasetId = `rds_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { datasetId, version };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO research_datasets (id, organization_id, workspace_id, version, population_version, source_hash, payload_json, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      datasetId,
      ctx.organizationId,
      workspace.id,
      version,
      population.version,
      population.source_hash,
      population.payload_json,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "research.dataset", { datasetId, version }, now);
    writeAudit(db, ctx, { action: "research.dataset", resourceType: "ResearchDataset", resourceId: datasetId, outcome: "success" });
  });
  return saved;
}

export function requestResearchExport(db: AppDatabase, ctx: SessionContext, input: { datasetId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx, "research.export");
  const dataset = get<{ id: string }>(
    db,
    `SELECT id FROM research_datasets WHERE id = ? AND organization_id = ?`,
    input.datasetId,
    ctx.organizationId,
  );
  if (!dataset) throw new NotFoundError();
  const hash = canonicalHash({ datasetId: dataset.id, action: "request" });
  const existing = replay<{ exportId: string; status: "awaiting-approval" }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const exportId = `rex_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { exportId, status: "awaiting-approval" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO research_exports (id, organization_id, dataset_id, status, requester_id, approver_id, created_at, decided_at)
       VALUES (?, ?, ?, 'awaiting-approval', ?, NULL, ?, NULL)`,
      exportId,
      ctx.organizationId,
      dataset.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "research.export", { exportId, status: "awaiting-approval" }, now);
    writeAudit(db, ctx, { action: "research.export", resourceType: "ResearchExport", resourceId: exportId, outcome: "success" });
  });
  return saved;
}

export function decideResearchExport(
  db: AppDatabase,
  ctx: SessionContext,
  input: { exportId: string; decision: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx, "research.decision");
  if (input.decision !== "approve" && input.decision !== "decline") throw new ValidationError("code");
  const hash = canonicalHash({ exportId: input.exportId, decision: input.decision });
  const existing = replay<{ exportId: string; status: "approved" | "declined" }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const row = get<{ id: string; status: string; requester_id: string }>(
    db,
    `SELECT id, status, requester_id FROM research_exports WHERE id = ? AND organization_id = ?`,
    input.exportId,
    ctx.organizationId,
  );
  if (!row) throw new NotFoundError();
  if (row.requester_id === ctx.userId) throw new ForbiddenError();
  if (row.status !== "awaiting-approval") throw new ConflictError("conflict", "That export already has a decision.");
  const status = input.decision === "approve" ? "approved" : "declined";
  const now = new Date().toISOString();
  const saved = { exportId: row.id, status };
  transaction(db, () => {
    const changed = execute(
      db,
      `UPDATE research_exports SET status = ?, approver_id = ?, decided_at = ? WHERE id = ? AND status = 'awaiting-approval' AND requester_id <> ?`,
      status,
      ctx.userId,
      now,
      row.id,
      ctx.userId,
    );
    if (Number(changed.changes) !== 1) throw new ConflictError("conflict", "That export already has a decision.");
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "research.export", { exportId: row.id, status }, now);
    writeAudit(db, ctx, { action: "research.decision", resourceType: "ResearchExport", resourceId: row.id, outcome: "success" });
  });
  return saved;
}
