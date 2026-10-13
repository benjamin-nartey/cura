import { randomUUID } from "node:crypto";
import type { Chart, EvidenceClaim, SessionContext } from "@curasphere/contracts";
import { noteDenial, writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { getChart } from "./chart";
import { get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { evidenceFromChart } from "./evidence";
import { redactGatewayInput } from "./gateway";
import { canReadChart } from "./session";

/** Every sentence in a released answer must be a supported, cited claim. */
export const GROUNDING_THRESHOLD = 1;

const BLOCKED_QUESTION = /recommend|diagnos|should start|likely has|prescrib|increase the dose/i;
const STOP_WORDS = new Set(["what", "when", "with", "this", "that", "from", "have", "stored", "result", "about", "show", "latest", "open", "encounter", "appointment", "there"]);

export type CopilotLine = {
  claimId: string;
  text: string;
  citations: EvidenceClaim["citations"];
};

export type CopilotFlag = {
  claimId: string;
  evidenceState: EvidenceClaim["evidenceState"];
  reason: "invalidated" | "insufficient" | "uncited";
};

export type CopilotView = {
  patientId: string;
  threshold: number;
  groundingScore: number;
  released: boolean;
  summary: CopilotLine[];
  changed: CopilotLine[];
  abnormal: CopilotLine[];
  openItems: CopilotLine[];
  flagged: CopilotFlag[];
};

export type CopilotTurn = {
  turnId: string;
  patientId: string;
  outcome: "grounded" | "blocked";
  reason: "grounded" | "policy" | "scope" | "unsupported" | "threshold";
  groundingScore: number;
  lines: CopilotLine[];
};

type TurnRow = {
  id: string;
  organization_id: string;
  facility_id: string;
  patient_id: string;
  outcome: "grounded" | "blocked";
  reason: CopilotTurn["reason"];
  grounding_score: number;
  answer_json: string | null;
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) throw new ForbiddenError();
  return ctx.facilityId;
}

function supported(claim: EvidenceClaim) {
  return claim.evidenceState === "supported" && claim.citations.length > 0;
}

function toLine(claim: EvidenceClaim): CopilotLine {
  return { claimId: claim.id, text: claim.text, citations: claim.citations };
}

function flagReason(claim: EvidenceClaim): CopilotFlag["reason"] {
  if (claim.citations.length === 0) return "uncited";
  if (claim.evidenceState === "insufficient") return "insufficient";
  return "invalidated";
}

function classify(chart: Chart, claims: EvidenceClaim[]) {
  const changedIds = new Set(chart.briefing.items.map((item) => item.sourceId));
  const summary: CopilotLine[] = [];
  const changed: CopilotLine[] = [];
  const abnormal: CopilotLine[] = [];
  const openItems: CopilotLine[] = [];
  for (const claim of claims) {
    const line = toLine(claim);
    if (claim.text.startsWith("Open encounter") || claim.text.startsWith("Booked appointment")) openItems.push(line);
    else if (/above|below/.test(claim.text)) abnormal.push(line);
    else if (claim.citations.some((item) => changedIds.has(item.sourceId))) changed.push(line);
    else summary.push(line);
  }
  return { summary, changed, abnormal, openItems };
}

export function readCopilot(db: AppDatabase, ctx: SessionContext, patientId: string, now = new Date()): CopilotView | null {
  facilityOf(ctx);
  const chart = getChart(db, ctx, patientId, now);
  if (!chart) return null;
  const evidence = evidenceFromChart(db, ctx, chart);
  const ready = evidence.claims.filter(supported);
  const flagged = evidence.claims.filter((claim) => !supported(claim)).map((claim) => ({
    claimId: claim.id,
    evidenceState: claim.evidenceState,
    reason: flagReason(claim),
  }));
  const groundingScore = evidence.claims.length === 0 ? 0 : ready.length / evidence.claims.length;
  const released = groundingScore >= GROUNDING_THRESHOLD && ready.length > 0;
  const sections = released ? classify(chart, ready) : { summary: [], changed: [], abnormal: [], openItems: [] };
  writeAudit(db, ctx, { action: "copilot.read", resourceType: "Copilot", resourceId: patientId, outcome: "success" });
  return { patientId, threshold: GROUNDING_THRESHOLD, groundingScore, released, ...sections, flagged };
}

function questionTokens(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 5 && !STOP_WORDS.has(token));
}

function matches(claim: EvidenceClaim, question: string, tokens: string[]) {
  const haystack = claim.text.toLowerCase();
  if (tokens.some((token) => haystack.includes(token))) return true;
  return claim.citations.some((item) => question.includes(item.sourceId));
}

function otherPatient(question: string, patientId: string) {
  const ids = question.match(/\bpat_[a-z0-9_]+\b/gi) ?? [];
  return ids.some((id) => id.toLowerCase() !== patientId.toLowerCase());
}

