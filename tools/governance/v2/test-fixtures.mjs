import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { GATES, POLICY } from "./core.mjs";

export const env = { ...process.env, CURASPHERE_ENV: "local", CURASPHERE_DEV_DIRECTORY: "local-test", CURASPHERE_DATA_CLASS: "synthetic", CURASPHERE_LOCAL_PHASE_OVERRIDE: "true" };
export function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "cura-governance-v2-"));
  mkdirSync(path.join(root, "tools/governance/v2"), { recursive: true });
  writeFileSync(path.join(root, ".gitignore"), "artifacts/\n");
  writeFileSync(path.join(root, "tools/governance/v2/core.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; import {existsSync} from 'node:fs'; test('implemented source exists',()=>assert.ok(existsSync('implemented.txt')));\n");
  writeFileSync(path.join(root, "tools/governance/v2/runner.test.mjs"), "import test from 'node:test'; test('fixture process is isolated',()=>{});\n");
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe", windowsHide: true });
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Synthetic Test", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "synthetic fixture only");
  return root;
}
export function feature(id = "GOV-V2-MIGRATION", dependencies = []) {
  return { id, intendedUse: "Test isolated synthetic engineering only.", capabilities: id === "P04-F05" ? ["clinical-record"] : ["tooling"], riskClass: id === "P04-F05" ? "C" : "A", specification: "spec.md", paths: ["implemented.txt"], dependencies,
    gates: Object.fromEntries(GATES.map((gate) => [gate, { commands: ["v2-tests"], proofs: { "v2-tests": ["# fail 0", "# skipped 0"] } }])) };
}
export function context(root, features = [feature()]) {
  return { root, plan: { policy: POLICY, features }, request: { requestedPolicy: POLICY, parallelEngineeringAuthority: "EXPLICIT_PRODUCT_OWNER_INSTRUCTION", authorizedFeatures: features.map((item) => item.id) }, legacy: { features: [] }, baseline: { files: {} } };
}
