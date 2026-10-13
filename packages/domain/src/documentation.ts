import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { noteDenial, writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { canReadChart } from "./session";

const AUDIO_LIMIT = 262144;

export type DocumentationSection = {
  id: string;
  text: string;
  authorship: "source-quote" | "clinician-authored";
  sourceQuote: string;
};

export type DocumentationDraft = {
  id: string;
  encounterId: string;
  status: "draft" | "accepted" | "rejected";
  signed: false;
  sections: DocumentationSection[];
};

export type DocumentationView = {
  patientId: string;
  audioRetentionHours: number;
  consentGranted: boolean;
  encounterId: string | null;
  drafts: DocumentationDraft[];
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) throw new ForbiddenError();
  return ctx.facilityId;
}

function quoteBlocks(text: string) {
  const blocks: { start: number; end: number; text: string }[] = [];
  let cursor = 0;
  for (const part of text.split(/\n\s*\n/)) {
    const found = text.indexOf(part, cursor);
    const start = found < 0 ? cursor : found;
    const trimmed = part.trim();
    if (trimmed) {
      const inner = part.indexOf(trimmed);
      const quoteStart = start + Math.max(inner, 0);
      blocks.push({ start: quoteStart, end: quoteStart + trimmed.length, text: trimmed });
    }
    cursor = start + part.length;
  }
  if (blocks.length < 1) throw new ValidationError("invalid", "The note needs a sentence.");
  if (blocks.length > 12) throw new ValidationError("invalid", "The note has too many paragraphs.");
  for (const block of blocks) {
    if (text.slice(block.start, block.end) !== block.text) throw new ValidationError();
  }
  return blocks;
}

type EncounterRow = {
  id: string;
  organization_id: string;
  facility_id: string;
  patient_id: string;
  status: string;
};