function toTurn(row: TurnRow): CopilotTurn {
  return {
    turnId: row.id,
    patientId: row.patient_id,
    outcome: row.outcome,
    reason: row.reason,
    groundingScore: row.grounding_score,
    lines: row.answer_json ? (JSON.parse(row.answer_json) as CopilotLine[]) : [],
  };
}

export function askCopilot(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; question: string; idempotencyKey: string },
): CopilotTurn {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const question = input.question.trim();
  if (question.length < 1 || question.length > 500) throw new ValidationError("invalid", "The question must be 1–500 characters.");
  const chart = getChart(db, ctx, input.patientId);
  if (!chart) throw new NotFoundError();
  const redacted = redactGatewayInput(question);
  const requestHash = canonicalHash({ patientId: input.patientId, questionHash: redacted.hash });
  const replay = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    input.idempotencyKey,
  );
  if (replay) {
    if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
    return JSON.parse(replay.response_json) as CopilotTurn;
  }
  const evidence = evidenceFromChart(db, ctx, chart);
  let outcome: CopilotTurn["outcome"] = "blocked";
  let reason: CopilotTurn["reason"] = "unsupported";
  let groundingScore = 0;
  let lines: CopilotLine[] = [];
  if (BLOCKED_QUESTION.test(question)) reason = "policy";
  else if (otherPatient(question, input.patientId)) reason = "scope";
  else {
    const tokens = questionTokens(question);
    const matched = evidence.claims.filter((claim) => matches(claim, question, tokens));
    const ready = matched.filter(supported);
    groundingScore = matched.length === 0 ? 0 : ready.length / matched.length;
    if (matched.length === 0) reason = "unsupported";
    else if (groundingScore < GROUNDING_THRESHOLD) reason = "threshold";
    else {
      outcome = "grounded";
      reason = "grounded";
      lines = ready.map(toLine);
    }
  }
  const turnId = `ask_${randomUUID()}`;
  const now = new Date().toISOString();
  const turn: CopilotTurn = { turnId, patientId: input.patientId, outcome, reason, groundingScore, lines: outcome === "grounded" ? lines : [] };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO copilot_turns (
         id, organization_id, facility_id, patient_id, actor_id, question_hash, outcome, reason, grounding_score, answer_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      turnId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      ctx.userId,
      redacted.hash,
      outcome,
      reason,
      groundingScore,
      outcome === "grounded" ? JSON.stringify(lines) : null,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'copilot.turn', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ turnId, patientId: input.patientId, outcome, groundingScore }),
      now,
    );
    writeAudit(db, ctx, { action: "copilot.ask", resourceType: "CopilotTurn", resourceId: turnId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(turn),
      now,
    );
  });
  return turn;
}

export function readCopilotTurn(db: AppDatabase, ctx: SessionContext, turnId: string): CopilotTurn | null {
  const facilityId = facilityOf(ctx);
  const row = get<TurnRow>(
    db,
    `SELECT id, organization_id, facility_id, patient_id, outcome, reason, grounding_score, answer_json FROM copilot_turns WHERE id = ?`,
    turnId,
  );
  if (!row || row.organization_id !== ctx.organizationId || row.facility_id !== facilityId) {
    if (row) noteDenial(db, ctx, "copilot.ask", "CopilotTurn", turnId);
    return null;
  }
  return toTurn(row);
}

export function recordCopilotFeedback(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; claimId: string; rating: "helpful" | "not-grounded"; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  if (input.rating !== "helpful" && input.rating !== "not-grounded") throw new ValidationError();
  const claim = get<{ id: string; organization_id: string; facility_id: string; patient_id: string; claim_text: string; evidence_state: string }>(
    db,
    `SELECT id, organization_id, facility_id, patient_id, claim_text, evidence_state FROM evidence_claims WHERE id = ?`,
    input.claimId,
  );
  if (!claim) {
    writeAudit(db, ctx, { action: "copilot.feedback", resourceType: "Evidence", resourceId: input.claimId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (claim.organization_id !== ctx.organizationId || claim.facility_id !== facilityId || claim.patient_id !== input.patientId) {
    noteDenial(db, ctx, "copilot.feedback", "Evidence", input.claimId);
    throw new NotFoundError();
  }
  const requestHash = canonicalHash({ patientId: input.patientId, claimId: input.claimId, rating: input.rating });
  return transaction(db, () => {
    const replay = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(replay.response_json) as { feedbackId: string; claimId: string; rating: string };
    }
    const feedbackId = `fbk_${randomUUID()}`;
    const now = new Date().toISOString();
    execute(
      db,
      `INSERT INTO copilot_feedback (id, organization_id, facility_id, patient_id, claim_id, actor_id, rating, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      feedbackId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      input.claimId,
      ctx.userId,
      input.rating,
      now,
    );
    const saved = { feedbackId, claimId: input.claimId, rating: input.rating };
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'copilot.feedback', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify(saved),
      now,
    );
    writeAudit(db, ctx, { action: "copilot.feedback", resourceType: "CopilotFeedback", resourceId: feedbackId, outcome: "success" });
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
