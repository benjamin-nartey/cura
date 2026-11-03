import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activationDecision, assessAuthorization } from "./lib.mjs";
import { sandboxFindings } from "./sandbox.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const amendmentHash = "b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8";

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function permittedFeature() {
  const relativePath = "docs/governance/experimental-engineering-register.json";
  if (!existsSync(path.join(root, relativePath))) return "P03-F01";
  const register = readJson(relativePath);
  const features = register.features ?? [];
  const next = features.find((feature) => feature.engineeringStatus !== "EXPERIMENTAL_ENGINEERING_COMPLETE");
  return next?.id ?? "none";
}

const phaseRegister = readJson("CuraSphere_Cursor_Pack/progress/phase-register.json");
const phase02 = phaseRegister.phases.find((phase) => phase.phase === 2);
const phase03 = phaseRegister.phases.find((phase) => phase.phase === 3);
const exception = readJson("docs/governance/development-exception-register.json");
const approvals = readJson("docs/identity/PHASE_02_APPROVALS.json");
const risks = readJson("docs/governance/outstanding-risk-register.json");
const amendment = readFileSync(path.join(root, "docs/constitution/amendments/DEV-GOV-2026-001.md"));
const observedAmendmentHash = createHash("sha256").update(amendment).digest("hex");
const sandbox = sandboxFindings(process.env);
const formalActivation = activationDecision(exception, assessAuthorization(null), []);
const missingApprovals = approvals.reviews.map((review) => ({
  reviewId: review.review_id,
  decision: review.decision,
  reviewerName: review.reviewer_name,
  result: "PENDING",
}));
const technicalFailures = (risks.risks ?? [])
  .filter((risk) => risk.status !== "remediated-in-image")
  .map((risk) => ({ id: risk.id, status: risk.status, result: "OPEN" }));

let experimentalStatus = "EXPERIMENTAL_DEVELOPMENT_INACTIVE";
if (sandbox.overrideRequested && sandbox.allowed) experimentalStatus = "EXPERIMENTAL_DEVELOPMENT_ACTIVE";
if (sandbox.overrideRequested && !sandbox.allowed) experimentalStatus = "EXPERIMENTAL_PROGRESSION_REFUSED";

const report = {
  generatedAt: new Date().toISOString(),
  formalGovernance: {
    phase02: phase02?.status ?? "UNKNOWN",
    phase03: "NOT_AUTHORIZED",
    phase03Register: phase03?.status ?? "UNKNOWN",
    exception: exception.status,
    developmentModeActive: false,
    productionClinicalBreakGlass: "DISABLED",
    activation: formalActivation,
    amendmentHash: observedAmendmentHash,
    amendmentHashMatches: observedAmendmentHash === amendmentHash,
  },
  experimentalDevelopment: {
    status: experimentalStatus,
    governanceAuthorization: false,
    permittedFeature: experimentalStatus === "EXPERIMENTAL_DEVELOPMENT_ACTIVE" ? permittedFeature() : null,
  },
  missingHumanApprovals: missingApprovals,
  outstandingTechnicalFailures: technicalFailures,
  environmentRestrictions: sandbox.findings,
  sandboxAllowed: sandbox.allowed,
};

const statusPath = process.env.EXPERIMENT_STATUS_PATH
  ? path.resolve(process.env.EXPERIMENT_STATUS_PATH)
  : path.join(root, "docs/governance/experimental-status.json");
writeFileSync(statusPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`formal_phase02=${report.formalGovernance.phase02}`);
console.log(`formal_phase03=${report.formalGovernance.phase03}`);
console.log(`formal_exception=${report.formalGovernance.exception}`);
console.log(`experimental=${experimentalStatus}`);
console.log(`permitted_feature=${report.experimentalDevelopment.permittedFeature ?? "none"}`);
console.log(`amendment_hash_matches=${report.formalGovernance.amendmentHashMatches}`);
for (const review of missingApprovals) console.log(`${review.reviewId}=PENDING`);
for (const risk of technicalFailures) console.log(`${risk.id}=OPEN`);
for (const finding of sandbox.findings) console.log(`restriction=${finding}`);
if (experimentalStatus !== "EXPERIMENTAL_DEVELOPMENT_ACTIVE") process.exit(1);
