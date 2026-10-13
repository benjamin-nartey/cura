import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  RESEARCH_ETHICS_NOTE,
  RESEARCH_NOTEBOOK_NOTE,
  ValidationError,
  buildPopulation,
  createDatabase,
  createPatient,
  decideResearchExport,
  openResearchWorkspace,
  openSession,
  readResearch,
  readSession,
  recordObservation,
  recordPopulationJurisdiction,
  requestResearchExport,
  seed,
  snapshotResearchDataset,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("a dataset version stays frozen, and the requester cannot approve the export", () => {
  const { db, ctx: amira } = signIn(FIXTURES.amira);
  const priya = session(db, FIXTURES.priya);
  const nabil = session(db, FIXTURES.nabil);
  assert.throws(() => readResearch(db, amira), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readResearch(db, session(db, FIXTURES.evan)), (error: unknown) => error instanceof ForbiddenError);
  buildPopulation(db, priya, "res-pop-0001");
  const opened = openResearchWorkspace(db, priya, {
    title: "Systolic counts",
    protocolLabel: "local-protocol-1",
    idempotencyKey: "res-ws-0001",
  });
  const replayedWorkspace = openResearchWorkspace(db, priya, {
    title: "Systolic counts",
    protocolLabel: "local-protocol-1",
    idempotencyKey: "res-ws-0001",
  });
  assert.equal(replayedWorkspace.workspaceId, opened.workspaceId);
  assert.throws(
    () => snapshotResearchDataset(db, priya, { workspaceId: "rws_missing", idempotencyKey: "res-snap-miss" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const first = snapshotResearchDataset(db, priya, { workspaceId: opened.workspaceId, idempotencyKey: "res-snap-0001" });
  assert.equal(first.version, 1);
  const again = snapshotResearchDataset(db, priya, { workspaceId: opened.workspaceId, idempotencyKey: "res-snap-0002" });
  assert.equal(again.datasetId, first.datasetId);
  assert.equal(again.version, 1);
  const view = readResearch(db, priya);
  const workspace = view.workspaces[0];
  assert.equal(workspace?.ethicsStatus, "not-reviewed");
  assert.equal(workspace?.ethicsNote, RESEARCH_ETHICS_NOTE);
  assert.equal(workspace?.purposeOfUse, "AUDIT");
  assert.equal(workspace?.datasets[0]?.notebookNote, RESEARCH_NOTEBOOK_NOTE);
  const frozen = JSON.stringify(workspace?.datasets[0]?.payload);
  assert.equal(frozen.includes("pat_elena"), false);
  assert.equal(frozen.includes("Elena"), false);
  for (const [index, givenName] of ["Nora", "Quinn", "Ivy"].entries()) {
    const created = createPatient(db, amira, {
      givenName,
      familyName: "Lane",
      birthDate: `199${index + 1}-04-04`,
      sex: "female",
      idempotencyKey: `res-pat-${index}001`,
    });
    recordObservation(db, amira, { patientId: created.id, code: "8480-6", value: 121 + index, idempotencyKey: `res-obs-${index}001` });
  }
  buildPopulation(db, priya, "res-pop-0002");
  const second = snapshotResearchDataset(db, priya, { workspaceId: opened.workspaceId, idempotencyKey: "res-snap-0003" });
  assert.equal(second.version, 2);
  const after = readResearch(db, nabil);
  const datasets = after.workspaces[0]?.datasets ?? [];
  assert.equal(JSON.stringify(datasets.find((item) => item.version === 1)?.payload), frozen);
  assert.notEqual(JSON.stringify(datasets.find((item) => item.version === 2)?.payload), frozen);
  const requested = requestResearchExport(db, priya, { datasetId: first.datasetId, idempotencyKey: "res-exp-0001" });
  assert.equal(requested.status, "awaiting-approval");
  assert.throws(
    () => decideResearchExport(db, priya, { exportId: requested.exportId, decision: "approve", idempotencyKey: "res-dec-priya" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  const approved = decideResearchExport(db, nabil, { exportId: requested.exportId, decision: "approve", idempotencyKey: "res-dec-nabil" });
  assert.equal(approved.status, "approved");
  const released = readResearch(db, priya).workspaces[0]?.exports.find((item) => item.id === requested.exportId);
  assert.equal(released?.status, "approved");
  assert.equal(released?.approverId, FIXTURES.nabil);
  assert.equal(JSON.stringify(released?.body), frozen);
  assert.throws(
    () => decideResearchExport(db, nabil, { exportId: requested.exportId, decision: "decline", idempotencyKey: "res-dec-again" }),
    (error: unknown) => error instanceof Error,
  );
  recordPopulationJurisdiction(db, priya, { tag: "restricted", idempotencyKey: "res-tag-0001" });
  buildPopulation(db, priya, "res-pop-0003");
  assert.throws(
    () => snapshotResearchDataset(db, priya, { workspaceId: opened.workspaceId, idempotencyKey: "res-snap-0004" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const still = readResearch(db, priya).workspaces[0]?.datasets.find((item) => item.version === 1);
  assert.equal(JSON.stringify(still?.payload), frozen);
});
