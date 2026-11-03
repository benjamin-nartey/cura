import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { acceptance, evaluateGates, POLICY, sourceSnapshot } from "./core.mjs";
import { commandCatalog } from "./catalog.mjs";
import { execute } from "./process.mjs";
import { acquireLock, runEngineering, workerPrompt } from "./runner.mjs";
import { context, env, feature, fixtureRoot } from "./test-fixtures.mjs";
import { ROOT } from "./verify.mjs";

async function realVerify(ctx, item, { attempt }) {
  const source = sourceSnapshot(ctx.root);
  const log = `artifacts/governance-v2/${item.id}-${attempt}.log`;
  const result = await execute(ctx.root, commandCatalog(ctx.root)["v2-tests"], log, env);
  const gates = evaluateGates(item, { "v2-tests": result });
  return { policy: POLICY, featureId: item.id, revision: source.revision, sourceDigest: source.digest, startedAt: result.startedAt, finishedAt: result.finishedAt, gates, commands: { "v2-tests": { ...result, sourceDigest: source.digest } }, status: acceptance(gates), evidenceDirectory: "artifacts/governance-v2" };
}

test("single active feature lock prevents concurrent engineering runs and recovers after release", () => {
  const root = fixtureRoot();
  const release = acquireLock(root);
  assert.throws(() => acquireLock(root), /EEXIST/);
  release();
  acquireLock(root)();
});

test("integration runner executes a failing test repairs source in a real process and advances only after retest", async () => {
  const root = fixtureRoot();
  const ctx = context(root, [feature(), feature("P04-F05", ["GOV-V2-MIGRATION"])]);
  let implementations = 0;
  const result = await runEngineering(ctx, { env, verify: realVerify, implement: async () => {
    implementations += 1;
    return execute(root, { argv: [process.execPath, "-e", "require('node:fs').writeFileSync('implemented.txt','synthetic working implementation')"], cwd: "." }, `artifacts/governance-v2/worker-${implementations}.log`, env);
  } });
  assert.equal(result.status, "AUTHORIZED_SCOPE_COMPLETE");
  assert.equal(implementations, 1);
  assert.ok(existsSync(path.join(root, "implemented.txt")));
  assert.deepEqual(result.actions.map((item) => `${item.featureId}:${item.action}`), ["GOV-V2-MIGRATION:VERIFY", "GOV-V2-MIGRATION:IMPLEMENT_OR_REPAIR", "GOV-V2-MIGRATION:VERIFY", "GOV-V2-MIGRATION:ENGINEERING_ACCEPTED", "P04-F05:VERIFY", "P04-F05:ENGINEERING_ACCEPTED"]);
  assert.equal(result.productionAuthorized, false);
});

test("failure blocks progression and evidence is never overwritten", async () => {
  const root = fixtureRoot();
  const result = await runEngineering(context(root, [feature(), feature("P04-F05", ["GOV-V2-MIGRATION"])]), { env, verifyOnly: true, verify: realVerify });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.actions.length, 1);
  const old = readFileSync(path.join(root, "artifacts/governance-v2/GOV-V2-MIGRATION-1.log"), "utf8");
  await assert.rejects(() => execute(root, { argv: [process.execPath, "-e", "console.log('replacement')"], cwd: "." }, "artifacts/governance-v2/GOV-V2-MIGRATION-1.log", env), /EEXIST/);
  assert.equal(readFileSync(path.join(root, "artifacts/governance-v2/GOV-V2-MIGRATION-1.log"), "utf8"), old);
  assert.equal(existsSync(path.join(root, "artifacts/governance-v2/active.lock")), false);
});

test("scope guard refuses unauthorized Phase 05 and unknown dependencies before a worker executes", async () => {
  const root = fixtureRoot();
  await assert.rejects(() => runEngineering(context(root), { env, requestedFeature: "P05-F01" }), /outside/);
  let ran = false;
  const item = feature(); item.dependencies = ["P04-F01"];
  const result = await runEngineering(context(root, [item]), { env, verify: async () => { ran = true; } });
  assert.equal(result.status, "BLOCKED_DEPENDENCY");
  assert.equal(ran, false);
  assert.equal(result.phase05, "PLAN_ONLY");
});

test("worker prompt constrains changes and cannot manufacture acceptance or authorize deployment", () => {
  const prompt = workerPrompt(feature(), { gates: [{ id: "unit", result: "FAIL" }] });
  assert.match(prompt, /No push, merge, publication, deployment/);
  assert.match(prompt, /Do not edit the governance engine/);
  assert.match(prompt, /independent runner/);
});

test("actual process timeout and launch failure produce nonpassing attributable evidence", async () => {
  const root = fixtureRoot();
  const timeout = await execute(root, { argv: [process.execPath, "-e", "setTimeout(()=>{},5000)"], cwd: ".", timeoutMs: 100 }, "artifacts/governance-v2/timeout.log", env);
  assert.equal(timeout.timedOut, true);
  assert.notEqual(timeout.exitCode, 0);
  const missing = await execute(root, { argv: [path.join(root, "absent-executable")], cwd: "." }, "artifacts/governance-v2/missing.log", env);
  assert.notEqual(missing.exitCode, 0);
  assert.ok(missing.launchError);
});

test("source fingerprint changes when an uncommitted implementation changes", () => {
  const root = fixtureRoot();
  const before = sourceSnapshot(root);
  writeFileSync(path.join(root, "implemented.txt"), "first");
  const changed = sourceSnapshot(root);
  assert.notEqual(changed.digest, before.digest);
  writeFileSync(path.join(root, "implemented.txt"), "second");
  assert.notEqual(sourceSnapshot(root).digest, changed.digest);
});

test("actual verifier CLI boots and refuses a protected environment without a module cycle", async () => {
  const root = fixtureRoot();
  const result = await execute(root, { argv: [process.execPath, path.join(ROOT, "tools/governance/v2/cli.mjs")], cwd: ".", timeoutMs: 15_000 }, "artifacts/governance-v2/cli-denial.log", { ...env, CURASPHERE_ENV: "production" });
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.match(result.output, /isolated local synthetic sandbox/);
  assert.doesNotMatch(result.output, /unsettled top-level await/);
});
