import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { acceptance, classify, evaluateGates, GATES, hash, historicalFindings, inside, POLICY, readJson, releaseEligibility, sourceSnapshot, validateEvidence, validatePlan } from "./core.mjs";
import { commandCatalog } from "./catalog.mjs";
import { execute, redact } from "./process.mjs";
import { env, feature, fixtureRoot } from "./test-fixtures.mjs";
import { ROOT, V2, loadContext } from "./verify.mjs";

test("risk classification follows mixed capabilities and refuses lowered or unknown labels", () => {
  assert.equal(classify(feature()), "A");
  assert.equal(classify({ ...feature(), capabilities: ["billing-administration", "clinical-record"], riskClass: "C" }), "C");
  assert.equal(classify({ ...feature(), capabilities: ["clinical-record"], riskClass: "B" }), "RESTRICTED");
  assert.equal(classify({ ...feature(), capabilities: ["diagnostic-ai"], riskClass: "D" }), "D");
  assert.equal(classify({ ...feature(), capabilities: ["unrecognized"] }), "RESTRICTED");
  assert.equal(classify({ ...feature(), intendedUse: "" }), "RESTRICTED");
  assert.equal(classify({ ...feature(), paths: ["packages/domain/src/patient-chart.ts"] }), "RESTRICTED");
});

test("all twenty gates distinguish missing failed skipped and justified non-applicability", () => {
  assert.equal(GATES.length, 20);
  const item = feature();
  assert.equal(acceptance(evaluateGates(item, {})), "BLOCKED");
  assert.equal(evaluateGates(item, {})[0].result, "NOT_VERIFIED");
  assert.equal(acceptance(evaluateGates(item, { "v2-tests": { exitCode: 0, output: "# fail 0\n# skipped 2" } })), "BLOCKED");
  assert.equal(acceptance(evaluateGates(item, { "v2-tests": { exitCode: 1, output: "# fail 0\n# skipped 0" } })), "BLOCKED");
  assert.equal(acceptance(evaluateGates(item, { "v2-tests": { exitCode: 0, timedOut: true, output: "# fail 0\n# skipped 0" } })), "BLOCKED");
  item.gates.database = { notApplicable: true, reason: "No application database exists in this tooling slice." };
  assert.equal(evaluateGates(item, {})[1].result, "NOT_APPLICABLE");
  item.capabilities = ["clinical-record"]; item.riskClass = "C";
  assert.equal(evaluateGates(item, {})[1].result, "FAIL");
  assert.equal(acceptance([]), "BLOCKED");
});

test("historical governance and accepted implementation evidence are preserved", () => {
  const baseline = readJson(inside(ROOT, `${V2}/historical-baseline.json`));
  assert.deepEqual(historicalFindings(ROOT, baseline), []);
  const approvals = readJson(inside(ROOT, "docs/identity/PHASE_02_APPROVALS.json"));
  assert.equal(approvals.reviews.length, 6);
  assert.ok(approvals.reviews.every((item) => item.decision === "PENDING" && item.reviewer_name === null));
  const risk = readJson(inside(ROOT, "docs/governance/outstanding-risk-register.json")).risks.find((item) => item.id === "R-IMG-DEBIAN");
  assert.equal(risk.status, "open"); assert.match(risk.summary, /44 high/);
  const altered = structuredClone(baseline);
  altered.files["docs/constitution/release-constitution.json"] = "invalid";
  assert.match(historicalFindings(ROOT, altered).join(" "), /changed/);
});

test("production and staging never become eligible from synthetic gates or a selected risk label", () => {
  const gates = GATES.map((id) => ({ id, result: "PASS" }));
  const result = releaseEligibility(feature(), gates, env);
  assert.equal(result.developmentDeploymentEligibility, "ELIGIBLE_LOCAL_SYNTHETIC");
  assert.equal(result.formalPolicyAdoption, "PROPOSED");
  assert.equal(result.nonclinicalProductionReleaseEligibility, "NOT_ELIGIBLE");
  assert.equal(result.stagingDeploymentEligibility, "NOT_ELIGIBLE");
  assert.equal(result.productionAuthorized, false);
  const failedSecurity = gates.map((gate) => gate.id === "security" ? { ...gate, result: "FAIL" } : gate);
  assert.equal(releaseEligibility(feature(), failedSecurity, env).engineeringCompletion, "ENGINEERING_COMPLETE");
  assert.equal(releaseEligibility(feature(), failedSecurity, env).automatedQualityGateAcceptance, "BLOCKED");
  for (const target of ["production", "staging"]) assert.equal(releaseEligibility(feature(), gates, { ...env, CURASPHERE_ENV: target }).developmentDeploymentEligibility, "NOT_ELIGIBLE");
  const clinical = releaseEligibility({ ...feature(), riskClass: "C", capabilities: ["clinical-record"] }, gates, env);
  assert.equal(clinical.clinicalProductionReleaseEligibility, "MANDATORY_AUTHORIZATIONS_NOT_VERIFIED");
  assert.equal(clinical.regulatedMedicalDeviceReleaseAuthorization, "NOT_AUTHORIZED");
});

