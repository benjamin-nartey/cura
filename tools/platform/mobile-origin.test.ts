import assert from "node:assert/strict";
import test from "node:test";
import { allowedMobileOrigin } from "../../apps/web/lib/mobile-origin.ts";
test("mobile preview origins follow requested Host rather than the internal bind address", () => {
  const request = (origin: string, host = "127.0.0.1:3000") => new Request("http://0.0.0.0:3000/api/mobile-workspace/dashboard", { headers: { origin, host } });
  assert.equal(allowedMobileOrigin(request("http://127.0.0.1:8082")), true);
  assert.equal(allowedMobileOrigin(request("http://localhost:8082")), true);
  assert.equal(allowedMobileOrigin(request("http://192.168.1.20:8082", "192.168.1.20:3000")), true);
  for (const origin of ["http://untrusted.example:8082", "null", "https://127.0.0.1:8082", "http://127.0.0.1:9999", "http://192.168.1.21:8082"]) assert.equal(allowedMobileOrigin(request(origin)), false, origin);
  assert.equal(allowedMobileOrigin(new Request("http://127.0.0.1:3000/api/mobile-workspace/dashboard")), true);
});
