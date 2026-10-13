import { randomUUID } from "node:crypto";
import type { Chart, EvidenceView, PatientStateBody, SessionContext, SourceTable } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { getChart } from "./chart";
import { all, get, run, type AppDatabase } from "./db";
import { ForbiddenError, ValidationError } from "./errors";
import { canReadChart } from "./session";

const LABELS: Record<SourceTable, string> = {
  observations: "Result",
  conditions: "Problem",
  allergies: "Allergy",
  medications: "Medication",
  encounters: "Encounter",
  appointments: "Visit",
  device_readings: "Device reading",
};

export function renderCitation(sourceTable: SourceTable, sourceId: string) {
  return `${LABELS[sourceTable]} · ${sourceId}`;
}

export function rejectUncitedClaim(citations: unknown[]) {
  if (citations.length === 0) throw new ValidationError("invalid", "A claim needs a source citation.");
}

export function sourceContentHash(chart: Chart, table: SourceTable, id: string) {
  if (table === "observations") {
    const row = chart.observations.find((item) => item.id === id);
    if (!row) return null;
    return canonicalHash({
      id: row.id,
      code: row.code,
      value: row.value,
      unit: row.unit,
      effectiveAt: row.effectiveAt,
      interpretation: row.interpretation,
    });
  }
  if (table === "conditions") {
    const row = chart.conditions.find((item) => item.id === id);
    if (!row) return null;
    return canonicalHash({ id: row.id, code: row.code, display: row.display, clinicalStatus: row.clinicalStatus });
  }
  if (table === "allergies") {
    const row = chart.allergies.find((item) => item.id === id);
    if (!row) return null;
    return canonicalHash({ id: row.id, display: row.display, reaction: row.reaction });
  }
  if (table === "medications") {
    const row = chart.medications.find((item) => item.id === id);
    if (!row) return null;
    return canonicalHash({ id: row.id, display: row.display, dose: row.dose, status: row.status });
  }
  if (table === "encounters") {
    const row = chart.encounters.find((item) => item.id === id);
    if (!row) return null;
    return canonicalHash({ id: row.id, status: row.status, version: row.version, reason: row.reason });
  }
  if (table === "device_readings") return null;
  const row = chart.appointments.find((item) => item.id === id);
  if (!row) return null;
  return canonicalHash({ id: row.id, status: row.status, startsAt: row.startsAt, reason: row.reason });
}

type Desired = { text: string; sourceTable: SourceTable; sourceId: string };

function desiredClaims(body: PatientStateBody): Desired[] {
  return [...body.problems, ...body.medications, ...body.allergies, ...body.recentResults, ...body.careGaps, ...body.pending];
}

