import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { traceDecision, validateDecision } from "./validate-decision.mjs";

const decision = JSON.parse(readFileSync(new URL("../../docs/constitution/decisions/decision-sample.json", import.meta.url), "utf8"));

test("a sample decision traces to its author and review state", () => {
  assert.deepEqual(validateDecision(decision), []);
  assert.deepEqual(traceDecision(decision), {
    id: "DEC-SAMPLE-001",
    author: "CuraSphere constitution record",
    reviewState: "in-review",
  });
  for (const reviewer of decision.reviewers) {
    assert.equal(reviewer.name, null);
    assert.equal(reviewer.signedAt, null);
  }
});

test("an accepted decision without reviewer names is rejected", () => {
  const broken = structuredClone(decision);
  broken.reviewState = "accepted";
  assert.ok(validateDecision(broken).some((error) => error.includes("has not signed")));
});
