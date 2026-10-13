import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";

export const REVENUE_INVOICE_NOTE = "This amount is recorded. Nothing was billed or collected.";
export const REVENUE_ELIGIBILITY_NOTE = "No payer is connected. Eligibility is not checked.";
export const REVENUE_CLAIM_NOTE = "No clearinghouse is connected. The claim stays a draft.";
export const REVENUE_DENIAL_NOTE = "No payer decision is stored. A denial is not calculated.";
export const REVENUE_SUBSCRIPTION_NOTE = "No subscription invoice was issued.";
export const REVENUE_AI_NOTE = "No ledger amount was changed. Financial text is not written by a model.";

export type RevenueView = {
  invoiceNote: string;
  eligibilityNote: string;
  claimNote: string;
  denialNote: string;
  subscriptionNote: string;
  aiNote: string;
  facilities: { id: string; name: string }[];
  accounts: { id: string; mrn: string; facilityId: string }[];
  invoices: {
    id: string;
    facilityId: string;
    patientId: string;
    serviceLabel: string;
    amountCents: number;
    status: "recorded";
    note: string;
  }[];
  payments: { id: string; invoiceId: string; amountCents: number; status: "recorded" }[];
  eligibility: { id: string; patientId: string; payerLabel: string; status: "not-checked" }[];
  claims: { id: string; invoiceId: string; status: "draft"; attempts: number }[];
  subscription: { planLabel: string; status: "not-billed" } | null;
  usageCount: number;
  reconciliation: { invoiceCents: number; paymentCents: number; openCents: number; text: string };
};