function requireEncounter(db: AppDatabase, ctx: SessionContext, encounterId: string, patientId: string) {
  const facilityId = facilityOf(ctx);
  const row = get<EncounterRow>(
    db,
    `SELECT id, organization_id, facility_id, patient_id, status FROM encounters WHERE id = ?`,
    encounterId,
  );
  if (!row) {
    writeAudit(db, ctx, { action: "documentation.read", resourceType: "Encounter", resourceId: encounterId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (row.organization_id !== ctx.organizationId || row.facility_id !== facilityId || row.patient_id !== patientId) {
    noteDenial(db, ctx, "documentation.read", "Encounter", encounterId);
    throw new NotFoundError();
  }
  return { ...row, facilityId };
}

function requireOpen(row: EncounterRow) {
  if (row.status !== "in-progress") throw new ValidationError("invalid", "Documentation is captured on an open encounter.");
}

function consentGranted(db: AppDatabase, encounterId: string) {
  const row = get<{ granted: number }>(
    db,
    `SELECT granted FROM documentation_consents WHERE encounter_id = ? ORDER BY created_at DESC LIMIT 1`,
    encounterId,
  );
  return row?.granted === 1;
}

function retentionHours(db: AppDatabase, organizationId: string) {
  return get<{ audio_retention_hours: number }>(
    db,
    `SELECT audio_retention_hours FROM documentation_settings WHERE organization_id = ?`,
    organizationId,
  )?.audio_retention_hours ?? 0;
}

export function seedDocumentationRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM documentation_settings");
  if ((existing?.c ?? 0) > 0) return;
  for (const organizationId of ["org_harborlight", "org_northwind"]) {
    execute(db, `INSERT INTO documentation_settings (organization_id, audio_retention_hours) VALUES (?, 0)`, organizationId);
  }
}

export function ensureDocumentationPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM documentation_settings");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedDocumentationRecords(db));
}

export function setAudioRetention(db: AppDatabase, ctx: SessionContext, input: { hours: number; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  facilityOf(ctx);
  if (!Number.isInteger(input.hours) || input.hours < 0 || input.hours > 72) {
    throw new ValidationError("invalid", "Audio retention must be 0–72 hours.");
  }
  const requestHash = canonicalHash({ hours: input.hours });
  return transaction(db, () => {
    const replay = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(replay.response_json) as { audioRetentionHours: number };
    }
    execute(
      db,
      `INSERT INTO documentation_settings (organization_id, audio_retention_hours) VALUES (?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET audio_retention_hours = excluded.audio_retention_hours`,
      ctx.organizationId,
      input.hours,
    );
    const saved = { audioRetentionHours: input.hours };
    const now = new Date().toISOString();
    writeAudit(db, ctx, { action: "documentation.retention", resourceType: "Documentation", resourceId: ctx.organizationId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    return saved;
  });
}

export function recordDocumentationConsent(
  db: AppDatabase,
  ctx: SessionContext,
  input: { encounterId: string; patientId: string; granted: boolean; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const encounter = requireEncounter(db, ctx, input.encounterId, input.patientId);
  requireOpen(encounter);
  const requestHash = canonicalHash({ encounterId: input.encounterId, granted: input.granted });
  return transaction(db, () => {
    const replay = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(replay.response_json) as { consentId: string; granted: boolean };
    }
    const consentId = `con_${randomUUID()}`;
    const now = new Date().toISOString();
    execute(
      db,
      `INSERT INTO documentation_consents (id, organization_id, facility_id, patient_id, encounter_id, actor_id, granted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      consentId,
      ctx.organizationId,
      encounter.facilityId,
      encounter.patient_id,
      encounter.id,
      ctx.userId,
      input.granted ? 1 : 0,
      now,
    );
    const saved = { consentId, granted: input.granted };
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'documentation.consent', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ consentId, encounterId: encounter.id, granted: input.granted }),
      now,
    );
    writeAudit(db, ctx, { action: "documentation.consent", resourceType: "DocumentationConsent", resourceId: consentId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    return saved;
  });
}

export function captureDocumentationText(
  db: AppDatabase,
  ctx: SessionContext,
  input: { encounterId: string; patientId: string; text: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const encounter = requireEncounter(db, ctx, input.encounterId, input.patientId);
  requireOpen(encounter);
  const text = input.text.trim();
  if (text.length < 1 || text.length > 4000) throw new ValidationError("invalid", "The note must be 1–4000 characters.");
  if (!consentGranted(db, encounter.id)) throw new ValidationError("invalid", "Consent is required before a draft is captured.");
  const blocks = quoteBlocks(text);
  const requestHash = canonicalHash({ encounterId: encounter.id, textHash: createHash("sha256").update(text).digest("hex") });
  const replay = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    input.idempotencyKey,
  );
  if (replay) {
    if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
    return JSON.parse(replay.response_json) as { draftId: string; captureId: string; status: "draft"; signed: false };
  }
  const captureId = `cap_${randomUUID()}`;
  const draftId = `dft_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { draftId, captureId, status: "draft" as const, signed: false as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO documentation_captures (
         id, organization_id, facility_id, patient_id, encounter_id, actor_id, kind, retention_hours, expires_at,
         content_hash, byte_length, audio_bytes, transcript_text, transcript_origin, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'text', 0, NULL, ?, ?, NULL, ?, 'clinician-typed', ?)`,
      captureId,
      ctx.organizationId,
      encounter.facilityId,
      encounter.patient_id,
      encounter.id,
      ctx.userId,
      createHash("sha256").update(text).digest("hex"),
      Buffer.byteLength(text),
      text,
      now,
    );
    execute(
      db,
      `INSERT INTO documentation_drafts (
         id, capture_id, organization_id, facility_id, patient_id, encounter_id, actor_id, status, signed, created_at, decided_at, decided_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, NULL, NULL)`,
      draftId,
      captureId,
      ctx.organizationId,
      encounter.facilityId,
      encounter.patient_id,
      encounter.id,
      ctx.userId,
      now,
    );
    blocks.forEach((block, position) => {
      execute(
        db,
        `INSERT INTO documentation_sections (id, draft_id, organization_id, position, quote_start, quote_end, text, authorship)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'source-quote')`,
        `sec_${randomUUID()}`,
        draftId,
        ctx.organizationId,
        position,
        block.start,
        block.end,
        block.text,
      );
    });
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'documentation.draft', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ draftId, captureId, encounterId: encounter.id, status: "draft" }),
      now,
    );
    writeAudit(db, ctx, { action: "documentation.capture", resourceType: "DocumentationDraft", resourceId: draftId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
  });
  return saved;
}

export function captureDocumentationAudio(
  db: AppDatabase,
  ctx: SessionContext,
  input: { encounterId: string; patientId: string; audio: Uint8Array; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const encounter = requireEncounter(db, ctx, input.encounterId, input.patientId);
  requireOpen(encounter);
  if (input.audio.byteLength < 1 || input.audio.byteLength > AUDIO_LIMIT) {
    throw new ValidationError("invalid", "Audio must be 1 byte to 256 KB.");
  }
  if (!consentGranted(db, encounter.id)) throw new ValidationError("invalid", "Consent is required before audio is offered.");
  const hours = retentionHours(db, ctx.organizationId);
  const hash = createHash("sha256").update(input.audio).digest("hex");
  const requestHash = canonicalHash({ encounterId: encounter.id, audioHash: hash, hours });
  const replay = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    input.idempotencyKey,
  );
  if (replay) {
    if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
    return JSON.parse(replay.response_json) as { captureId: string; transcript: null; speakers: "unsupported"; retained: boolean };
  }
  const captureId = `cap_${randomUUID()}`;
  const now = new Date().toISOString();
  const retained = hours > 0;
  const expires = retained ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
  const saved = { captureId, transcript: null as null, speakers: "unsupported" as const, retained };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO documentation_captures (
         id, organization_id, facility_id, patient_id, encounter_id, actor_id, kind, retention_hours, expires_at,
         content_hash, byte_length, audio_bytes, transcript_text, transcript_origin, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'audio', ?, ?, ?, ?, ?, NULL, 'none', ?)`,
      captureId,
      ctx.organizationId,
      encounter.facilityId,
      encounter.patient_id,
      encounter.id,
      ctx.userId,
      hours,
      expires,
      hash,
      input.audio.byteLength,
      retained ? input.audio : null,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'documentation.audio', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ captureId, encounterId: encounter.id, retained, speakers: "unsupported" }),
      now,
    );
    writeAudit(db, ctx, { action: "documentation.audio", resourceType: "DocumentationCapture", resourceId: captureId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
  });
  return saved;
}

export function editDocumentationSection(
  db: AppDatabase,
  ctx: SessionContext,
  input: { sectionId: string; text: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const text = input.text.trim();
  if (text.length < 1 || text.length > 1000) throw new ValidationError("invalid", "The edit must be 1–1000 characters.");
  const section = get<{ id: string; organization_id: string; facility_id: string; status: string }>(
    db,
    `SELECT s.id, d.organization_id, d.facility_id, d.status
     FROM documentation_sections s JOIN documentation_drafts d ON d.id = s.draft_id WHERE s.id = ?`,
    input.sectionId,
  );
  if (!section) {
    writeAudit(db, ctx, { action: "documentation.edit", resourceType: "DocumentationSection", resourceId: input.sectionId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (section.organization_id !== ctx.organizationId || section.facility_id !== facilityId) {
    noteDenial(db, ctx, "documentation.edit", "DocumentationSection", input.sectionId);
    throw new NotFoundError();
  }
  if (section.status !== "draft") throw new ConflictError("conflict", "That draft is no longer editable.");
  const requestHash = canonicalHash({ sectionId: input.sectionId, textHash: createHash("sha256").update(text).digest("hex") });
  return transaction(db, () => {
    const replay = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(replay.response_json) as { sectionId: string; authorship: "clinician-authored" };
    }
    execute(db, `UPDATE documentation_sections SET text = ?, authorship = 'clinician-authored' WHERE id = ?`, text, input.sectionId);
    const saved = { sectionId: input.sectionId, authorship: "clinician-authored" as const };
    const now = new Date().toISOString();
    writeAudit(db, ctx, { action: "documentation.edit", resourceType: "DocumentationSection", resourceId: input.sectionId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    return saved;
  });
}

export function decideDocumentationDraft(
  db: AppDatabase,
  ctx: SessionContext,
  input: { draftId: string; decision: "accepted" | "rejected"; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  if (input.decision !== "accepted" && input.decision !== "rejected") throw new ValidationError();
  const draft = get<{ id: string; organization_id: string; facility_id: string; status: string; signed: number }>(
    db,
    `SELECT id, organization_id, facility_id, status, signed FROM documentation_drafts WHERE id = ?`,
    input.draftId,
  );
  if (!draft) {
    writeAudit(db, ctx, { action: "documentation.decide", resourceType: "DocumentationDraft", resourceId: input.draftId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (draft.organization_id !== ctx.organizationId || draft.facility_id !== facilityId) {
    noteDenial(db, ctx, "documentation.decide", "DocumentationDraft", input.draftId);
    throw new NotFoundError();
  }
  const requestHash = canonicalHash({ draftId: input.draftId, decision: input.decision });
  return transaction(db, () => {
    const replay = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(replay.response_json) as { draftId: string; status: "accepted" | "rejected"; signed: false };
    }
    const current = get<{ status: string }>(db, `SELECT status FROM documentation_drafts WHERE id = ?`, input.draftId);
    if (current?.status !== "draft") throw new ConflictError("conflict", "That draft is already decided.");
    const now = new Date().toISOString();
    execute(
      db,
      `UPDATE documentation_drafts SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'draft' AND signed = 0`,
      input.decision,
      now,
      ctx.userId,
      input.draftId,
    );
    const saved = { draftId: input.draftId, status: input.decision, signed: false as const };
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'documentation.draft', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ draftId: input.draftId, status: input.decision, signed: false }),
      now,
    );
    writeAudit(db, ctx, { action: "documentation.decide", resourceType: "DocumentationDraft", resourceId: input.draftId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    return saved;
  });
}

export function signDocumentation() {
  throw new ValidationError("invalid", "A draft cannot be signed in this slice.");
}

export function readDocumentation(db: AppDatabase, ctx: SessionContext, patientId: string): DocumentationView | null {
  const facilityId = facilityOf(ctx);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) return null;
  const open = get<{ id: string }>(
    db,
    `SELECT id FROM encounters WHERE patient_id = ? AND organization_id = ? AND facility_id = ? AND status = 'in-progress' ORDER BY started_at DESC LIMIT 1`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  const granted = open ? consentGranted(db, open.id) : false;
  const drafts = getDrafts(db, ctx.organizationId, facilityId, patientId);
  writeAudit(db, ctx, { action: "documentation.read", resourceType: "Documentation", resourceId: patientId, outcome: "success" });
  return {
    patientId,
    audioRetentionHours: retentionHours(db, ctx.organizationId),
    consentGranted: granted,
    encounterId: open?.id ?? null,
    drafts,
  };
}

function getDrafts(db: AppDatabase, organizationId: string, facilityId: string, patientId: string): DocumentationDraft[] {
  const rows = db
    .prepare(
      `SELECT d.id, d.encounter_id, d.status, d.signed, s.id AS section_id, s.position, s.quote_start, s.quote_end, s.text, s.authorship, c.transcript_text
       FROM documentation_drafts d
       JOIN documentation_sections s ON s.draft_id = d.id
       JOIN documentation_captures c ON c.id = d.capture_id
       WHERE d.organization_id = ? AND d.facility_id = ? AND d.patient_id = ?
       ORDER BY d.created_at DESC, s.position
       LIMIT 80`,
    )
    .all(organizationId, facilityId, patientId) as {
    id: string;
    encounter_id: string;
    status: DocumentationDraft["status"];
    signed: number;
    section_id: string;
    position: number;
    quote_start: number;
    quote_end: number;
    text: string;
    authorship: DocumentationSection["authorship"];
    transcript_text: string | null;
  }[];
  const drafts: DocumentationDraft[] = [];
  for (const row of rows) {
    if (row.signed !== 0) throw new ValidationError("invalid", "A draft cannot be signed in this slice.");
    const source = row.transcript_text?.slice(row.quote_start, row.quote_end) ?? "";
    const section = { id: row.section_id, text: row.text, authorship: row.authorship, sourceQuote: source };
    const current = drafts.find((item) => item.id === row.id);
    if (current) current.sections.push(section);
    else drafts.push({ id: row.id, encounterId: row.encounter_id, status: row.status, signed: false, sections: [section] });
  }
  return drafts;
}
