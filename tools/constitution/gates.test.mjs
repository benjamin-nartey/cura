import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateGateManifest } from "./validate-gates.mjs";

const constitution = JSON.parse(readFileSync(new URL("../../docs/constitution/release-constitution.json", import.meta.url), "utf8"));

test("the documentation sample manifest passes and claims no clinical sign-off", () => {
  assert.deepEqual(validateGateManifest(constitution.sampleManifest), []);
  assert.equal(constitution.sampleManifest.clinicalSignoff, null);
  assert.equal(constitution.sampleManifest.breakGlass, null);
  assert.equal(constitution.sampleManifest.surveillance.completedStudy, null);
});

test("an incomplete gate manifest is rejected", () => {
  const broken = structuredClone(constitution.sampleManifest);
  broken.tests = [];
  delete broken.rollback;
  broken.changeControl = { version: "release-constitution-2026.10" };
  assert.ok(validateGateManifest(broken).some((error) => error.includes("tests")));
  assert.ok(validateGateManifest(broken).some((error) => error.includes("rollback")));
  assert.ok(validateGateManifest(broken).some((error) => error.includes("Change control")));
});

test("clinical-impact without a named sign-off is rejected", () => {
  const broken = structuredClone(constitution.sampleManifest);
  broken.workflowClass = "clinical-impact";
  assert.ok(validateGateManifest(broken).some((error) => error.includes("Clinical sign-off")));
});

test("break-glass without an approver is rejected", () => {
  const broken = structuredClone(constitution.sampleManifest);
  broken.breakGlass = { reason: "A service is down.", scope: "one facility", expiresAt: "2026-10-14T13:26:00Z" };
  assert.ok(validateGateManifest(broken).some((error) => error.includes("Break-glass")));
});
