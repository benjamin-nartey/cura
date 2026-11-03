import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const RESULTS = new Set(["PASS", "FAIL", "NOT_VERIFIED", "HUMAN_JUDGMENT_REQUIRED"]);
const REVIEW_ROLES = ["architecture", "security", "clinical"];
const FORBIDDEN_SIGNERS = new Set([
  "kwame boateng",
  "esi boateng",
  "ama mensah",
  "yaa asare",
  "adwoa",
  "kojo agyeman",
  "kojo mensah",
]);

export function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

export function sha256File(root, relativePath) {
  return createHash("sha256").update(readFileSync(path.join(root, relativePath))).digest("hex");
}

export function validateMatrix(matrix) {
  const errors = [];
  if (matrix?.policy !== "CURASPHERE-DEV-GOVERNANCE-v1") errors.push("Policy id is not CURASPHERE-DEV-GOVERNANCE-v1.");
  if (matrix?.conformityClaim !== false) errors.push("The matrix must not claim conformity.");
  const ids = new Set();
  for (const framework of matrix?.frameworks ?? []) {
    if (!framework.id || !framework.edition || !framework.url) errors.push(`Framework ${framework.id ?? "unknown"} is missing an edition or URL.`);
    if (framework.fullTextReviewed !== false) errors.push(`${framework.id} must not claim a full-text review.`);
    ids.add(framework.id);
  }
  for (const control of matrix?.controls ?? []) {
    if (!control.id || !control.framework || !control.objective || !control.review) errors.push(`Control ${control.id ?? "unknown"} is incomplete.`);
    if (!ids.has(control.framework)) errors.push(`${control.id} cites an unknown framework ${control.framework}.`);
    if (!["files", "source", "command", "human", "json-status"].includes(control.check)) errors.push(`${control.id} has an unknown check.`);
  }
  return errors;
}

export function evaluateStatic(root, control) {
  if (control.check === "human") {
    return finish(control, "HUMAN_JUDGMENT_REQUIRED", "No automated result can satisfy this control.");
  }
  if (control.check === "files") {
    const missing = control.paths.filter((item) => !existsSync(path.join(root, item)));
    return finish(control, missing.length ? "FAIL" : "PASS", missing.length ? `Missing ${missing.join(", ")}` : "All listed files exist.");
  }
  if (control.check === "source") {
    const problems = [];
    for (const rule of control.source ?? []) {
      const full = path.join(root, rule.path);
      if (!existsSync(full)) {
        problems.push(`Missing ${rule.path}`);
        continue;
      }
      const text = readFileSync(full, "utf8");
      for (const needle of rule.includes ?? []) {
        if (!text.includes(needle)) problems.push(`${rule.path} lacks ${needle}`);
      }
    }
    for (const absent of control.absent ?? []) {
      if (existsSync(path.join(root, absent))) problems.push(`Unexpected file ${absent}`);
    }
    return finish(control, problems.length ? "FAIL" : "PASS", problems.join("; ") || "Source checks matched.");
  }
  if (control.check === "json-status") {
    const register = readJson(root, "CuraSphere_Cursor_Pack/progress/feature-register.json");
    const problems = [];
    for (const [featureId, expected] of Object.entries(control.featureStatus ?? {})) {
      const feature = register.features.find((item) => item.feature_id === featureId);
      if (!feature) problems.push(`${featureId} is not in the feature register`);
      else if (feature.status !== expected) problems.push(`${featureId} is ${feature.status}, expected ${expected}`);
    }
    return finish(control, problems.length ? "FAIL" : "PASS", problems.join("; ") || "Feature statuses matched.");
  }
  return finish(control, "NOT_VERIFIED", "This control waits for a command result.");
}

export function evaluateCommand(control, commands) {
  const run = commands[control.command];
  if (!run) return finish(control, "NOT_VERIFIED", `Command ${control.command} did not run.`);
  if (run.result) return finish(control, run.result, run.summary);
  return finish(control, run.exitCode === 0 ? "PASS" : "FAIL", run.summary);
}

function finish(control, result, summary) {
  const applied = control.resultOverride && result === "PASS" ? control.resultOverride : result;
  return {
    id: control.id,
    review: control.review,
    framework: control.framework,
    objective: control.objective,
    component: control.component,
    hardStop: Boolean(control.hardStop),
    result: applied,
    summary,
    outstanding: control.outstanding ?? (applied === "PASS" ? "" : summary),
  };
}

export function pendingApprovals(approvals) {
  const errors = [];
  for (const review of approvals?.reviews ?? []) {
    if (review.decision !== "PENDING") errors.push(`${review.review_id} is ${review.decision}.`);
    if (review.reviewer_name) errors.push(`${review.review_id} has a reviewer name.`);
    if (review.decided_at) errors.push(`${review.review_id} has a decision time.`);
  }
  return errors;
}

export function assessAuthorization(authorization, amendmentSha) {
  const errors = [];
  if (!authorization) return { valid: false, errors: ["No signed authorization file is present."] };
  if (authorization.exceptionId !== "DEV-GOV-2026-001") errors.push("Authorization is for a different exception.");
  if (authorization.amendmentSha256 !== amendmentSha) errors.push("Authorization hash does not match the amendment.");
  const names = [];
  for (const role of REVIEW_ROLES) {
    const reviewer = (authorization.reviewers ?? []).find((item) => item.role === role);
    if (!reviewer?.name || !reviewer.signedAt) errors.push(`${role} has not signed the exception.`);
    else names.push(reviewer.name.trim().toLowerCase());
  }
  if (new Set(names).size !== names.length) errors.push("One person cannot sign more than one reviewer role.");
  for (const name of names) {
    if (FORBIDDEN_SIGNERS.has(name)) errors.push("A synthetic workforce name cannot sign.");
  }
  const owner = authorization.productOwner;
  if (!owner?.name || !owner.signedAt || !String(owner.statement ?? "").includes("development exception")) {
    errors.push("The product owner has not authorized this development exception.");
  }
  if (owner?.name && names.includes(owner.name.trim().toLowerCase())) errors.push("The product owner cannot also be a reviewer.");
  return { valid: errors.length === 0, errors };
}

export function overallResult(findings) {
  if (findings.some((item) => item.hardStop && item.result === "FAIL")) return "AUTOMATED_HARD_STOP";
  if (findings.some((item) => item.result === "FAIL")) return "AUTOMATED_EVIDENCE_WITH_FAILURES";
  return "AUTOMATED_EVIDENCE_RECORDED";
}

export function activationDecision(register, authorizationResult, findings) {
  const blocked = [];
  if (register.status === "ACTIVE") blocked.push("The register says ACTIVE, but activation is not accepted from a status flag.");
  if (!authorizationResult.valid) blocked.push(...authorizationResult.errors);
  if (findings.some((item) => item.hardStop && item.result === "FAIL")) blocked.push("A hard-stop control failed.");
  return {
    developmentException: "PROPOSED",
    developmentModeActive: false,
    phase03Development: "NOT_AUTHORIZED",
    blocked,
  };
}
