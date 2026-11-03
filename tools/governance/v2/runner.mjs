import { randomUUID } from "node:crypto";
import { mkdirSync, openSync, closeSync, ftruncateSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, historicalFindings, inside, POLICY, selectNext, sourceSnapshot } from "./core.mjs";
import { execute } from "./process.mjs";
import { loadContext, verifyFeature } from "./verify.mjs";
import { sandboxFindings } from "../sandbox.mjs";

export function acquireLock(root) {
  const file = inside(root, "artifacts/governance-v2/active.lock");
  mkdirSync(path.dirname(file), { recursive: true });
  const fd = openSync(file, "wx");
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), owner: "single-feature-engineering-runner" }));
  const release = () => { closeSync(fd); unlinkSync(file); };
  release.setFeature = (id) => {
    ftruncateSync(fd, 0);
    writeSync(fd, JSON.stringify({ pid: process.pid, activeFeature: id, updatedAt: new Date().toISOString() }), 0);
  };
  return release;
}

export function workerPrompt(feature, failedReport) {
  return `Implement or repair exactly ${feature.id}. Intended use: ${feature.intendedUse}.
Read ${feature.specification} and repository guidance before code. Owned paths: ${feature.paths.join(", ")}.
Existing work must be preserved. Only local synthetic data is permitted. No push, merge, publication, deployment,
real PHI, payment collection, prescription transmission, dispensing or production clinical emergency access.
Do not edit the governance engine, request, plan, historical baseline, formal registers or old acceptance evidence.
Do not weaken tests or fabricate results. Do not start another feature. Required gates are ${Object.keys(feature.gates).join(", ")}.
${failedReport ? `Current independent assessment: ${JSON.stringify(failedReport.gates.filter((item) => !["PASS", "NOT_APPLICABLE"].includes(item.result)))}` : "Implement the complete authorized vertical slice."}
The independent runner will execute the gates after you finish; your final prose cannot accept the feature.`;
}

export async function implementFeature(context, feature, report, attempt, env = process.env) {
  if (!sandboxFindings(env).allowed || classify(feature) === "RESTRICTED") throw new Error("Worker sandbox/classification refused.");
  const before = sourceSnapshot(context.root);
  const run = `artifacts/governance-v2/worker-${feature.id}-${randomUUID()}`;
  mkdirSync(inside(context.root, run), { recursive: true });
  const prompt = workerPrompt(feature, report);
  writeFileSync(inside(context.root, `${run}/task.txt`), prompt, { flag: "wx" });
  const result = await execute(context.root, {
    argv: ["codex", "exec", "--sandbox", "workspace-write", "--ephemeral", "--json", "-c", "approval_policy=\"never\"", "-C", context.root, "-"],
    cwd: ".", timeoutMs: 30 * 60 * 1000,
  }, `${run}/worker.log`, env, prompt);
  const after = sourceSnapshot(context.root);
  const changed = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  const outside = [...changed].filter((file) => before.files[file] !== after.files[file]
    && !feature.paths.some((owned) => file === owned || file.startsWith(`${owned}/`)));
  if (outside.length || historicalFindings(context.root, context.baseline).length) throw new Error(`Worker edited outside its feature boundary: ${outside.join(", ")}. Changes retained for inspection; no acceptance.`);
  return { ...result, attempt, changedFiles: [...changed].filter((file) => before.files[file] !== after.files[file]) };
}

export async function runEngineering(context, options = {}) {
  const { root, plan, request, legacy } = context;
  if (!sandboxFindings(options.env ?? process.env).allowed) throw new Error("Runner requires the isolated local synthetic sandbox.");
  if (options.requestedFeature && !request.authorizedFeatures.includes(options.requestedFeature)) throw new Error("Requested feature is outside authorized scope.");
  const release = acquireLock(root);
  const reports = {};
  const cache = {};
  const verify = options.verify ?? verifyFeature;
  const implement = options.implement ?? implementFeature;
  const actions = [];
  const finish = (result) => {
    const file = `artifacts/governance-v2/execution-${randomUUID()}.json`;
    writeFileSync(inside(root, file), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    writeFileSync(inside(root, "artifacts/governance-v2/latest.json"), `${JSON.stringify({ execution: file, ...result }, null, 2)}\n`);
    console.log(`${result.status}; execution=${file}`);
    return result;
  };
  try {
    while (true) {
      const source = sourceSnapshot(root);
      const next = selectNext(plan, request, reports, legacy, source, root);
      if (!next.feature || next.status !== "READY") {
        const result = { policy: POLICY, finishedAt: new Date().toISOString(), status: next.status, activeFeature: null, blockedDependencies: next.blocked, reports: Object.fromEntries(Object.entries(reports).map(([id, report]) => [id, `${report.evidenceDirectory}/assessment.json`])), actions, phase05: "PLAN_ONLY", productionAuthorized: false };
        return finish(result);
      }
      const feature = next.feature;
      release.setFeature(feature.id);
      if (options.requestedFeature && feature.id !== options.requestedFeature) {
        // Dependencies are verified first; selecting a later feature never skips them.
        console.log(`Verifying prerequisite ${feature.id} before ${options.requestedFeature}.`);
      }
      let report;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        actions.push({ featureId: feature.id, action: "VERIFY", attempt });
        report = await verify(context, feature, { cache, attempt, env: options.env ?? process.env });
        if (report.status === "ENGINEERING_ACCEPTED") break;
        if (options.verifyOnly || attempt === 3) return finish({ status: "BLOCKED", activeFeature: feature.id, report, actions, productionAuthorized: false });
        actions.push({ featureId: feature.id, action: "IMPLEMENT_OR_REPAIR", attempt });
        const worker = await implement(context, feature, report, attempt, options.env ?? process.env);
        if (worker.exitCode !== 0) return finish({ status: "BLOCKED_WORKER", activeFeature: feature.id, report, actions, productionAuthorized: false });
        // A source change invalidates cached results; only the new source can be accepted.
        for (const id of Object.keys(cache)) delete cache[id];
      }
      reports[feature.id] = report;
      actions.push({ featureId: feature.id, action: "ENGINEERING_ACCEPTED", evidence: `${report.evidenceDirectory}/assessment.json` });
      // Freshly generated in-process evidence only. No imported JSON can advance this loop.
    }
  } finally { release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runEngineering(loadContext());
  process.exitCode = result.status === "AUTHORIZED_SCOPE_COMPLETE" ? 0 : 1;
}
