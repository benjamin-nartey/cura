import assert from "node:assert/strict";
import test,{mock} from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync,writeFileSync,mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceScenario } from "../../packages/domain/test/fhir-source-fixtures.ts";
import { createDatabase } from "../../packages/domain/src/db.ts";
import { timelineDeliveryPointers,applyTimelineDelivery,readTimelineProjection } from "../../packages/domain/src/timeline-projection.ts";
import { readCanonicalTimeline } from "../../packages/domain/src/canonical-timeline.ts";
import { readSession } from "../../packages/domain/src/session.ts";
import { correctObservation } from "../../packages/domain/src/clinical-source.ts";
import { publishTimelinePointers,consumeTimelinePointers,createTimelineTopic } from "./kafka.ts";
const docker=(...args:string[])=>execFileSync('docker',args,{windowsHide:true,stdio:'pipe',timeout:30000});
test("actual Kafka interruption retains durable pointers; accelerated thirty-minute outage catches up with exact reproducible source facts",{timeout:240000},async()=>{
 const file=join(mkdtempSync(join(tmpdir(),'cura-kafka-outage-')),'source.sqlite'),s=sourceScenario(file),patient=s.common.patientId,sid=s.doctor.sessionId;
 const topic=`cura.timeline.test.${process.pid}.${Math.random().toString(16).slice(2)}`,config={broker:'127.0.0.1:19092',topic,group:topic+'.consumer'};
 let db=s.db,stopped=false,simulationNow=Date.now();mock.timers.reset();
 // Accelerate clinical-fixture time only. Kafka transport clocks and retention use real wall time.
 function at<T>(work:()=>T):T{mock.timers.enable({apis:['Date'],now:simulationNow});try{return work();}finally{mock.timers.reset();}}
 const ctx=()=>readSession(db,sid)!;
 try{
  await createTimelineTopic(config);
  const original=at(()=>readCanonicalTimeline(db,ctx(),patient)),pointers=at(()=>timelineDeliveryPointers(db,ctx(),patient));
  docker('stop','curasphere-local-kafka-1');stopped=true;
  await assert.rejects(()=>publishTimelinePointers(config,pointers));
  assert.equal(at(()=>readTimelineProjection(db,ctx(),patient)).pending,5);
  simulationNow+=1800000;
  const id=(db.prepare("SELECT id FROM source_observations WHERE code='syn-bp'").get() as {id:string}).id;
  at(()=>correctObservation(db,ctx(),id,{expectedVersion:1,components:[{code:'syn-sbp',value:118},{code:'syn-dbp',value:78}],reason:'entry-correction',idempotencyKey:'kafka-outage-correction'}));
  const delayed=at(()=>readTimelineProjection(db,ctx(),patient));
  assert.equal(delayed.health.lagSeconds,1800);assert.ok(delayed.health.alerts.some(a=>a.code==='projection-lag'));assert.equal(delayed.events.length,0);
  db.close();db=createDatabase(file);
  docker('start','curasphere-local-kafka-1');stopped=false;
  let ready=false,lastError:unknown;const readyUntil=performance.now()+90000;
  while(performance.now()<readyUntil){try{await createTimelineTopic(config);ready=true;break;}catch(error){lastError=error;await new Promise(r=>setTimeout(r,500));}}
  assert.equal(ready,true,String(lastError));assert.ok(at(ctx));
  const retained=at(()=>timelineDeliveryPointers(db,ctx(),patient));assert.equal(retained.length,6);
  await publishTimelinePointers(config,retained);await publishTimelinePointers(config,retained);
  // Application failure must not commit a Kafka offset; retry the same retained messages.
  await assert.rejects(()=>consumeTimelinePointers(config,async()=>{throw Error('isolated SQLite dependency failure');},45000));
  const consumed=await consumeTimelinePointers(config,async v=>{at(()=>applyTimelineDelivery(db,ctx(),patient,v));},45000);
  assert.equal(consumed.consumed,12);
  const first=at(()=>readTimelineProjection(db,ctx(),patient)),canonical=at(()=>readCanonicalTimeline(db,ctx(),patient));
  assert.equal(first.status,'current');assert.equal(first.health.state,'healthy');assert.equal(first.health.lagSeconds,0);assert.equal(first.projectionHash,canonical.hash);assert.equal(first.events.length,6);const amended=first.events.find(e=>e.source.recordId===id&&e.source.version===2)!;const previous=first.events.find(e=>e.source.recordId===id&&e.source.version===1)!;const a=at(()=>readCanonicalTimeline(db,ctx(),patient,amended.id)),b=at(()=>readCanonicalTimeline(db,ctx(),patient,previous.id));assert.ok('sourceSnapshot' in a&&'sourceSnapshot' in b);assert.deepEqual((a.sourceSnapshot.components as {value:number}[]).map(p=>p.value),[118,78]);assert.deepEqual((b.sourceSnapshot.components as {value:number}[]).map(p=>p.value),[120,80]);assert.ok(previous.historical);
  for(const e of first.events){const source=at(()=>readCanonicalTimeline(db,ctx(),patient,e.id));assert.ok('sourceSnapshot' in source);assert.equal(source.event.source.sha256,e.source.sha256);}
  assert.equal((await consumeTimelinePointers(config,async v=>{at(()=>applyTimelineDelivery(db,ctx(),patient,v));})).consumed,0);
  assert.equal(at(()=>readTimelineProjection(db,ctx(),patient)).projectionHash,first.projectionHash);assert.notEqual(canonical.hash,original.hash);
  mkdirSync('artifacts/governance-v2',{recursive:true});writeFileSync('artifacts/governance-v2/P07-F05-kafka-outage.json',JSON.stringify({actualBrokerStopped:true,acceleratedSimulationSeconds:1800,wallClockThirtyMinutes:false,transportUsesRealClock:true,databaseReopened:true,retainedPointers:6,deliveredIncludingDuplicates:12,sourceBacklinksVerified:6,correctedBloodPressure:{before:[120,80],after:[118,78]},matchingHashes:true,failedApplicationOffsetRetained:true,afterReplay:'current',health:'healthy',lagSeconds:0,offsetResumeConsumed:0},null,2));
 }catch(error){if(error instanceof Error&&error.cause)console.error('Synthetic replay diagnostic:',error.cause);throw error;}
 finally{if(stopped)docker('start','curasphere-local-kafka-1');db.close();}
});