test("paths cannot traverse outside the repository and logs redact credential canaries", () => {
  assert.throws(() => inside(ROOT, "../outside"), /escapes/);
  assert.throws(() => inside(ROOT, path.resolve(ROOT, "outside")), /relative/);
  const safe = redact("Bearer credential_canary password=secret_canary api_key=key_canary");
  assert.doesNotMatch(safe, /credential_canary|secret_canary|key_canary/);
  assert.match(safe, /REDACTED/);
});

test("plan must match masterplan and contain a real dependency graph and explicit proofs", () => {
  const current = loadContext();
  assert.deepEqual(validatePlan(current.plan, current.request, current.masterplan), []);
  const missing = structuredClone(current.plan);
  delete missing.features[0].gates.lint;
  assert.ok(validatePlan(missing, current.request, current.masterplan).length);
  const cycle = structuredClone(current.plan);
  cycle.features[0].dependencies.push("P04-F05");
  assert.match(validatePlan(cycle, current.request, current.masterplan).join(" "), /cycle/);
  const unknown = structuredClone(current.plan);
  unknown.features[0].gates.functionality = { commands: ["echo-pass"] };
  assert.match(validatePlan(unknown, current.request, current.masterplan).join(" "), /proof/);
});

test("evidence records actual command provenance and rejects stale tampered or forged PASS results", async () => {
  const root = fixtureRoot();
  writeFileSync(path.join(root, "implemented.txt"), "synthetic implementation");
  const source = sourceSnapshot(root);
  const command = await execute(root, commandCatalog(root)["v2-tests"], "artifacts/governance-v2/proof.log", env);
  assert.equal(command.exitCode, 0);
  const item = feature();
  const report = { policy: POLICY, featureId: item.id, revision: source.revision, sourceDigest: source.digest, finishedAt: new Date().toISOString(), gates: evaluateGates(item, { "v2-tests": command }), commands: { "v2-tests": { ...command, sourceDigest: source.digest } } };
  assert.deepEqual(validateEvidence(root, report, source, item), []);
  assert.ok(validateEvidence(root, { ...report, finishedAt: "2020-01-01" }, source, item).length);
  assert.ok(validateEvidence(root, { ...report, sourceDigest: "another-source" }, source, item).length);
  const forged = structuredClone(report);
  forged.commands["v2-tests"].argv = ["echo", "PASS"];
  assert.match(validateEvidence(root, forged, source, item).join(" "), /identity/);
  writeFileSync(path.join(root, "artifacts/governance-v2/proof.log"), "tampered");
  assert.match(validateEvidence(root, report, source, item).join(" "), /digest/);
});

test("documentation and standards sources explicitly separate implementation proposal and release", () => {
  for (const name of ["transition-plan.md", "standards-applicability.json", "risk-classification-policy.md", "engineering-gates.md", "release-eligibility-policy.md", "risk-disposition-policy.md", "risk-disposition-register.json", "ci-cd-verification.md", "phase-progression.md"]) {
    assert.ok(readFileSync(inside(ROOT, `${V2}/${name}`)).length > 50, name);
  }
  const matrix = readJson(inside(ROOT, `${V2}/standards-applicability.json`));
  assert.equal(matrix.conformityClaim, false);
  assert.deepEqual(matrix.csfFunctions, ["Govern", "Identify", "Protect", "Detect", "Respond", "Recover"]);
  assert.equal(matrix.frameworks.find((item) => item.id === "QMSR").edition, "21 CFR 820; effective 2026-02-02; ISO 13485:2016 incorporated by reference");
  assert.ok(matrix.frameworks.every((item) => item.source.startsWith("https://") && item.exclusions && item.testEvidence));
  assert.equal(hash(readFileSync(inside(ROOT, `${V2}/requests/product-owner-2026-11-03.md`))), readJson(inside(ROOT, `${V2}/policy-request.json`)).sourceSha256);
});
