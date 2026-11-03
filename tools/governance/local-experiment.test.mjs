import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { activationDecision, assessAuthorization } from "./lib.mjs";
import { refuseUnsafeOverride, sandboxFindings } from "./sandbox.mjs";
import { testBash } from "../test-shell.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const formalPaths = [
  "docs/identity/PHASE_02_APPROVALS.json",
  "docs/constitution/amendments/DEV-GOV-2026-001.md",
  "docs/governance/development-exception-register.json",
  "CuraSphere_Cursor_Pack/progress/phase-register.json",
  "CuraSphere_Cursor_Pack/progress/feature-register.json",
  "docs/governance/signatures/architecture-decision.json",
];

function sha(relativePath) {
  return createHash("sha256").update(readFileSync(path.join(root, relativePath))).digest("hex");
}

function run(extra = {}) {
  const statusDir = mkdtempSync(path.join(tmpdir(), "curasphere-experiment-"));
  const statusPath = path.join(statusDir, "status.json");
  const result = spawnSync(process.execPath, ["tools/governance/local-experiment.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CURASPHERE_LOCAL_PHASE_OVERRIDE: "true",
      CURASPHERE_DEV_DIRECTORY: "local-test",
      CURASPHERE_ENV: "local",
      CURASPHERE_DATA_CLASS: "synthetic",
      CURASPHERE_PRODUCTION_DATABASE: "",
      CURASPHERE_PRODUCTION_CREDENTIALS: "",
      CURASPHERE_REAL_PHI: "",
      CURASPHERE_ALLOW_PUBLISH: "",
      CURASPHERE_EXTERNAL_HEALTHCARE: "",
      CURASPHERE_CLINICAL_EMERGENCY: "",
      CURASPHERE_DEPLOY_TARGET: "",
      DATABASE_URL: "",
      NODE_ENV: "test",
      EXPERIMENT_STATUS_PATH: statusPath,
      ...extra,
    },
  });
  return { ...result, statusPath, report: JSON.parse(readFileSync(statusPath, "utf8")) };
}

test("a verified local sandbox preserves governance and stops after the completed experimental scope", () => {
  const before = Object.fromEntries(formalPaths.map((item) => [item, sha(item)]));
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.experimentalDevelopment.status, "EXPERIMENTAL_DEVELOPMENT_ACTIVE");
  assert.equal(result.report.experimentalDevelopment.governanceAuthorization, false);
  assert.equal(result.report.experimentalDevelopment.permittedFeature, "none");
  assert.equal(result.report.formalGovernance.phase02, "IN_PROGRESS");
  assert.equal(result.report.formalGovernance.phase03, "NOT_AUTHORIZED");
  assert.equal(result.report.formalGovernance.exception, "PROPOSED");
  assert.equal(result.report.formalGovernance.activation.phase03Development, "NOT_AUTHORIZED");
  assert.equal(result.report.formalGovernance.amendmentHashMatches, true);
  for (const review of result.report.missingHumanApprovals) {
    assert.equal(review.decision, "PENDING");
    assert.equal(review.result, "PENDING");
    assert.equal(review.reviewerName, null);
  }
  assert.match(result.stdout, /P02-R01=PENDING/);
  assert.doesNotMatch(result.stdout, /P02-R0[1-6]=PASS/);
  assert.match(result.stdout, /R-IMG-DEBIAN=OPEN/);
  assert.match(result.stdout, /R-CI=OPEN/);
  for (const item of formalPaths) assert.equal(sha(item), before[item]);
  const signature = JSON.parse(readFileSync(path.join(root, "docs/governance/signatures/architecture-decision.json"), "utf8"));
  assert.equal(signature.reviewerName ?? signature.decision ?? null, signature.decision);
  assert.equal(signature.decision, null);
});

test("staging, production, clinical emergency, and production data refuse the override", () => {
  for (const extra of [
    { CURASPHERE_ENV: "staging" },
    { CURASPHERE_ENV: "production" },
    { CURASPHERE_CLINICAL_EMERGENCY: "enabled" },
    { DATABASE_URL: "postgres://prod.example/curasphere" },
    { CURASPHERE_PRODUCTION_CREDENTIALS: "true" },
    { CURASPHERE_DATA_CLASS: "real" },
    { NODE_ENV: "development", CURASPHERE_DEV_DIRECTORY: "development", CURASPHERE_ENV: "development" },
  ]) {
    const result = run(extra);
    assert.equal(result.status, 1);
    assert.equal(result.report.experimentalDevelopment.status, "EXPERIMENTAL_PROGRESSION_REFUSED");
    assert.equal(result.report.experimentalDevelopment.permittedFeature, null);
    assert.equal(result.report.formalGovernance.phase03, "NOT_AUTHORIZED");
  }
  assert.throws(() => refuseUnsafeOverride({ ...process.env, CURASPHERE_LOCAL_PHASE_OVERRIDE: "true", CURASPHERE_ENV: "production" }), /refused/);
  assert.equal(sandboxFindings({ CURASPHERE_LOCAL_PHASE_OVERRIDE: "false", NODE_ENV: "development" }).allowed, false);
});

test("disabling the flag restores ordinary sequential enforcement", () => {
  const result = run({ CURASPHERE_LOCAL_PHASE_OVERRIDE: "false" });
  assert.equal(result.status, 1);
  assert.equal(result.report.experimentalDevelopment.status, "EXPERIMENTAL_DEVELOPMENT_INACTIVE");
  assert.equal(result.report.experimentalDevelopment.permittedFeature, null);
  assert.equal(result.report.formalGovernance.activation.developmentException, "PROPOSED");
});

test("deployment scripts reject experimental artifacts and the formal checker stays closed", () => {
  const deploy = spawnSync(testBash, ["infra/delivery/deploy.sh", "dev"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CURASPHERE_LOCAL_PHASE_OVERRIDE: "true" },
  });
  assert.equal(deploy.status, 1);
  assert.match(deploy.stderr, /cannot be published or deployed/);
  const simulate = spawnSync(testBash, ["infra/delivery/simulate.sh"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CURASPHERE_LOCAL_PHASE_OVERRIDE: "true" },
  });
  assert.equal(simulate.status, 1);
  assert.match(simulate.stderr, /cannot be published or deployed/);
  const unchanged = spawnSync(testBash, ["infra/delivery/deploy.sh", "production"], { cwd: root, encoding: "utf8" });
  assert.equal(unchanged.status, 2);
  const activation = activationDecision({ status: "PROPOSED" }, assessAuthorization(null), []);
  assert.equal(activation.developmentException, "PROPOSED");
  assert.equal(activation.phase03Development, "NOT_AUTHORIZED");
  assert.equal(activation.developmentModeActive, false);
});
