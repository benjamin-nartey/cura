import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { buildRegistry, defaultClassification, validateEntry, validateRegistry } from "./intended-use.mjs";

const features = JSON.parse(readFileSync(new URL("../../CuraSphere_Cursor_Pack/progress/feature-register.json", import.meta.url), "utf8")).features;
const registryPath = new URL("../../docs/constitution/intended-use-registry.json", import.meta.url);
const registry = buildRegistry(features);
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
const stored = JSON.parse(readFileSync(registryPath, "utf8"));

test("every feature has an intended-use entry and classification stays pending", () => {
  assert.equal(defaultClassification(), "pending");
  assert.notEqual(defaultClassification(), "unregulated");
  assert.deepEqual(validateRegistry(stored, features), []);
  assert.equal(stored.entries.length, features.length);
  for (const entry of stored.entries) {
    assert.equal(entry.ownerName, null);
    assert.equal(entry.regulatoryClassification, "pending");
    assert.equal(entry.jurisdiction, "pending");
    assert.ok(entry.prohibitedClaims.length > 0);
  }
});

test("a missing mandatory field is rejected", () => {
  const broken = structuredClone(stored.entries[0]);
  broken.intendedUse = "";
  assert.ok(validateEntry(broken).some((error) => error.includes("intended use") || error.includes("intendedUse")));
});

test("an omitted classification is not filled with unregulated", () => {
  const broken = structuredClone(stored.entries[0]);
  delete broken.regulatoryClassification;
  const errors = validateEntry(broken);
  assert.ok(errors.some((error) => error.includes("regulatoryClassification")));
  assert.equal(errors.some((error) => error.includes("unregulated")), false);
});

test("an unregulated classification is rejected", () => {
  const broken = structuredClone(stored.entries[0]);
  broken.regulatoryClassification = "unregulated";
  assert.ok(validateEntry(broken).some((error) => error.includes("unregulated")));
});
