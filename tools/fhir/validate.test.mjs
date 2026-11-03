import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outcomeIssues, verifyValidator } from "./validate.mjs";

test("a truncated or substituted executable is refused before Java runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "curasphere-validator-"));
  try {
    const path = join(directory, "partial.jar");
    await writeFile(path, "partial download");
    await assert.rejects(verifyValidator(path), /integrity failure/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing, empty, or malformed validator evidence cannot pass", () => {
  for (const outcome of [null, {}, { resourceType: "OperationOutcome", issue: [] },
    { resourceType: "OperationOutcome", issue: [{ severity: "success", code: "informational" }] }]) {
    assert.throws(() => outcomeIssues(outcome));
  }
  assert.equal(outcomeIssues({ resourceType: "OperationOutcome", issue: [
    { severity: "error", code: "required", diagnostics: "Patient.birthDate: minimum required = 1" },
  ] })[0].severity, "error");
});
