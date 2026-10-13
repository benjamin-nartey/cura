import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { containsDirectIdentifier } from "./analytics";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart } from "./session";

export const IMAGING_MODALITY_VERSION = "imaging-modality-2026.10";
export const IMAGING_BYTE_LIMIT = 1024;
export const IMAGING_MODALITIES = ["CR", "CT", "DX", "MG", "MR", "NM", "OT", "PT", "RF", "US", "XA"] as const;
export const IMAGING_GATEWAY_NOTE = "No DICOMweb endpoint is connected. Pixel data is not stored.";
export const IMAGING_VIEWER_NOTE = "No image viewer is connected. This page lists stored study metadata.";
export const IMAGING_REPORT_NOTE = "This text was typed into the record. No image was interpreted.";
export const IMAGING_DEID_NOTE = "The release keeps modality and study date. Patient, accession, and description are omitted.";
export const IMAGING_AI_NOTE = "No image was interpreted. Diagnostic imaging AI is not part of this record.";

export type ImagingModality = (typeof IMAGING_MODALITIES)[number];

export type ImagingReleaseBody = {
  modality: ImagingModality;
  studyDate: string;
  facilityId: string;
  text: string;
};

export type ImagingRelease = {
  id: string;
  studyId: string;
  decision: "release" | "withhold";
  body: ImagingReleaseBody | null;
  createdAt: string;
};

export type ImagingReport = {
  id: string;
  studyId: string;
  body: string;
  note: string;
  createdAt: string;
};

export type ImagingStudy = {
  id: string;
  patientId: string;
  accession: string;
  modality: ImagingModality;
  description: string;
  studyDate: string;
  createdAt: string;
  report: ImagingReport | null;
  releases: ImagingRelease[];
};

export type ImagingView = {
  modalityVersion: string;
  gatewayNote: string;
  viewerNote: string;
  aiNote: string;
  studies: ImagingStudy[];
};

export function holdImagingText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function facilityOf(db: AppDatabase, ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "imaging.read", resourceType: "ImagingStudy", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
  return ctx.facilityId;
}

function assertBytes(value: string) {
  if (value.length > IMAGING_BYTE_LIMIT) {
    throw new ValidationError("range", "Pixel data and large objects are not accepted.");
  }
}

function modalityOf(value: string): ImagingModality {
  const found = IMAGING_MODALITIES.find((item) => item === value);
  if (!found) throw new ValidationError("code", "That modality is not in the imaging pin.");
  return found;
}

function studyDateOf(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("invalid", "Use a study date as YYYY-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError();
  return value;
}

function accessionOf(value: string) {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9-]{2,40}$/.test(trimmed)) throw new ValidationError();
  return trimmed;
}

function descriptionOf(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 200) throw new ValidationError("range", "The description must be 200 characters or fewer.");
  return trimmed;
}

function reportText(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 400) throw new ValidationError();
  return trimmed;
}