export function syncPatientEvidence(db: AppDatabase, ctx: SessionContext, chart: Chart, body: PatientStateBody) {
  if (!ctx.facilityId) throw new ForbiddenError();
  const facilityId = ctx.facilityId;
  const now = new Date().toISOString();
  let filed = 0;
  for (const item of desiredClaims(body)) {
    rejectUncitedClaim([item.sourceId]);
    const contentHash = sourceContentHash(chart, item.sourceTable, item.sourceId);
    if (!contentHash) continue;
    const textHash = canonicalHash(item.text);
    const existing = get<{ id: string }>(
      db,
      `SELECT c.id FROM evidence_claims c
       JOIN evidence_citations cit ON cit.claim_id = c.id
       WHERE c.organization_id = ? AND c.facility_id = ? AND c.patient_id = ?
         AND c.text_hash = ? AND c.evidence_state = 'supported'
         AND cit.source_table = ? AND cit.source_id = ? AND cit.content_hash = ?`,
      ctx.organizationId,
      facilityId,
      chart.patient.id,
      textHash,
      item.sourceTable,
      item.sourceId,
      contentHash,
    );
    if (existing) continue;
    const id = `clm_${randomUUID()}`;
    run(
      db,
      `INSERT INTO evidence_claims (id, organization_id, facility_id, patient_id, claim_text, text_hash, evidence_state, author_id, filed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'supported', ?, ?)`,
      id,
      ctx.organizationId,
      facilityId,
      chart.patient.id,
      item.text,
      textHash,
      ctx.userId,
      now,
    );
    run(
      db,
      `INSERT INTO evidence_citations (claim_id, organization_id, facility_id, source_table, source_id, content_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      ctx.organizationId,
      facilityId,
      item.sourceTable,
      item.sourceId,
      contentHash,
    );
    run(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'evidence.filed', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({
        organizationId: ctx.organizationId,
        facilityId,
        patientId: chart.patient.id,
        claimId: id,
        sourceTable: item.sourceTable,
        sourceId: item.sourceId,
        evidenceState: "supported",
      }),
      now,
    );
    filed += 1;
  }
  const invalidated = refreshEvidenceStates(db, ctx, chart);
  if (filed > 0) {
    writeAudit(db, ctx, { action: "evidence.file", resourceType: "Evidence", resourceId: chart.patient.id, outcome: "success" });
  }
  return { filed, invalidated };
}

function refreshEvidenceStates(db: AppDatabase, ctx: SessionContext, chart: Chart) {
  if (!ctx.facilityId) throw new ForbiddenError();
  const facilityId = ctx.facilityId;
  const rows = all<{ claim_id: string; source_table: SourceTable; source_id: string; content_hash: string }>(
    db,
    `SELECT cit.claim_id, cit.source_table, cit.source_id, cit.content_hash
     FROM evidence_citations cit
     JOIN evidence_claims c ON c.id = cit.claim_id
     WHERE c.organization_id = ? AND c.facility_id = ? AND c.patient_id = ? AND c.evidence_state = 'supported'`,
    ctx.organizationId,
    ctx.facilityId,
    chart.patient.id,
  );
  const stale = new Set<string>();
  for (const row of rows) {
    const hash = sourceContentHash(chart, row.source_table, row.source_id);
    if (!hash || hash !== row.content_hash) stale.add(row.claim_id);
  }
  if (stale.size === 0) return 0;
  const now = new Date().toISOString();
  for (const claimId of stale) {
    run(db, `UPDATE evidence_claims SET evidence_state = 'invalidated' WHERE id = ? AND facility_id = ?`, claimId, ctx.facilityId);
    run(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'evidence.invalidated', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ organizationId: ctx.organizationId, facilityId: ctx.facilityId, patientId: chart.patient.id, claimId, evidenceState: "invalidated" }),
      now,
    );
  }
  writeAudit(db, ctx, { action: "evidence.invalidate", resourceType: "Evidence", resourceId: chart.patient.id, outcome: "success" });
  return stale.size;
}

export function evidenceFromChart(db: AppDatabase, ctx: SessionContext, chart: Chart): EvidenceView {
  if (!canReadChart(ctx) || !ctx.facilityId) throw new ForbiddenError();
  refreshEvidenceStates(db, ctx, chart);
  const rows = all<{ id: string; claim_text: string; evidence_state: EvidenceView["claims"][number]["evidenceState"]; source_table: SourceTable; source_id: string }>(
    db,
    `SELECT c.id, c.claim_text, c.evidence_state, cit.source_table, cit.source_id
     FROM evidence_claims c
     JOIN evidence_citations cit ON cit.claim_id = c.id
     WHERE c.organization_id = ? AND c.facility_id = ? AND c.patient_id = ?
     ORDER BY CASE c.evidence_state WHEN 'supported' THEN 0 WHEN 'insufficient' THEN 1 ELSE 2 END, c.filed_at, c.id`,
    ctx.organizationId,
    ctx.facilityId,
    chart.patient.id,
  );
  const claims: EvidenceView["claims"] = [];
  for (const row of rows) {
    const current = claims.find((item) => item.id === row.id);
    const citation = { sourceTable: row.source_table, sourceId: row.source_id, label: renderCitation(row.source_table, row.source_id) };
    if (current) current.citations.push(citation);
    else claims.push({ id: row.id, text: row.claim_text, evidenceState: row.evidence_state, citations: [citation] });
  }
  writeAudit(db, ctx, { action: "evidence.read", resourceType: "Evidence", resourceId: chart.patient.id, outcome: "success" });
  return { patientId: chart.patient.id, claims };
}

export function readEvidence(db: AppDatabase, ctx: SessionContext, patientId: string, now = new Date()): EvidenceView | null {
  const chart = getChart(db, ctx, patientId, now);
  if (!chart) return null;
  return evidenceFromChart(db, ctx, chart);
}
