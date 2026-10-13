import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const artifact = readFileSync(new URL("../../packages/contracts/platform-contract.json", import.meta.url));

test("a tampered artifact fails signature verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signature = sign(null, artifact, privateKey);
  assert.equal(verify(null, artifact, publicKey, signature), true);
  const tampered = Buffer.concat([artifact, Buffer.from("\n")]);
  assert.equal(verify(null, tampered, publicKey, signature), false);
});
