import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sandboxFindings } from "../sandbox.mjs";
import { commandCatalog } from "./catalog.mjs";

export const POLICY = "CURASPHERE-US-GOVERNANCE-v2";
export const GATES = ["functionality", "database", "typecheck", "lint", "unit", "integration", "contracts", "authorization", "tenant-isolation", "privacy", "security", "clinical-safety", "e2e", "accessibility", "failure-recovery", "migration-recovery", "audit", "observability", "documentation", "dependency-regression"];
const CAPABILITIES = {
  tooling: "A", "synthetic-data": "A", scheduling: "B", workforce: "B", "billing-administration": "B",
  "clinical-record": "C", "clinical-orders": "C", "medication-workflow": "C", "clinical-exchange": "C", "emergency-access": "C",
  "diagnostic-ai": "D", "treatment-recommendation": "D", "autonomous-clinical-action": "D", "medical-image-interpretation": "D",
};
const RANK = { A: 1, B: 2, C: 3, D: 4 };
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function inside(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new Error("Repository-relative path required.");
  const full = path.resolve(root, relative);
  if (!full.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Path escapes the repository.");
  // Resolve every existing ancestor, including symlinks/junctions, for output paths too.
  let ancestor = full;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolved = realpathSync(ancestor);
  const base = realpathSync(root);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error("Symlink escapes the repository.");
  return full;
}

export function classify(feature) {
  if (!feature.intendedUse?.trim() || !Array.isArray(feature.capabilities) || !feature.capabilities.length) return "RESTRICTED";
  if (feature.capabilities.some((item) => !CAPABILITIES[item]) || feature.ambiguous === true) return "RESTRICTED";
  let derived = feature.capabilities.reduce((current, item) => RANK[CAPABILITIES[item]] > RANK[current] ? CAPABILITIES[item] : current, "A");
  const owned = feature.paths ?? [];
  if (owned.some((item) => ["apps", "apps/web", "packages/domain", "packages/domain/src"].includes(item))) return "RESTRICTED";
  const clinicalPath = owned.some((item) => /patient-chart|clinical-source|\/chart(?:\/|$)|\/clinical(?:\/|$)|\/emergency(?:\.ts|\/|$)|\/work\.ts$/.test(item));
  if ((feature.id === "P04-F05" || clinicalPath) && RANK[derived] < RANK.C) derived = "C";
  // A claimed class can raise restrictions, never lower capability-derived restrictions.
  if (feature.riskClass && (!RANK[feature.riskClass] || RANK[feature.riskClass] < RANK[derived])) return "RESTRICTED";
  return feature.riskClass && RANK[feature.riskClass] > RANK[derived] ? feature.riskClass : derived;
}

export function validatePlan(plan, request, masterplan) {
  const errors = [];
  if (plan.policy !== POLICY || request.requestedPolicy !== POLICY) errors.push("Unknown policy.");
  const ids = new Set();
  for (const feature of plan.features ?? []) {
    if (!/^(GOV-V2-MIGRATION|P\d{2}-F\d{2})$/.test(feature.id) || ids.has(feature.id)) errors.push("Invalid or duplicate feature.");
    ids.add(feature.id);
    if (classify(feature) === "RESTRICTED") errors.push(`${feature.id}: classification restricted.`);
    if (feature.id !== "GOV-V2-MIGRATION" && !masterplan.features.some((item) => item.feature_id === feature.id)) errors.push(`${feature.id}: absent from masterplan.`);
    if (!Array.isArray(feature.dependencies) || !Array.isArray(feature.paths) || !feature.paths.length) errors.push(`${feature.id}: missing dependency graph or owned paths.`);
    for (const id of GATES) {
      const gate = feature.gates?.[id];
      if (!gate) errors.push(`${feature.id}: missing ${id} gate.`);
      else if (!gate.notApplicable && (!gate.commands?.length || gate.commands.some((command) => !gate.proofs?.[command]?.length))) errors.push(`${feature.id}: ${id} lacks command proof requirements.`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function walk(id) {
    if (visiting.has(id)) { errors.push("Dependency cycle."); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const feature = plan.features.find((item) => item.id === id);
    for (const dependency of feature?.dependencies ?? []) {
      if (ids.has(dependency)) walk(dependency);
      else if (!masterplan.features.some((item) => item.feature_id === dependency)) errors.push(`${id}: unknown dependency ${dependency}.`);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) walk(id);
  if (!Array.isArray(request.authorizedFeatures) || request.parallelEngineeringAuthority !== "EXPLICIT_PRODUCT_OWNER_INSTRUCTION") errors.push("No explicit parallel engineering scope.");
  return errors;
}

export function historicalFindings(root, baseline) {
  const findings = [];
  for (const [relative, expected] of Object.entries(baseline.files)) {
    try {
      const raw = readFileSync(inside(root, relative));
      const alternateCheckout = process.platform !== baseline.recordedPlatform && baseline.canonicalTextDigests?.[relative];
      const canonicalMatch = alternateCheckout && hash(raw.toString("utf8").replaceAll("\r\n", "\n")) === baseline.canonicalTextDigests[relative];
      if (hash(raw) !== expected && !canonicalMatch) findings.push(`Historical record changed: ${relative}`);
    } catch { findings.push(`Historical record unavailable: ${relative}`); }
  }
  const amendment = "docs/constitution/amendments/DEV-GOV-2026-001.md";
  if (baseline.files[amendment] !== "b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8") findings.push("Original amendment digest mismatch.");
  return findings;
}

export function sourceSnapshot(root) {
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  const candidates = new Set(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean));
  if (existsSync(path.join(root, "apps/mobile/.git"))) {
    for (const item of git(["-C", "apps/mobile", "ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean)) candidates.add(`apps/mobile/${item}`);
  }
  const files = {};
  for (const relative of [...candidates].sort()) {
    if (/^(artifacts\/governance-v2\/|test-results\/|playwright-report\/)/.test(relative)
      || /^docs\/healthcare\/P04-F05-.*(?:\.log|\.png|e2e-results\.json)$/.test(relative)
      || relative === "docs/governance/v2/MIGRATION-EVIDENCE.md"
      || relative === "apps/web/next-env.d.ts") continue;
    const full = inside(root, relative);
    if (existsSync(full) && statSync(full).isFile()) files[relative] = hash(readFileSync(full));
  }
  // Include submodule dirty state; ordinary git ls-files lists only its gitlink.
  const status = git(["status", "--porcelain=v1", "--untracked-files=no"])
    .split(/\r?\n/).filter((line) => line.endsWith(" apps/mobile")).join("\n");
  return { revision: git(["rev-parse", "HEAD"]).trim(), dirty: Boolean(git(["status", "--porcelain"]).trim()), digest: hash(JSON.stringify({ files, mobileStatus: status })), files };
}

export function evaluateGates(feature, commands) {
  return GATES.map((id) => {
    const gate = feature.gates[id];
    if (gate.notApplicable) {
      // A tooling-only slice has no app database or user UI. No other gate can be waived.
      const allowed = classify(feature) === "A" && feature.capabilities.every((item) => ["tooling", "synthetic-data"].includes(item))
        && ["database", "migration-recovery", "e2e", "accessibility"].includes(id) && gate.reason?.length >= 20;
      return { id, result: allowed ? "NOT_APPLICABLE" : "FAIL", reason: allowed ? gate.reason : "Unsupported gate waiver." };
    }
    const records = (gate.commands ?? []).map((name) => commands[name]);
    if (!records.length || records.some((record) => !record || record.exitCode === null)) return { id, result: "NOT_VERIFIED", reason: "Required command did not complete." };
    if (records.some((record) => record.exitCode !== 0 || record.signal || record.timedOut)) return { id, result: "FAIL", reason: "Required command failed, timed out, or was interrupted." };
    for (const [commandId, patterns] of Object.entries(gate.proofs ?? {})) {
      const output = commands[commandId]?.output ?? "";
      if (patterns.some((pattern) => !new RegExp(pattern, "m").test(output))) return { id, result: "FAIL", reason: `Required observed proof absent from ${commandId}.` };
    }
    return { id, result: "PASS", commands: gate.commands };
  });
}

export function acceptance(gates) {
  return gates.length === GATES.length && new Set(gates.map((item) => item.id)).size === GATES.length
    && gates.every((item) => ["PASS", "NOT_APPLICABLE"].includes(item.result)) ? "ENGINEERING_ACCEPTED" : "BLOCKED";
}

export function validateEvidence(root, evidence, snapshot, feature, now = Date.now()) {
  const errors = [];
  if (evidence.policy !== POLICY || evidence.featureId !== feature.id || evidence.sourceDigest !== snapshot.digest || evidence.revision !== snapshot.revision) errors.push("Evidence is for another policy, feature or source snapshot.");
  const age = now - Date.parse(evidence.finishedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 24 * 60 * 60 * 1000) errors.push("Evidence timestamp is stale, future or invalid.");
  if (!Array.isArray(evidence.gates) || acceptance(evidence.gates) !== "ENGINEERING_ACCEPTED") errors.push("Incomplete or failing gates.");
  const catalog = commandCatalog(root);
  for (const [id, command] of Object.entries(evidence.commands ?? {})) {
    try {
      const spec = catalog[id];
      if (!spec || JSON.stringify(command.argv) !== JSON.stringify(spec.argv) || command.cwd !== spec.cwd || command.sourceDigest !== snapshot.digest) errors.push("Command identity or source digest mismatch.");
      if (hash(readFileSync(inside(root, command.log))) !== command.logSha256) errors.push("Evidence log digest mismatch.");
      if (!command.startedAt || !command.finishedAt || !Array.isArray(command.argv) || command.exitCode !== 0) errors.push("Command provenance is incomplete.");
    } catch { errors.push("Evidence log unavailable."); }
  }
  if (errors.length) return errors;
  // Recompute every gate; never trust an imported PASS label.
  const recomputed = evaluateGates(feature, Object.fromEntries(Object.entries(evidence.commands ?? {}).map(([id, command]) => [id, {
    ...command, output: existsSync(inside(root, command.log)) ? readFileSync(inside(root, command.log), "utf8") : "",
  }])));
  if (acceptance(recomputed) !== "ENGINEERING_ACCEPTED") errors.push("Recorded commands do not prove the feature's current mandatory gates.");
  return errors;
}

export function selectNext(plan, request, reports, legacy, snapshot, root) {
  for (const feature of plan.features) {
    if (!request.authorizedFeatures.includes(feature.id)) continue;
    if (reports[feature.id] && validateEvidence(root, reports[feature.id], snapshot, feature).length === 0) continue;
    const blocked = feature.dependencies.filter((id) => {
      const planned = plan.features.find((item) => item.id === id);
      if (planned) return !reports[id] || validateEvidence(root, reports[id], snapshot, planned).length !== 0;
      // Historical experimental evidence is a dependency baseline, not converted to v2 acceptance.
      return !legacy.features.some((item) => item.id === id && item.engineeringStatus === "EXPERIMENTAL_ENGINEERING_COMPLETE" && item.evidence && existsSync(inside(root, item.evidence)));
    });
    return { feature, blocked, status: blocked.length ? "BLOCKED_DEPENDENCY" : "READY" };
  }
  return { feature: null, blocked: [], status: "AUTHORIZED_SCOPE_COMPLETE" };
}

export function releaseEligibility(feature, gates, env) {
  const accepted = acceptance(gates) === "ENGINEERING_ACCEPTED";
  const implemented = ["functionality", "database", "documentation"].every((id) => ["PASS", "NOT_APPLICABLE"].includes(gates.find((item) => item.id === id)?.result));
  const sandbox = sandboxFindings(env);
  const riskClass = classify(feature);
  return {
    engineeringCompletion: implemented ? "ENGINEERING_COMPLETE" : "NOT_VERIFIED",
    automatedQualityGateAcceptance: accepted ? "ENGINEERING_ACCEPTED" : "BLOCKED",
    developmentDeploymentEligibility: accepted && sandbox.allowed && riskClass !== "RESTRICTED" ? "ELIGIBLE_LOCAL_SYNTHETIC" : "NOT_ELIGIBLE",
    stagingDeploymentEligibility: "NOT_ELIGIBLE",
    nonclinicalProductionReleaseEligibility: "NOT_ELIGIBLE",
    clinicalProductionReleaseEligibility: ["C", "D", "RESTRICTED"].includes(riskClass) ? "MANDATORY_AUTHORIZATIONS_NOT_VERIFIED" : "NOT_APPLICABLE",
    regulatedMedicalDeviceReleaseAuthorization: "NOT_AUTHORIZED",
    formalPolicyAdoption: "PROPOSED",
    productionAuthorized: false,
    blockers: ["No verified constitutional adoption of v2.", "No explicitly authorized staging/production target.", "Current unpushed working tree has no matching verified hosted CI.", "Legal/contractual/clinical/regulatory applicability and required authorizations are not established.", "Open R-IMG-DEBIAN (44 historical high findings), R-CI, R-GOVERNANCE and R-CLINICAL-DEFAULTS."],
  };
}
