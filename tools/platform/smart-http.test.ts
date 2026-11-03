import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../../apps/web/proxy.ts";
import { smartFailure,smartForm } from "../../apps/web/lib/smart.ts";
import { SmartError } from "../../packages/domain/src/smart.ts";
test("reserved client hosts cannot serve workspace login or receive workspace cookies",()=>{
 for(const request of [new NextRequest("http://partner.smart-client.localhost:3000/api/session",{method:"POST"}),new NextRequest("http://127.0.0.1:3000/api/session",{headers:{"x-forwarded-host":"partner.smart-client.localhost:3000"}})]){
  const response=proxy(request);assert.equal(response.status,403);assert.equal(response.headers.has("set-cookie"),false);
 }
 assert.equal(proxy(new NextRequest("http://127.0.0.1:3000/interop/apps")).headers.get("referrer-policy"),"same-origin");
 assert.equal(proxy(new NextRequest("http://127.0.0.1:3000/interop/apps/callback")).headers.get("referrer-policy"),"no-referrer");
 assert.equal(proxy(new NextRequest("http://127.0.0.1:3000/dashboard")).headers.get("x-middleware-next"),"1");
});
test("OAuth forms reject duplicate fields, unsupported fields/media and oversized bodies",async()=>{
 const request=(body:string,type="application/x-www-form-urlencoded")=>new Request("http://127.0.0.1:3000/api/smart/token",{method:"POST",headers:{"content-type":type},body});
 for(const body of ["client_id=a&client_id=b","extra=private","code="+"x".repeat(8193)])await assert.rejects(smartForm(request(body),["client_id","code"]));
 await assert.rejects(smartForm(request("{}","application/json"),["client_id"]));
 assert.equal((await smartForm(request("client_id=known"),["client_id"])).get("client_id"),"known");
});
test("OAuth errors do not expose database details; resource denials challenge bearer authority",async()=>{
 const failure=smartFailure(new Error("SQL with private patient data"));assert.equal(failure.status,503);assert.equal(JSON.stringify(await failure.json()).includes("private patient"),false);
 const denied=smartFailure(new SmartError("insufficient_scope",403),null,true);assert.equal(denied.headers.get("cache-control"),"no-store");assert.match(denied.headers.get("www-authenticate")!,/insufficient_scope/);assert.equal((await denied.json()).resourceType,"OperationOutcome");
});
