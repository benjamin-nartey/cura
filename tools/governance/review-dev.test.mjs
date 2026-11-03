import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  activationDecision,
  assessAuthorization,
  overallResult,
  pendingApprovals,
  readJson,
  validateMatrix,
} from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the control matrix names editions and refuses a conformity claim", () => {
  const matrix = readJson(root, "docs/governance/standards-control-matrix.json");
  assert.deepEqual(validateMatrix(matrix), []);
  assert.equal(matrix.frameworks.find((item) => item.id === "ISO-IEC-27701").edition, "2025");
});

test("pending Phase 02 reviews are unchanged by the checker", () => {
  const approvals = readJson(root, "docs/identity/PHASE_02_APPROVALS.json");
  assert.deepEqual(pendingApprovals(approvals), []);
  assert.equal(approvals.reviews.length, 6);
});

test("a passing automated result cannot activate the exception", () => {
  const findings = [{ id: "SEC-DOMAIN-SUITE", hardStop: true, result: "PASS" }];
  const activation = activationDecision({ status: "PROPOSED" }, { valid: false, errors: ["No signed authorization file is present."] }, findings);
  assert.equal(activation.developmentException, "PROPOSED");
  assert.equal(activation.phase03Development, "NOT_AUTHORIZED");
  assert.equal(overallResult(findings), "AUTOMATED_EVIDENCE_RECORDED");
});

test("one person cannot sign two reviewer roles", () => {
  const result = assessAuthorization(
    {
      exceptionId: "DEV-GOV-2026-001",
      amendmentSha256: "abc",
      reviewers: [
        { role: "architecture", name: "Case Reviewer", signedAt: "2026-10-14T00:00:00Z" },
        { role: "security", name: "Case Reviewer", signedAt: "2026-10-14T00:00:00Z" },
        { role: "clinical", name: "Other Reviewer", signedAt: "2026-10-14T00:00:00Z" },
      ],
      productOwner: { name: "Owner Example", signedAt: "2026-10-14T00:00:00Z", statement: "I authorize this development exception." },
    },
    "abc",
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /more than one reviewer role/);
});

test("a hard-stop failure blocks activation even with signatures", () => {
  const findings = [{ id: "CLIN-ENV-DENY", hardStop: true, result: "FAIL" }];
  const activation = activationDecision({ status: "PROPOSED" }, { valid: true, errors: [] }, findings);
  assert.equal(activation.phase03Development, "NOT_AUTHORIZED");
  assert.equal(overallResult(findings), "AUTOMATED_HARD_STOP");
});

test("the static review leaves the exception proposed", () => {
  const evidence = path.join(tmpdir(), "curasphere-gov-evidence");
  const result = spawnSync(process.execPath, ["tools/governance/review-dev.mjs", "--static-only"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GOV_EVIDENCE_DIR: evidence },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /exception=PROPOSED/);
  assert.match(result.stdout, /phase03=NOT_AUTHORIZED/);
  const register = readJson(root, "docs/governance/development-exception-register.json");
  assert.equal(register.status, "PROPOSED");
  assert.equal(register.phase03Development, "NOT_AUTHORIZED");
  assert.equal(register.developmentModeActive, false);
});
