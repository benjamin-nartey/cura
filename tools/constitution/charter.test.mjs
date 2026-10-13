import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { acceptanceBlockers, validateCharter } from "./validate-charter.mjs";

const charter = JSON.parse(readFileSync(new URL("../../docs/constitution/product-charter.json", import.meta.url), "utf8"));

test("the product charter links every capability to a persona and an intended use", () => {
  assert.deepEqual(validateCharter(charter), []);
  assert.equal(charter.jurisdictions.production, null);
  for (const capability of charter.capabilities) {
    assert.ok(capability.personaIds.length > 0);
    assert.ok(capability.intendedUse.length >= 8);
    assert.ok(capability.workflowClass === "administrative" || capability.workflowClass === "clinical-impact");
    assert.notEqual(capability.regulatoryClassification, "unregulated");
  }
  assert.ok(charter.capabilities.some((capability) => capability.workflowClass === "administrative"));
  assert.ok(charter.capabilities.some((capability) => capability.workflowClass === "clinical-impact"));
});

test("a capability without a persona is rejected", () => {
  const broken = structuredClone(charter);
  broken.capabilities[0].personaIds = [];
  assert.ok(validateCharter(broken).some((error) => error.includes("no persona")));
});

test("an unregulated default is rejected", () => {
  const broken = structuredClone(charter);
  broken.capabilities[0].regulatoryClassification = "unregulated";
  assert.ok(validateCharter(broken).some((error) => error.includes("unregulated")));
});

test("the product owner approved this charter version", () => {
  assert.equal(charter.id, "charter-2026.10");
  assert.equal(charter.status, "approved");
  assert.equal(charter.approval.requiredRole, "product owner");
  assert.equal(charter.approval.status, "approved");
  assert.equal(charter.approval.approverName, "Benjamin Tetteh Nartey");
  assert.equal(charter.approval.approvedAt, "2026-10-13T13:26:00Z");
  assert.equal(charter.approval.documentVersion, "charter-2026.10");
  assert.equal(charter.approvalHistory[0].status, "pending");
  assert.equal(charter.approvalHistory[0].approverName, null);
  assert.deepEqual(acceptanceBlockers(charter), []);
});

test("approval of a different document version is rejected", () => {
  const broken = structuredClone(charter);
  broken.approval.documentVersion = "charter-other";
  assert.ok(validateCharter(broken).some((error) => error.includes("charter version")));
});

test("removing the approver name blocks acceptance", () => {
  const broken = structuredClone(charter);
  broken.approval.approverName = "";
  assert.ok(acceptanceBlockers(broken).some((error) => error.includes("name")));
});
