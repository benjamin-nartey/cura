import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  captureDocumentationAudio,
  captureDocumentationText,
  createDatabase,
  decideDocumentationDraft,
  editDocumentationSection,
  openSession,
  readDocumentation,
  readSession,
  recordDocumentationConsent,
  seed,
  setAudioRetention,
  signDocumentation,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

test("a typed note stays a draft until the clinician accepts it, and it is never signed", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const observations = () => (db.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number }).c;
  const before = observations();
  assert.throws(
    () =>
      captureDocumentationText(db, ctx, {
        encounterId: FIXTURES.encounterMateo,
        patientId: FIXTURES.mateo,
        text: "Wheeze since yesterday.",
        idempotencyKey: "doc-text-0001",
      }),
    (error: unknown) => error instanceof ValidationError,
  );
  recordDocumentationConsent(db, ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    granted: true,
    idempotencyKey: "doc-consent-01",
  });
  const started = performance.now();
  const first = captureDocumentationText(db, ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    text: "Wheeze since yesterday.\n\nNo medication was added.",
    idempotencyKey: "doc-text-0001",
  });
  for (let i = 0; i < 40; i += 1) {
    const again = captureDocumentationText(db, ctx, {
      encounterId: FIXTURES.encounterMateo,
      patientId: FIXTURES.mateo,
      text: "Wheeze since yesterday.\n\nNo medication was added.",
      idempotencyKey: "doc-text-0001",
    });
    assert.equal(again.draftId, first.draftId);
  }
  assert.ok(performance.now() - started < 3000);
  assert.equal(first.status, "draft");
  assert.equal(first.signed, false);
  const view = readDocumentation(db, ctx, FIXTURES.mateo);
  const draft = view?.drafts.find((item) => item.id === first.draftId);
  assert.equal(draft?.status, "draft");
  assert.equal(draft?.signed, false);
  assert.equal(draft?.sections.length, 2);
  assert.ok(draft?.sections.every((section) => section.authorship === "source-quote" && section.text === section.sourceQuote));
  assert.throws(() => signDocumentation(), (error: unknown) => error instanceof ValidationError);
  assert.equal((db.prepare("SELECT MAX(signed) AS s FROM documentation_drafts").get() as { s: number }).s, 0);
  const sectionId = draft?.sections[0]?.id ?? "";
  editDocumentationSection(db, ctx, { sectionId, text: "Wheeze began yesterday.", idempotencyKey: "doc-edit-0001" });
  const edited = readDocumentation(db, ctx, FIXTURES.mateo)?.drafts.find((item) => item.id === first.draftId)?.sections[0];
  assert.equal(edited?.authorship, "clinician-authored");
  assert.equal(edited?.text, "Wheeze began yesterday.");
  assert.equal(edited?.sourceQuote, "Wheeze since yesterday.");
  const accepted = decideDocumentationDraft(db, ctx, { draftId: first.draftId, decision: "accepted", idempotencyKey: "doc-accept-01" });
  const replay = decideDocumentationDraft(db, ctx, { draftId: first.draftId, decision: "accepted", idempotencyKey: "doc-accept-01" });
  assert.equal(replay.status, accepted.status);
  assert.equal(accepted.signed, false);
  assert.equal(readDocumentation(db, ctx, FIXTURES.mateo)?.drafts.find((item) => item.id === first.draftId)?.status, "accepted");
  assert.equal(observations(), before);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM gateway_attempts").get() as { c: number }).c, 0);
});

test("audio is not transcribed, and retention controls whether the bytes are kept", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  recordDocumentationConsent(db, ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    granted: true,
    idempotencyKey: "doc-audio-consent",
  });
  const audio = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const discarded = captureDocumentationAudio(db, ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    audio,
    idempotencyKey: "doc-audio-0001",
  });
  assert.equal(discarded.transcript, null);
  assert.equal(discarded.speakers, "unsupported");
  assert.equal(discarded.retained, false);
  const stored = db.prepare("SELECT audio_bytes, transcript_text FROM documentation_captures WHERE id = ?").get(discarded.captureId) as {
    audio_bytes: Uint8Array | null;
    transcript_text: string | null;
  };
  assert.equal(stored.audio_bytes, null);
  assert.equal(stored.transcript_text, null);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM documentation_drafts").get() as { c: number }).c, 0);
  setAudioRetention(db, ctx, { hours: 24, idempotencyKey: "doc-retain-01" });
  const kept = captureDocumentationAudio(db, ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    audio,
    idempotencyKey: "doc-audio-0002",
  });
  assert.equal(kept.retained, true);
  assert.equal(kept.transcript, null);
  const bytes = db.prepare("SELECT audio_bytes, transcript_text FROM documentation_captures WHERE id = ?").get(kept.captureId) as {
    audio_bytes: Uint8Array | null;
    transcript_text: string | null;
  };
  assert.equal(bytes.transcript_text, null);
  assert.ok((bytes.audio_bytes?.byteLength ?? 0) > 0);
  assert.equal(readDocumentation(db, ctx, FIXTURES.mateo)?.audioRetentionHours, 24);
});

test("another organization cannot read or capture the draft", () => {
  const amira = signIn(FIXTURES.amira);
  recordDocumentationConsent(amira.db, amira.ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    granted: true,
    idempotencyKey: "doc-iso-consent",
  });
  const draft = captureDocumentationText(amira.db, amira.ctx, {
    encounterId: FIXTURES.encounterMateo,
    patientId: FIXTURES.mateo,
    text: "Wheeze since yesterday.",
    idempotencyKey: "doc-iso-text",
  });
  const evan = signIn(FIXTURES.evan);
  assert.equal(readDocumentation(evan.db, evan.ctx, FIXTURES.mateo), null);
  const evanOnAmira = openSession(amira.db, FIXTURES.evan);
  const evanCtx = readSession(amira.db, evanOnAmira.sessionId);
  if (!evanCtx) throw new Error("session missing");
  assert.throws(
    () => decideDocumentationDraft(amira.db, evanCtx, { draftId: draft.draftId, decision: "accepted", idempotencyKey: "doc-iso-decide" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readDocumentation(priya.db, priya.ctx, FIXTURES.mateo), (error: unknown) => error instanceof ForbiddenError);
});
