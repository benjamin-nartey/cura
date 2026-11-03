import assert from "node:assert/strict";
import test from "node:test";
import { sourceBody, sourceFailure, sourceOrigin } from "../../apps/web/lib/fhir-source.ts";
import { AppError } from "../../packages/domain/src/errors.ts";
test("storage failures return private OperationOutcomes without SQL or clinical error details",async()=>{
 const response=sourceFailure(new Error("SQL failed for confidential-clinical-value"));
 assert.equal(response.status,503);assert.equal(response.headers.get("cache-control"),"no-store");
 const body=await response.json();assert.equal(body.resourceType,"OperationOutcome");assert.equal(JSON.stringify(body).includes("confidential"),false);
 assert.equal(sourceFailure(new AppError("conflict","Reload the source.")).status,409);
});
test("transport rejects cross-site requests, unsupported media, invalid UTF-8 and oversized streamed JSON",async()=>{
 assert.equal(sourceOrigin(new Request("http://localhost/test",{headers:{host:"localhost",origin:"https://foreign.example"}})),false);
 assert.equal(sourceOrigin(new Request("http://localhost/test",{headers:{host:"localhost","sec-fetch-site":"cross-site"}})),false);
 await assert.rejects(sourceBody(new Request("http://localhost/test",{method:"POST",body:"{}"})),/JSON/);
 await assert.rejects(sourceBody(new Request("http://localhost/test",{method:"POST",headers:{"content-type":"application/json"},body:new Uint8Array([0xff])})),/UTF-8 JSON/);
 await assert.rejects(sourceBody(new Request("http://localhost/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({value:"x".repeat(100001)})})),/100 KB/);
 assert.deepEqual(await sourceBody(new Request("http://localhost/test",{method:"POST",headers:{"content-type":"application/json"},body:'{"resourceType":"Patient"}'})),{resourceType:"Patient"});
});