function requirePatient(db: AppDatabase, ctx: SessionContext, patientId: string, facilityId: string) {
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) throw new NotFoundError();
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

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: Record<string, string>, now: string) {
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

type StudyRow = {
  id: string;
  patient_id: string;
  accession: string;
  modality: ImagingModality;
  description: string;
  study_date: string;
  created_at: string;
};

function loadStudy(db: AppDatabase, ctx: SessionContext, facilityId: string, studyId: string) {
  const row = get<StudyRow>(
    db,
    `SELECT id, patient_id, accession, modality, description, study_date, created_at
     FROM imaging_studies WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    studyId,
    ctx.organizationId,
    facilityId,
  );
  if (!row) throw new NotFoundError();
  return row;
}

export function readImaging(db: AppDatabase, ctx: SessionContext): ImagingView {
  const facilityId = facilityOf(db, ctx);
  writeAudit(db, ctx, { action: "imaging.read", resourceType: "ImagingStudy", resourceId: facilityId, outcome: "success" });
  const studies = all<StudyRow>(
    db,
    `SELECT id, patient_id, accession, modality, description, study_date, created_at
     FROM imaging_studies WHERE organization_id = ? AND facility_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
    facilityId,
  );
  const reports = all<{ id: string; study_id: string; body: string; created_at: string }>(
    db,
    `SELECT id, study_id, body, created_at FROM imaging_reports WHERE organization_id = ? AND facility_id = ?`,
    ctx.organizationId,
    facilityId,
  );
  const releases = all<{ id: string; study_id: string; decision: string; body_json: string | null; created_at: string }>(
    db,
    `SELECT id, study_id, decision, body_json, created_at FROM imaging_releases WHERE organization_id = ? AND facility_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
    facilityId,
  );
  return {
    modalityVersion: IMAGING_MODALITY_VERSION,
    gatewayNote: IMAGING_GATEWAY_NOTE,
    viewerNote: IMAGING_VIEWER_NOTE,
    aiNote: IMAGING_AI_NOTE,
    studies: studies.map((study) => ({
      id: study.id,
      patientId: study.patient_id,
      accession: study.accession,
      modality: study.modality,
      description: study.description,
      studyDate: study.study_date,
      createdAt: study.created_at,
      report: reports
        .filter((report) => report.study_id === study.id)
        .map((report) => ({
          id: report.id,
          studyId: report.study_id,
          body: report.body,
          note: IMAGING_REPORT_NOTE,
          createdAt: report.created_at,
        }))[0] ?? null,
      releases: releases
        .filter((release) => release.study_id === study.id)
        .map((release) => ({
          id: release.id,
          studyId: release.study_id,
          decision: release.decision === "withhold" ? "withhold" : "release",
          body: release.body_json ? (JSON.parse(release.body_json) as ImagingReleaseBody) : null,
          createdAt: release.created_at,
        })),
    })),
  };
}

export function recordImagingStudy(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; accession: string; modality: string; description: string; studyDate: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertBytes(input.description);
  assertBytes(input.accession);
  const facilityId = facilityOf(db, ctx);
  requirePatient(db, ctx, input.patientId, facilityId);
  const accession = accessionOf(input.accession);
  const modality = modalityOf(input.modality);
  const description = descriptionOf(input.description);
  const studyDate = studyDateOf(input.studyDate);
  const hash = canonicalHash({ patientId: input.patientId, accession, modality, description, studyDate });
  const prior = replay<{ studyId: string }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const studyId = `img_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { studyId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO imaging_studies (id, organization_id, facility_id, patient_id, accession, modality, description, study_date, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      studyId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      accession,
      modality,
      description,
      studyDate,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "imaging.study", { studyId }, now);
    writeAudit(db, ctx, { action: "imaging.study", resourceType: "ImagingStudy", resourceId: studyId, outcome: "success" });
  });
  return saved;
}

export function recordImagingReport(
  db: AppDatabase,
  ctx: SessionContext,
  input: { studyId: string; text: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertBytes(input.text);
  const facilityId = facilityOf(db, ctx);
  loadStudy(db, ctx, facilityId, input.studyId);
  const text = reportText(input.text);
  const hash = canonicalHash({ studyId: input.studyId, text });
  const prior = replay<{ reportId: string }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM imaging_reports WHERE study_id = ?`, input.studyId);
  if (existing) throw new ConflictError("open", "A report is already linked to this study.");
  const reportId = `imr_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { reportId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO imaging_reports (id, organization_id, facility_id, study_id, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      reportId,
      ctx.organizationId,
      facilityId,
      input.studyId,
      text,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "imaging.report", { reportId, studyId: input.studyId }, now);
    writeAudit(db, ctx, { action: "imaging.report", resourceType: "ImagingReport", resourceId: reportId, outcome: "success" });
  });
  return saved;
}

export function releaseImagingStudy(db: AppDatabase, ctx: SessionContext, input: { studyId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  const study = loadStudy(db, ctx, facilityId, input.studyId);
  const hash = canonicalHash({ studyId: study.id, modality: study.modality, studyDate: study.study_date });
  const prior = replay<{ releaseId: string; decision: "release" | "withhold" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const body: ImagingReleaseBody = {
    modality: study.modality,
    studyDate: study.study_date,
    facilityId,
    text: IMAGING_DEID_NOTE,
  };
  const identified = containsDirectIdentifier(db, ctx.organizationId, JSON.stringify(body));
  const decision = identified ? "withhold" : "release";
  const releaseId = `imd_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { releaseId, decision };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO imaging_releases (id, organization_id, facility_id, study_id, decision, body_json, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      releaseId,
      ctx.organizationId,
      facilityId,
      study.id,
      decision,
      decision === "release" ? JSON.stringify(body) : null,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "imaging.release", { releaseId, decision }, now);
    writeAudit(db, ctx, { action: "imaging.release", resourceType: "ImagingRelease", resourceId: releaseId, outcome: "success" });
  });
  return saved;
}

export function explainImaging(
  db: AppDatabase,
  ctx: SessionContext,
  input: { studyId: string; idempotencyKey: string },
  adapter?: GatewayAdapter,
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  loadStudy(db, ctx, facilityId, input.studyId);
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Interpret the stored imaging study.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  writeAudit(db, ctx, { action: "imaging.explain", resourceType: "ImagingStudy", resourceId: input.studyId, outcome: "success" });
  return {
    studyId: input.studyId,
    text: holdImagingText(IMAGING_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}
