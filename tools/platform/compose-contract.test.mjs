import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const compose = readFileSync(new URL("../../infra/local/compose.yaml", import.meta.url), "utf8");

test("the local stack is bounded, loopback-only, and uses the test credential", () => {
  for (const service of ["postgres", "redis", "kafka", "temporal", "minio", "dex", "otel"]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  }
  assert.equal(compose.includes("5432:5432"), false);
  assert.match(compose, /127\.0\.0\.1:54329:5432/);
  assert.match(compose, /local-test-only/);
  assert.equal((compose.match(/mem_limit:/g) ?? []).length, 7);
  assert.doesNotMatch(compose, /AKIA|BEGIN PRIVATE KEY/);
});
