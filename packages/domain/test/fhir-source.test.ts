import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceScenario } from "./fhir-source-fixtures.ts";
import { listSourceR4, previewSourceR4, reverseSourceR4 } from "../src/fhir-source.ts";
import { mapSourceR4, sourceCanonical, sourceContext, sourceFhirId, unmapSourceR4 } from "../src/fhir-source-map.ts";
import { createDatabase, get } from "../src/db.ts";
import { amendAllergy, amendCondition, cancelMedicationDraft, correctObservation, setSourceDependency } from "../src/clinical-source.ts";
import { closeVisitEncounter } from "../src/scheduling.ts";
import { cancelOrder, routeOrder } from "../src/work.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";

test("all seven current resource kinds round-trip every source field including nulls, coding pins and component values",()=>{
 const s=sourceScenario();
 for(const record of s.records){const forward=previewSourceR4(s.db,s.doctor,record.type,record.id),decoded=unmapSourceR4(forward.resource);
  assert.equal(sourceCanonical(decoded.facts),sourceCanonical(decoded.baseline));
  assert.equal(sourceCanonical(mapSourceR4(record.type,decoded.facts)),sourceCanonical(forward.resource));
  const reverse=reverseSourceR4(s.db,s.doctor,forward.resource);assert.equal(reverse.roundTripExact,true);assert.deepEqual(reverse.changedFields,[]);assert.equal(reverse.applied,false);
  assert.match(String(forward.resource.id),/^[a-f0-9]{64}$/);
 }
 const quantity=s.records[4],r=previewSourceR4(s.db,s.doctor,quantity.type,quantity.id).resource;
 assert.equal((r.valueQuantity as {value:number}).value,37.1);
 assert.match((r.valueQuantity as {system:string}).system,/^urn:curasphere:/);
 assert.ok(!JSON.stringify(r).includes("http://unitsofmeasure.org"));
 const pressure=previewSourceR4(s.db,s.doctor,"Observation",s.records[5].id).resource;
 assert.deepEqual((pressure.component as Array<{valueQuantity:{value:number}}>).map(c=>c.valueQuantity.value),[80,120]);
 const patient=previewSourceR4(s.db,s.doctor,"Patient",s.common.patientId).resource;assert.equal(patient.gender,undefined);assert.equal(patient.active,true);
 const source=sourceContext(patient).facts,merged=mapSourceR4("Patient",{...source,registration_status:"merged",merged_into_id:"pat_gh_kofi_b"});
 assert.equal(merged.active,false);assert.deepEqual(merged.link,[{other:{reference:`Patient/${sourceFhirId(source.organization_id,"Patient","pat_gh_kofi_b")}`},type:"replaced-by"}]);
 assert.equal(unmapSourceR4(merged).facts.registration_status,"merged");
 assert.equal(mapSourceR4("Patient",{...source,registration_status:"inactive"}).active,false);
 assert.notEqual(sourceFhirId("tenant-a","Patient","duplicate-mrn"),sourceFhirId("tenant-b","Patient","duplicate-mrn"));
 s.db.close();
});
test("reverse mapping reads edited R4 values and proposes differences without mutating persisted facts",()=>{
 const s=sourceScenario(),record=s.records[4],r=previewSourceR4(s.db,s.doctor,record.type,record.id).resource;
 (r.valueQuantity as {value:number}).value=38.2;
 const reverse=reverseSourceR4(s.db,s.doctor,r);assert.deepEqual(reverse.changedFields,["value_quantity"]);assert.equal(reverse.proposedSource.value_quantity,38.2);assert.equal(reverse.roundTripExact,false);
 assert.equal(get<{value_quantity:number}>(s.db,"SELECT value_quantity FROM source_observations WHERE id=?",record.id)?.value_quantity,37.1);
 const meta=s.db.prepare("SELECT action,resource_id FROM audit_events WHERE action LIKE 'fhir.source.%'").all();assert.ok(meta.length>0);assert.ok(!JSON.stringify(meta).includes("38.2"));s.db.close();
});
test("two synthetic partner tenants with the same MRN retain distinct identities and cannot compare each other's records",()=>{
 const s=sourceScenario(),first=previewSourceR4(s.db,s.doctor,"Patient","pat_gh_kofi_a"),second=previewSourceR4(s.db,s.foreign,"Patient","pat_eu_kofi");
 const a=(first.resource.identifier as Array<{system:string;value:string}>)[0],b=(second.resource.identifier as Array<{system:string;value:string}>)[0];
 assert.equal(a.value,"ACC-4401");assert.equal(a.value,b.value);assert.notEqual(a.system,b.system);assert.notEqual(first.resource.id,second.resource.id);
 assert.equal(reverseSourceR4(s.db,s.foreign,second.resource).roundTripExact,true);
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,second.resource),NotFoundError);assert.throws(()=>reverseSourceR4(s.db,s.foreign,first.resource),NotFoundError);s.db.close();
});
test("unknown fields, reordered component semantics, forged references and executable requests fail closed",()=>{
 const s=sourceScenario();
 for(const record of s.records){const resource=previewSourceR4(s.db,s.doctor,record.type,record.id).resource;
  assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...resource,unsupportedClinicalFact:"must-not-disappear"}),ValidationError);
  assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...resource,modifierExtension:[{url:"urn:unrecognized",valueBoolean:true}]}),ValidationError);
 }
 for(const type of ["ServiceRequest","MedicationRequest"]){const record=s.records.find(r=>r.type===type)!,resource=previewSourceR4(s.db,s.doctor,type,record.id).resource;
  assert.equal(resource.intent,"proposal");assert.equal(resource.status,"draft");assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...resource,intent:"order"}),ValidationError);
 }
 const observation=previewSourceR4(s.db,s.doctor,"Observation",s.records[4].id).resource;
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...observation,subject:{reference:"Patient/foreign"}}),ValidationError);
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...observation,meta:{profile:["http://example.com/unsupported"]}}),ValidationError);
 s.db.close();
});
test("source changes invalidate old envelopes, while a fresh corrected resource round-trips",()=>{
 const s=sourceScenario(),id=s.records[4].id,r=previewSourceR4(s.db,s.doctor,"Observation",id).resource;
 correctObservation(s.db,s.doctor,id,{expectedVersion:1,valueQuantity:37.4,reason:"transcription-error",idempotencyKey:"fhir-correction-key-01"});
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,r),ConflictError);
 const fresh=previewSourceR4(s.db,s.doctor,"Observation",id);assert.equal(reverseSourceR4(s.db,s.doctor,fresh.resource).sourceVersion,2);s.db.close();
});
test("cross-tenant, wrong-facility, suspended and unprivileged actors cannot preview or reverse",()=>{
 const s=sourceScenario(),record=s.records[4],r=previewSourceR4(s.db,s.doctor,record.type,record.id).resource;
 assert.throws(()=>previewSourceR4(s.db,s.foreign,record.type,record.id),NotFoundError);assert.throws(()=>reverseSourceR4(s.db,s.foreign,r),NotFoundError);
 const wrongFacility={...s.doctor,facilityId:"fac_gh_madina"};assert.throws(()=>previewSourceR4(s.db,wrongFacility,record.type,record.id),ForbiddenError);assert.throws(()=>reverseSourceR4(s.db,wrongFacility,r),ForbiddenError);
 assert.throws(()=>previewSourceR4(s.db,s.admin,record.type,record.id),ForbiddenError);
 s.db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(s.doctor.userId);
 assert.throws(()=>previewSourceR4(s.db,s.doctor,record.type,record.id),ForbiddenError);assert.throws(()=>listSourceR4(s.db,s.doctor,s.common.patientId),ForbiddenError);s.db.close();
});
test("dependency failure and sandbox closure reject requests, and recovery preserves the source",()=>{
 const s=sourceScenario(),record=s.records[4];setSourceDependency(s.db,"unavailable");assert.throws(()=>previewSourceR4(s.db,s.doctor,record.type,record.id),ConflictError);
 setSourceDependency(s.db,"available");assert.ok(previewSourceR4(s.db,s.doctor,record.type,record.id).resource);
 process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="false";assert.throws(()=>previewSourceR4(s.db,s.doctor,record.type,record.id),ForbiddenError);process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="true";s.db.close();
});
test("repeated comparisons survive database reopen without migrations or clinical side effects",()=>{
 const file=join(mkdtempSync(join(tmpdir(),"cura-fhir-source-")),"scenario.sqlite"),s=sourceScenario(file),record=s.records[4];
 const before=previewSourceR4(s.db,s.doctor,record.type,record.id);s.db.close();const db=createDatabase(file);
 for(let i=0;i<3;i++)assert.equal(reverseSourceR4(db,s.doctor,before.resource).roundTripExact,true);
 assert.equal(previewSourceR4(db,s.doctor,record.type,record.id).sourceFingerprint,before.sourceFingerprint);
 assert.equal(get<{n:number}>(db,"SELECT COUNT(*) n FROM source_observations")?.n,2);db.close();
});
test("closed encounters and routed/cancelled work retain original workflow semantics",()=>{
 const s=sourceScenario(),order=s.records.find(r=>r.type==="ServiceRequest")!;
 routeOrder(s.db,s.doctor,order.id,{expectedVersion:1,idempotencyKey:"fhir-source-route-01"});
 const routed=previewSourceR4(s.db,s.doctor,order.type,order.id).resource;assert.equal(routed.status,"draft");assert.equal(sourceContext(routed).facts.status,"routed");
 cancelOrder(s.db,s.doctor,order.id,{expectedVersion:2,reason:"no-longer-needed",idempotencyKey:"fhir-source-cancel-01"});
 const cancelled=previewSourceR4(s.db,s.doctor,order.type,order.id).resource;assert.equal(cancelled.status,"revoked");assert.equal(reverseSourceR4(s.db,s.doctor,cancelled).roundTripExact,true);
 const condition=s.records.find(r=>r.type==="Condition")!;
 const original=sourceContext(previewSourceR4(s.db,s.doctor,"Condition",condition.id).resource).facts;
 assert.throws(()=>mapSourceR4("Condition",{...original,resolution_date:"2026-10-21"}),ValidationError);
 amendCondition(s.db,s.doctor,condition.id,{expectedVersion:1,clinicalStatus:"resolved",resolutionDate:"2026-10-21",reason:"follow-up-complete",idempotencyKey:"fhir-condition-resolve-01"});
 const resolved=previewSourceR4(s.db,s.doctor,"Condition",condition.id).resource;assert.equal(resolved.abatementDateTime,"2026-10-21");assert.equal(reverseSourceR4(s.db,s.doctor,resolved).roundTripExact,true);
 amendCondition(s.db,s.doctor,condition.id,{expectedVersion:2,verificationStatus:"entered-in-error",reason:"wrong-encounter",idempotencyKey:"fhir-condition-error-01"});
 const invalidated=previewSourceR4(s.db,s.doctor,"Condition",condition.id).resource;assert.equal(invalidated.clinicalStatus,undefined);assert.equal(invalidated.abatementDateTime,undefined);assert.equal(reverseSourceR4(s.db,s.doctor,invalidated).proposedSource.resolution_date,"2026-10-21");
 const medication=s.records.find(r=>r.type==="MedicationRequest")!;cancelMedicationDraft(s.db,s.doctor,medication.id,{expectedVersion:1,reason:"no-longer-needed",idempotencyKey:"fhir-med-cancel-01"});
 assert.equal(previewSourceR4(s.db,s.doctor,"MedicationRequest",medication.id).resource.status,"cancelled");
 const allergy=s.records.find(r=>r.type==="AllergyIntolerance")!;amendAllergy(s.db,s.doctor,allergy.id,{expectedVersion:1,clinicalStatus:"inactive",verificationStatus:"refuted",reason:"incorrect-history",idempotencyKey:"fhir-allergy-refute-01"});
 assert.equal(reverseSourceR4(s.db,s.doctor,previewSourceR4(s.db,s.doctor,"AllergyIntolerance",allergy.id).resource).roundTripExact,true);
 closeVisitEncounter(s.db,s.doctor,s.encounter.id,1,"visit-complete");const closed=previewSourceR4(s.db,s.doctor,"Encounter",s.encounter.id).resource;assert.equal(closed.status,"finished");assert.equal(reverseSourceR4(s.db,s.doctor,closed).roundTripExact,true);s.db.close();
});
test("malformed envelopes, impossible dates, oversized and deeply nested payloads are rejected",()=>{
 const s=sourceScenario(),r=previewSourceR4(s.db,s.doctor,"Patient",s.common.patientId).resource;
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...r,birthDate:"2026-02-30"}),ValidationError);
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...r,extension:[{url:"wrong",valueString:"{"}]}),ValidationError);
 assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...r,extra:"a".repeat(100001)}),ValidationError);
 let deep:unknown={};for(let i=0;i<30;i++)deep={deep};assert.throws(()=>reverseSourceR4(s.db,s.doctor,{...r,deep}),ValidationError);s.db.close();
});
