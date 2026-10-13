import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  IMAGING_AI_NOTE,
  IMAGING_BYTE_LIMIT,
  IMAGING_DEID_NOTE,
  IMAGING_GATEWAY_NOTE,
  IMAGING_VIEWER_NOTE,
  NotFoundError,
  ValidationError,
  ConflictError,
  createDatabase,
  explainImaging,
  holdImagingText,
  openSession,
  readImaging,
  readSession,
  recordImagingReport,
  recordImagingStudy,
  releaseImagingStudy,
  seed,
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

test("a study stores metadata, and a large object is refused", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const started = Date.now();
  assert.throws(
    () =>
      recordImagingStudy(db, ctx, {
        patientId: FIXTURES.elena,
        accession: "ACC1001",
        modality: "CT",
        description: "A".repeat(IMAGING_BYTE_LIMIT + 1),
        studyDate: "2026-10-01",
        idempotencyKey: "img-big-0001",
      }),
    (error: unknown) => error instanceof ValidationError && error.code === "range",
  );
  assert.ok(Date.now() - started < 1000);
  assert.equal(readImaging(db, ctx).studies.length, 0);
  const stored = recordImagingStudy(db, ctx, {
    patientId: FIXTURES.elena,
    accession: "ACC1001",
    modality: "CT",
    description: "Chest metadata",
    studyDate: "2026-10-01",
    idempotencyKey: "img-study-01",
  });
  const again = recordImagingStudy(db, ctx, {
    patientId: FIXTURES.elena,
    accession: "ACC1001",
    modality: "CT",
    description: "Chest metadata",
    studyDate: "2026-10-01",
    idempotencyKey: "img-study-01",
  });
  assert.equal(again.studyId, stored.studyId);
  const view = readImaging(db, ctx);
  assert.equal(view.gatewayNote, IMAGING_GATEWAY_NOTE);
  assert.equal(view.viewerNote, IMAGING_VIEWER_NOTE);
  assert.equal(view.studies.length, 1);
  assert.equal(view.studies[0]?.modality, "CT");
  assert.throws(
    () =>
      recordImagingStudy(db, ctx, {
        patientId: FIXTURES.elena,
        accession: "ACC1002",
        modality: "AI",
        description: "",
        studyDate: "2026-10-01",
        idempotencyKey: "img-mod-0001",
      }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
});

test("a typed report stays linked, and the release drops identifiers", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const stored = recordImagingStudy(db, ctx, {
    patientId: FIXTURES.elena,
    accession: "ACC1001",
    modality: "MR",
    description: "Elena follow up",
    studyDate: "2026-10-01",
    idempotencyKey: "img-study-02",
  });
  const linked = recordImagingReport(db, ctx, {
    studyId: stored.studyId,
    text: "Typed note for the metadata row.",
    idempotencyKey: "img-report-01",
  });
  assert.throws(
    () => recordImagingReport(db, ctx, { studyId: stored.studyId, text: "Another note.", idempotencyKey: "img-report-02" }),
    (error: unknown) => error instanceof ConflictError && error.code === "open",
  );
  const released = releaseImagingStudy(db, ctx, { studyId: stored.studyId, idempotencyKey: "img-rel-0001" });
  assert.equal(released.decision, "release");
  const body = readImaging(db, ctx).studies[0]?.releases[0]?.body;
  assert.equal(body?.modality, "MR");
  assert.equal(body?.text, IMAGING_DEID_NOTE);
  const encoded = JSON.stringify(body);
  assert.equal(encoded.includes("pat_elena"), false);
  assert.equal(encoded.includes("Elena"), false);
  assert.equal(encoded.includes("ACC1001"), false);
  assert.equal(encoded.includes(linked.reportId), false);
  const dated = recordImagingStudy(db, ctx, {
    patientId: FIXTURES.elena,
    accession: "ACC1002",
    modality: "US",
    description: "",
    studyDate: "1959-03-12",
    idempotencyKey: "img-study-03",
  });
  const withheld = releaseImagingStudy(db, ctx, { studyId: dated.studyId, idempotencyKey: "img-rel-0002" });
  assert.equal(withheld.decision, "withhold");
  const hidden = readImaging(db, ctx).studies.find((study) => study.id === dated.studyId);
  assert.equal(hidden?.releases[0]?.body, null);
  const explained = explainImaging(
    db,
    ctx,
    { studyId: stored.studyId, idempotencyKey: "img-exp-0001" },
    { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ impression: "pneumonia" }) },
  );
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.aiText, null);
  assert.equal(explained.text, holdImagingText(IMAGING_AI_NOTE, "pneumonia"));
  assert.throws(() => readImaging(db, session(db, FIXTURES.priya)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(
    () =>
      recordImagingStudy(db, session(db, FIXTURES.evan), {
        patientId: FIXTURES.elena,
        accession: "ACC1003",
        modality: "CT",
        description: "",
        studyDate: "2026-10-01",
        idempotencyKey: "img-study-04",
      }),
    (error: unknown) => error instanceof NotFoundError,
  );
  assert.equal(readImaging(db, session(db, FIXTURES.lea)).studies.some((study) => study.id === stored.studyId), false);
});
