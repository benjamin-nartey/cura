import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  REVENUE_AI_NOTE,
  REVENUE_CLAIM_NOTE,
  REVENUE_DENIAL_NOTE,
  REVENUE_ELIGIBILITY_NOTE,
  ValidationError,
  createDatabase,
  draftClaim,
  explainRevenue,
  holdRevenueText,
  openSession,
  readRevenue,
  readSession,
  recordEligibility,
  recordInvoice,
  recordRevenuePayment,
  recordSubscription,
  seed,
  submitClaim,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("the ledger reconciles, and a model cannot change it", () => {
  const { db, ctx } = signIn(FIXTURES.admin);
  assert.throws(() => readRevenue(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readRevenue(db, session(db, FIXTURES.priya)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(
    () =>
      recordInvoice(db, ctx, {
        facilityId: "fac_riverside",
        patientId: FIXTURES.elena,
        serviceLabel: "4111111111111111",
        amountCents: 2500,
        idempotencyKey: "rev-card-0001",
      }),
    (error: unknown) => error instanceof ValidationError,
  );
  const invoice = recordInvoice(db, ctx, {
    facilityId: "fac_riverside",
    patientId: FIXTURES.elena,
    serviceLabel: "Visit record",
    amountCents: 2500,
    idempotencyKey: "rev-inv-0001",
  });
  const replay = recordInvoice(db, ctx, {
    facilityId: "fac_riverside",
    patientId: FIXTURES.elena,
    serviceLabel: "Visit record",
    amountCents: 2500,
    idempotencyKey: "rev-inv-0001",
  });
  assert.equal(replay.invoiceId, invoice.invoiceId);
  assert.equal(replay.status, "recorded");
  recordRevenuePayment(db, ctx, { invoiceId: invoice.invoiceId, amountCents: 1000, idempotencyKey: "rev-pay-0001" });
  assert.throws(
    () => recordRevenuePayment(db, ctx, { invoiceId: invoice.invoiceId, amountCents: 2000, idempotencyKey: "rev-pay-0002" }),
    (error: unknown) => error instanceof ValidationError && error.code === "range",
  );
  const eligibility = recordEligibility(db, ctx, {
    facilityId: "fac_riverside",
    patientId: FIXTURES.elena,
    payerLabel: "Local plan",
    idempotencyKey: "rev-elg-0001",
  });
  assert.equal(eligibility.status, "not-checked");
  const claim = draftClaim(db, ctx, { invoiceId: invoice.invoiceId, idempotencyKey: "rev-clm-0001" });
  const submitted = submitClaim(db, ctx, { claimId: claim.claimId, idempotencyKey: "rev-sub-0001" });
  assert.equal(submitted.status, "draft");
  assert.equal(submitted.note, REVENUE_CLAIM_NOTE);
  const plan = recordSubscription(db, ctx, { planLabel: "Local seat", idempotencyKey: "rev-plan-0001" });
  assert.equal(plan.status, "not-billed");
  const explained = explainRevenue(
    db,
    ctx,
    { idempotencyKey: "rev-exp-0001" },
    { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ amountCents: 1 }) },
  );
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.unchanged, true);
  assert.equal(explained.text, holdRevenueText(REVENUE_AI_NOTE, { amountCents: 1 }));
  const view = readRevenue(db, ctx);
  assert.equal(view.reconciliation.invoiceCents, 2500);
  assert.equal(view.reconciliation.paymentCents, 1000);
  assert.equal(view.reconciliation.openCents, 1500);
  assert.equal(view.reconciliation.paymentCents + view.reconciliation.openCents, view.reconciliation.invoiceCents);
  assert.equal(view.eligibilityNote, REVENUE_ELIGIBILITY_NOTE);
  assert.equal(view.denialNote, REVENUE_DENIAL_NOTE);
  assert.equal(view.claims[0]?.status, "draft");
  assert.equal(view.claims[0]?.attempts, 1);
  assert.equal(view.subscription?.status, "not-billed");
  assert.equal(view.usageCount, 2);
  const encoded = JSON.stringify(view);
  assert.equal(encoded.includes("Elena"), false);
  assert.equal(encoded.includes("E11.9"), false);
  assert.throws(
    () =>
      recordInvoice(db, session(db, FIXTURES.evan), {
        facilityId: "fac_lakeside",
        patientId: "pat_samir",
        serviceLabel: "Visit record",
        amountCents: 100,
        idempotencyKey: "rev-inv-0002",
      }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.throws(
    () =>
      recordInvoice(db, ctx, {
        facilityId: "fac_lakeside",
        patientId: FIXTURES.elena,
        serviceLabel: "Visit record",
        amountCents: 100,
        idempotencyKey: "rev-inv-0003",
      }),
    (error: unknown) => error instanceof NotFoundError,
  );
});
