import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { releaseBlockers, validateAiRisk, validateRisk } from "./validate-risk.mjs";

const register = JSON.parse(readFileSync(new URL("../../docs/constitution/risk-governance.json", import.meta.url), "utf8"));
const risk = register.risks[0];

test("the blocked high-risk sample has no release approval and no validation evidence", () => {
  assert.deepEqual(validateRisk(risk), []);
  assert.deepEqual(validateAiRisk(register.aiRisks[0]), []);
  assert.equal(risk.status, "blocked");
  assert.equal(risk.severity, "high");
  assert.equal(risk.approval, null);
  assert.equal(risk.validationEvidence, null);
  assert.equal(risk.releaseApproval, null);
  assert.ok(releaseBlockers(risk).includes("A blocked high-risk item cannot receive release approval."));
});

test("adding a release approval to the blocked sample is rejected", () => {
  const broken = structuredClone(risk);
  broken.releaseApproval = { approverName: "Unnamed", approvedAt: "2026-10-13T13:26:00Z" };
  assert.ok(releaseBlockers(broken).some((error) => error.includes("cannot be recorded")));
});

test("an AI risk cannot default to unregulated", () => {
  const broken = structuredClone(register.aiRisks[0]);
  broken.regulatoryClassification = "unregulated";
  assert.ok(validateAiRisk(broken).some((error) => error.includes("unregulated")));
});