export function holdRevenueText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function assertBilling(db: AppDatabase, ctx: SessionContext) {
  if (ctx.role !== "admin" || ctx.purposeOfUse !== "OPERATIONS") {
    writeAudit(db, ctx, { action: "revenue.read", resourceType: "RevenueInvoice", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function cleanLabel(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 80) throw new ValidationError();
  if (/\d{13,19}/.test(trimmed.replace(/[\s-]/g, ""))) throw new ValidationError();
  return trimmed;
}

function centsOf(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000) throw new ValidationError("range");
  return value;
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

function requireFacility(db: AppDatabase, ctx: SessionContext, facilityId: string) {
  const row = get<{ id: string }>(db, `SELECT id FROM facilities WHERE id = ? AND organization_id = ?`, facilityId, ctx.organizationId);
  if (!row) throw new NotFoundError();
}

function requireAccount(db: AppDatabase, ctx: SessionContext, facilityId: string, patientId: string) {
  const row = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!row) throw new NotFoundError();
}

function sums(db: AppDatabase, organizationId: string) {
  const invoices = get<{ c: number }>(db, `SELECT COALESCE(SUM(amount_cents), 0) AS c FROM revenue_invoices WHERE organization_id = ?`, organizationId);
  const payments = get<{ c: number }>(db, `SELECT COALESCE(SUM(amount_cents), 0) AS c FROM revenue_payments WHERE organization_id = ?`, organizationId);
  const invoiceCents = Number(invoices?.c ?? 0);
  const paymentCents = Number(payments?.c ?? 0);
  const openCents = invoiceCents - paymentCents;
  return {
    invoiceCents,
    paymentCents,
    openCents,
    text: `Recorded payments are ${paymentCents} of ${invoiceCents} recorded cents. This is not a bank reconciliation.`,
  };
}

export function readRevenue(db: AppDatabase, ctx: SessionContext): RevenueView {
  assertBilling(db, ctx);
  writeAudit(db, ctx, { action: "revenue.read", resourceType: "RevenueInvoice", resourceId: ctx.organizationId, outcome: "success" });
  const facilities = all<{ id: string; name: string }>(db, `SELECT id, name FROM facilities WHERE organization_id = ? ORDER BY name`, ctx.organizationId);
  const accounts = all<{ id: string; mrn: string; facility_id: string }>(
    db,
    `SELECT id, mrn, facility_id FROM patients WHERE organization_id = ? ORDER BY mrn`,
    ctx.organizationId,
  );
  const invoices = all<{ id: string; facility_id: string; patient_id: string; service_label: string; amount_cents: number }>(
    db,
    `SELECT id, facility_id, patient_id, service_label, amount_cents FROM revenue_invoices WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const payments = all<{ id: string; invoice_id: string; amount_cents: number }>(
    db,
    `SELECT id, invoice_id, amount_cents FROM revenue_payments WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const eligibility = all<{ id: string; patient_id: string; payer_label: string }>(
    db,
    `SELECT id, patient_id, payer_label FROM revenue_eligibility WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const claims = all<{ id: string; invoice_id: string; attempts: number }>(
    db,
    `SELECT c.id, c.invoice_id, (SELECT COUNT(*) FROM revenue_claim_attempts a WHERE a.claim_id = c.id) AS attempts
     FROM revenue_claims c WHERE c.organization_id = ? ORDER BY c.created_at, c.id`,
    ctx.organizationId,
  );
  const subscription = get<{ plan_label: string }>(db, `SELECT plan_label FROM revenue_subscriptions WHERE organization_id = ?`, ctx.organizationId);
  const usage = get<{ c: number }>(
    db,
    `SELECT (SELECT COUNT(*) FROM revenue_invoices WHERE organization_id = ?) + (SELECT COUNT(*) FROM revenue_payments WHERE organization_id = ?) AS c`,
    ctx.organizationId,
    ctx.organizationId,
  );
  return {
    invoiceNote: REVENUE_INVOICE_NOTE,
    eligibilityNote: REVENUE_ELIGIBILITY_NOTE,
    claimNote: REVENUE_CLAIM_NOTE,
    denialNote: REVENUE_DENIAL_NOTE,
    subscriptionNote: REVENUE_SUBSCRIPTION_NOTE,
    aiNote: REVENUE_AI_NOTE,
    facilities,
    accounts: accounts.map((account) => ({ id: account.id, mrn: account.mrn, facilityId: account.facility_id })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      facilityId: invoice.facility_id,
      patientId: invoice.patient_id,
      serviceLabel: invoice.service_label,
      amountCents: Number(invoice.amount_cents),
      status: "recorded",
      note: REVENUE_INVOICE_NOTE,
    })),
    payments: payments.map((payment) => ({ id: payment.id, invoiceId: payment.invoice_id, amountCents: Number(payment.amount_cents), status: "recorded" })),
    eligibility: eligibility.map((row) => ({ id: row.id, patientId: row.patient_id, payerLabel: row.payer_label, status: "not-checked" })),
    claims: claims.map((claim) => ({ id: claim.id, invoiceId: claim.invoice_id, status: "draft", attempts: Number(claim.attempts) })),
    subscription: subscription ? { planLabel: subscription.plan_label, status: "not-billed" } : null,
    usageCount: Number(usage?.c ?? 0),
    reconciliation: sums(db, ctx.organizationId),
  };
}

export function recordInvoice(
  db: AppDatabase,
  ctx: SessionContext,
  input: { facilityId: string; patientId: string; serviceLabel: string; amountCents: number; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  requireFacility(db, ctx, input.facilityId);
  requireAccount(db, ctx, input.facilityId, input.patientId);
  const serviceLabel = cleanLabel(input.serviceLabel);
  const amountCents = centsOf(input.amountCents);
  const hash = canonicalHash({ facilityId: input.facilityId, patientId: input.patientId, serviceLabel, amountCents });
  const prior = replay<{ invoiceId: string; status: "recorded" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const invoiceId = `inv_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { invoiceId, status: "recorded" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO revenue_invoices (id, organization_id, facility_id, patient_id, service_label, amount_cents, status, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'recorded', ?, ?)`,
      invoiceId,
      ctx.organizationId,
      input.facilityId,
      input.patientId,
      serviceLabel,
      amountCents,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "revenue.invoice", { invoiceId, amountCents }, now);
    writeAudit(db, ctx, { action: "revenue.invoice", resourceType: "RevenueInvoice", resourceId: invoiceId, outcome: "success" });
  });
  return saved;
}

export function recordRevenuePayment(
  db: AppDatabase,
  ctx: SessionContext,
  input: { invoiceId: string; amountCents: number; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  const amountCents = centsOf(input.amountCents);
  const hash = canonicalHash({ invoiceId: input.invoiceId, amountCents });
  const prior = replay<{ paymentId: string; status: "recorded" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const invoice = get<{ id: string; facility_id: string; amount_cents: number }>(
    db,
    `SELECT id, facility_id, amount_cents FROM revenue_invoices WHERE id = ? AND organization_id = ?`,
    input.invoiceId,
    ctx.organizationId,
  );
  if (!invoice) throw new NotFoundError();
  const paid = get<{ c: number }>(db, `SELECT COALESCE(SUM(amount_cents), 0) AS c FROM revenue_payments WHERE invoice_id = ?`, invoice.id);
  if (Number(paid?.c ?? 0) + amountCents > invoice.amount_cents) throw new ValidationError("range", "That amount is above the recorded invoice.");
  const paymentId = `pay_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { paymentId, status: "recorded" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO revenue_payments (id, organization_id, facility_id, invoice_id, amount_cents, status, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'recorded', ?, ?)`,
      paymentId,
      ctx.organizationId,
      invoice.facility_id,
      invoice.id,
      amountCents,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "revenue.payment", { paymentId, amountCents }, now);
    writeAudit(db, ctx, { action: "revenue.payment", resourceType: "RevenuePayment", resourceId: paymentId, outcome: "success" });
  });
  return saved;
}

export function recordEligibility(
  db: AppDatabase,
  ctx: SessionContext,
  input: { facilityId: string; patientId: string; payerLabel: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  requireFacility(db, ctx, input.facilityId);
  requireAccount(db, ctx, input.facilityId, input.patientId);
  const payerLabel = cleanLabel(input.payerLabel);
  const hash = canonicalHash({ facilityId: input.facilityId, patientId: input.patientId, payerLabel });
  const prior = replay<{ eligibilityId: string; status: "not-checked" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const eligibilityId = `elg_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { eligibilityId, status: "not-checked" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO revenue_eligibility (id, organization_id, facility_id, patient_id, payer_label, status, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'not-checked', ?, ?)`,
      eligibilityId,
      ctx.organizationId,
      input.facilityId,
      input.patientId,
      payerLabel,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "revenue.eligibility", { eligibilityId }, now);
    writeAudit(db, ctx, { action: "revenue.eligibility", resourceType: "RevenueEligibility", resourceId: eligibilityId, outcome: "success" });
  });
  return saved;
}

export function draftClaim(db: AppDatabase, ctx: SessionContext, input: { invoiceId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  const hash = canonicalHash({ invoiceId: input.invoiceId });
  const prior = replay<{ claimId: string; status: "draft" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const invoice = get<{ id: string; facility_id: string }>(
    db,
    `SELECT id, facility_id FROM revenue_invoices WHERE id = ? AND organization_id = ?`,
    input.invoiceId,
    ctx.organizationId,
  );
  if (!invoice) throw new NotFoundError();
  const existing = get<{ id: string }>(db, `SELECT id FROM revenue_claims WHERE invoice_id = ?`, invoice.id);
  if (existing) throw new ConflictError("open", "A draft is already stored for that invoice.");
  const claimId = `clm_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { claimId, status: "draft" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO revenue_claims (id, organization_id, facility_id, invoice_id, status, author_id, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      claimId,
      ctx.organizationId,
      invoice.facility_id,
      invoice.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "revenue.claim", { claimId, status: "draft" }, now);
    writeAudit(db, ctx, { action: "revenue.claim", resourceType: "RevenueClaim", resourceId: claimId, outcome: "success" });
  });
  return saved;
}

export function submitClaim(db: AppDatabase, ctx: SessionContext, input: { claimId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  const hash = canonicalHash({ claimId: input.claimId, outcome: "not-submitted" });
  const prior = replay<{ claimId: string; status: "draft"; note: string }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const claim = get<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM revenue_claims WHERE id = ? AND organization_id = ?`,
    input.claimId,
    ctx.organizationId,
  );
  if (!claim) throw new NotFoundError();
  const attemptId = `cla_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { claimId: claim.id, status: "draft" as const, note: REVENUE_CLAIM_NOTE };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO revenue_claim_attempts (id, organization_id, claim_id, outcome, author_id, created_at) VALUES (?, ?, ?, 'not-submitted', ?, ?)`,
      attemptId,
      ctx.organizationId,
      claim.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "revenue.claim", { claimId: claim.id, status: "draft" }, now);
    writeAudit(db, ctx, { action: "revenue.submit", resourceType: "RevenueClaim", resourceId: claim.id, outcome: "success" });
  });
  return saved;
}

export function recordSubscription(db: AppDatabase, ctx: SessionContext, input: { planLabel: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  const planLabel = cleanLabel(input.planLabel);
  const hash = canonicalHash({ planLabel });
  const prior = replay<{ status: "not-billed" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const now = new Date().toISOString();
  const saved = { status: "not-billed" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO revenue_subscriptions (organization_id, plan_label, status, author_id, updated_at)
       VALUES (?, ?, 'not-billed', ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET plan_label = excluded.plan_label, status = 'not-billed', author_id = excluded.author_id, updated_at = excluded.updated_at`,
      ctx.organizationId,
      planLabel,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "revenue.subscription", { status: "not-billed" }, now);
    writeAudit(db, ctx, { action: "revenue.subscription", resourceType: "RevenueSubscription", resourceId: ctx.organizationId, outcome: "success" });
  });
  return saved;
}

export function explainRevenue(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertBilling(db, ctx);
  const before = sums(db, ctx.organizationId);
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Recommend a ledger adjustment.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  const after = sums(db, ctx.organizationId);
  writeAudit(db, ctx, { action: "revenue.explain", resourceType: "RevenueInvoice", resourceId: ctx.organizationId, outcome: "success" });
  return {
    text: holdRevenueText(REVENUE_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
    invoiceCents: after.invoiceCents,
    unchanged: before.invoiceCents === after.invoiceCents && before.paymentCents === after.paymentCents,
  };
}
