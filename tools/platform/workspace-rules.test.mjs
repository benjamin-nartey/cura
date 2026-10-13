import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);

function text(path) {
  return readFileSync(new URL(path, root), "utf8");
}

export function patientModelViolations(source) {
  if (/givenName|birthDate|INSERT INTO/.test(source)) return ["The FHIR package must not own a patient model."];
  return [];
}

test("required workspaces exist and the FHIR package does not own a patient model", () => {
  const fhir = text("packages/fhir/src/index.ts");
  const mobile = JSON.parse(text("apps/mobile/package.json"));
  const fixture = JSON.parse(text("fixtures/platform/ghana-organizations.json"));
  const seed = text("packages/domain/src/seed.ts");
  assert.match(text("packages/domain/src/fhir-map.ts"), /export function loadPatient/);
  assert.deepEqual(patientModelViolations(fhir), []);
  assert.equal(JSON.parse(text("packages/fhir/package.json")).name, "@curasphere/fhir");
  assert.equal(mobile.dependencies["@curasphere/domain"], undefined);
  assert.equal(mobile.dependencies["@react-native-async-storage/async-storage"], "^2.2.0");
  assert.doesNotMatch(text("ai/gateway/app.py"), /patient|diagnos/i);
  assert.doesNotMatch(text("infra/README.md"), /password\s*=|api[_-]?key/i);
  assert.equal(fixture.label, "SYNTHETIC");
  assert.equal(fixture.country, "GH");
  assert.equal(fixture.organizations.length, 2);
  assert.equal("patients" in fixture, false);
  assert.doesNotMatch(seed, /org_adom|org_sika/);
});

test("a duplicated patient shape in the FHIR package is rejected", () => {
  const broken = "export type Patient = { givenName: string; birthDate: string };";
  assert.deepEqual(patientModelViolations(broken), ["The FHIR package must not own a patient model."]);
});
