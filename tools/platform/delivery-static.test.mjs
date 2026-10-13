import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);

function text(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("dev and staging do not share a namespace, secret, or data store", () => {
  const dev = text("infra/helm/curasphere/values-dev.yaml");
  const staging = text("infra/helm/curasphere/values-staging.yaml");
  assert.match(dev, /namespace: curasphere-dev/);
  assert.match(staging, /namespace: curasphere-staging/);
  assert.match(dev, /secretName: curasphere-dev-token/);
  assert.match(staging, /secretName: curasphere-staging-token/);
  assert.match(dev, /objectStoreBucket: platform-dev/);
  assert.match(staging, /objectStoreBucket: platform-staging/);
  for (const body of [dev, staging, text("infra/helm/curasphere/values.yaml")]) {
    assert.doesNotMatch(body, /local-test-only|BEGIN PRIVATE KEY|localToken:/);
  }
});

test("production deployment is rejected before helm runs", () => {
  const result = spawnSync("bash", ["infra/delivery/deploy.sh", "production"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not authorized/);
});
