import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compatibilityErrors, renderPlatformModule } from "./contract-compat.mjs";

const contractPath = new URL("../../packages/contracts/platform-contract.json", import.meta.url);
const generatedPath = new URL("../../packages/contracts/src/platform.ts", import.meta.url);
const baseline = JSON.parse(readFileSync(contractPath, "utf8"));

test("the generated platform contract matches the versioned schema", () => {
  assert.equal(readFileSync(generatedPath, "utf8"), renderPlatformModule(baseline));
  assert.deepEqual(compatibilityErrors(baseline, baseline), []);
});

test("an incompatible contract change is rejected", () => {
  const broken = structuredClone(baseline);
  broken.routes[0].responseFields = broken.routes[0].responseFields.filter((field) => field !== "clinicalGeneration");
  broken.routes[1].status = 200;
  const errors = compatibilityErrors(baseline, broken);
  assert.ok(errors.some((error) => error.includes("clinicalGeneration")));
  assert.ok(errors.some((error) => error.includes("status changed")));
});
