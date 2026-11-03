import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acceptance, evaluateGates, historicalFindings, inside, POLICY, readJson, releaseEligibility, sourceSnapshot, validatePlan } from "./core.mjs";
import { commandCatalog } from "./catalog.mjs";
import { execute, withWeb } from "./process.mjs";
import { sandboxFindings } from "../sandbox.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const V2 = "docs/governance/v2";

export function loadContext(root = ROOT) {
  const plan = readJson(inside(root, `${V2}/engineering-plan.json`));
  const request = readJson(inside(root, `${V2}/policy-request.json`));
  const masterplan = readJson(inside(root, "CuraSphere_Cursor_Pack/progress/feature-register.json"));
  const legacy = readJson(inside(root, "docs/governance/experimental-engineering-register.json"));
  const baseline = readJson(inside(root, `${V2}/historical-baseline.json`));
  const errors = [...validatePlan(plan, request, masterplan), ...historicalFindings(root, baseline)];
  if (errors.length) throw new Error(errors.join("\n"));
  return { root, plan, request, masterplan, legacy, baseline };
}

export async function verifyFeature(context, feature, { cache = {}, attempt = 1, env = process.env } = {}) {
  const { root, request, baseline } = context;
  if (!request.authorizedFeatures.includes(feature.id)) throw new Error("Feature outside explicit engineering scope.");
  const restriction = sandboxFindings(env);
  if (!restriction.allowed) throw new Error(`Isolated local synthetic environment required: ${restriction.findings.join(" ")}`);
  if (historicalFindings(root, baseline).length) throw new Error("Historical governance/evidence changed.");
  const source = sourceSnapshot(root);
  const run = `artifacts/governance-v2/${new Date().toISOString().replace(/[:.]/g, "-")}-${feature.id}-${randomUUID()}`;
  mkdirSync(inside(root, run), { recursive: true });
  const startedAt = new Date().toISOString();
  const commands = {};
  const needed = new Set(Object.values(feature.gates).flatMap((gate) => gate.commands ?? []));
  const catalog = commandCatalog(root);
  for (const [id, spec] of Object.entries(catalog)) {
    if (!needed.has(id)) continue;
    const reusable = cache[id];
    if (reusable?.sourceDigest === source.digest && reusable.exitCode === 0) { commands[id] = reusable; continue; }
    console.log(`${feature.id}: executing ${id}`);
    if (spec.managedWeb) {
      const database = inside(root, `${run}/synthetic-chart.sqlite`);
      const childEnv = { ...env, DATABASE_PATH: database, CURASPHERE_E2E_REPORT: inside(root, `${run}/browser-results.json`), CURASPHERE_E2E_ARTIFACTS: inside(root, `${run}/screenshots`) };
      delete childEnv.CURASPHERE_NEXT_DIST;
      const seed = await execute(root, { argv: [process.execPath, "--import", "tsx", "tools/fixtures/seed-p04-f05.ts"], cwd: "." }, `${run}/seed.log`, childEnv);
      if (seed.exitCode !== 0) { commands[id] = { ...seed, sourceDigest: source.digest }; continue; }
      try {
        commands[id] = await withWeb(root, childEnv, run, (baseURL) => execute(root, spec, `${run}/${id}.log`, { ...childEnv, CURASPHERE_E2E_BASE_URL: baseURL }));
        const browser = readJson(inside(root, `${run}/browser-results.json`));
        // A zero exit is insufficient if no tests ran or any test was skipped/flaky.
        if (browser.stats.expected < 2 || browser.stats.unexpected || browser.stats.skipped || browser.stats.flaky || browser.errors.length) commands[id].exitCode = 1;
      } catch (error) {
        const log = `${run}/e2e-startup.log`;
        commands[id] = await execute(root, { argv: [process.execPath, "-e", "process.exit(1)"], cwd: "." }, log, childEnv);
        commands[id].reason = error.message;
      }
    } else {
      const commandEnv = { ...env };
      delete commandEnv.CURASPHERE_NEXT_DIST;
      // Legacy tests deliberately check the override's absence in deployment-denial cases.
      if (["legacy-governance", "contracts", "constitution"].includes(id)) delete commandEnv.CURASPHERE_LOCAL_PHASE_OVERRIDE;
      commands[id] = await execute(root, spec, `${run}/${id}.log`, commandEnv);
    }
    commands[id].sourceDigest = source.digest;
    cache[id] = commands[id];
    console.log(`${feature.id}: ${id} exit=${commands[id].exitCode ?? "NOT_VERIFIED"}`);
  }
  const gates = evaluateGates(feature, commands);
  const historyErrors = historicalFindings(root, baseline);
  const after = sourceSnapshot(root);
  if (source.digest !== after.digest || historyErrors.length) {
    const dependency = gates.find((gate) => gate.id === "dependency-regression");
    dependency.result = "FAIL";
    dependency.reason = historyErrors.join("; ") || "Source changed during verification; repeat against the settled snapshot.";
  }
  const report = {
    schemaVersion: 1, policy: POLICY, featureId: feature.id, attempt, startedAt, finishedAt: new Date().toISOString(),
    revision: source.revision, dirty: source.dirty, sourceDigest: source.digest, sourceFiles: source.files,
    status: acceptance(gates), gates, commands: Object.fromEntries(Object.entries(commands).map(([id, record]) => {
      const metadata = { ...record };
      delete metadata.output;
      return [id, metadata];
    })),
    release: releaseEligibility(feature, gates, env), historicalPreservation: historyErrors.length === 0,
    deploymentExecuted: false, evidenceDirectory: run,
  };
  writeFileSync(inside(root, `${run}/assessment.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(`${feature.id}: ${report.status}; evidence=${run}/assessment.json`);
  return report;
}
