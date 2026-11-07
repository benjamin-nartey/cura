import { createHash } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { all,get,transaction,type AppDatabase } from "./db";
import { authorize,effectivePermissions } from "./authorization";
import { readCondition,readAllergy,readObservation,readMedicationOrder } from "./clinical-source";
import { readMasterPatient } from "./master-records";
import { readSession } from "./session";
import { writeAudit } from "./audit";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { AppError,ForbiddenError,NotFoundError,ValidationError } from "./errors";

export const TIMELINE_SCHEMA_VERSION=1;
const bindings={condition:{read:readCondition,table:"source_conditions",permission:"clinical.condition.read",label:"Condition"},allergy:{read:readAllergy,table:"source_allergies",permission:"clinical.allergy.read",label:"Allergy assessment"},observation:{read:readObservation,table:"source_observations",permission:"clinical.observation.read",label:"Observation"},"medication-order":{read:readMedicationOrder,table:"source_medication_orders",permission:"clinical.medication-order.read",label:"Medication draft"}} as const;
type Kind=keyof typeof bindings;
type Row={id:string;organization_id:string;record_kind:Kind;record_id:string;version:number;prior_version:number|null;actor_id:string;facility_id:string;encounter_id:string|null;recorded_at:string;snapshot_json:string;current_version:number};
export type CanonicalTimelineEvent={schemaVersion:1;id:string;kind:Kind;eventTime:string|null;timePrecision:"instant"|"date"|"unknown";recordedTime:string;template:string;narrative:string;authorId:string;facilityId:string;encounterId:string|null;visibility:"inherited-source-history";historical:boolean;source:{ledgerId:string;kind:Kind;recordId:string;version:number;priorVersion:number|null;sha256:string;href:string}};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const unavailable=()=>new AppError("unavailable","The version-linked timeline is unavailable. Retry after restoring source integrity.");
function gate(db:AppDatabase,ctx:SessionContext,patientId:string){
 assertLocalHealthcareSandbox();
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(patientId))throw new ValidationError("invalid","Select a patient record.");
 const user=get<{organization_id:string;account_status:string}>(db,"SELECT organization_id,account_status FROM users WHERE id=?",ctx.userId);
 if(!ctx.facilityId||!ctx.sessionId||ctx.purposeOfUse!=="TREATMENT"||user?.organization_id!==ctx.organizationId||user.account_status!=="active")throw new ForbiddenError();
 const bound=get<{user_id:string;revoked_at:string|null;absolute_expires_at:string;idle_expires_at:string}>(db,"SELECT user_id,revoked_at,absolute_expires_at,idle_expires_at FROM auth_sessions WHERE session_id=?",ctx.sessionId);
 if(bound&&(bound.user_id!==ctx.userId||bound.revoked_at||Date.parse(bound.absolute_expires_at)<=Date.now()||Date.parse(bound.idle_expires_at)<=Date.now()))throw new ForbiddenError();
 // Foundation sessions are resolved live by the HTTP boundary; local test sessions are checked here.
 if(!ctx.sessionId.startsWith("ses_")&&readSession(db,ctx.sessionId)?.userId!==ctx.userId)throw new ForbiddenError();
 const access=effectivePermissions(db,ctx.userId,ctx.organizationId,ctx.facilityId).permissions;
 if(!access.includes("clinical.source.history.read"))throw new ForbiddenError();
 if(!authorize(db,{principalId:ctx.userId,accountActive:true},"clinical.source.history.read",{type:"CanonicalTimeline",organizationId:ctx.organizationId,facilityId:ctx.facilityId,sensitivity:"clinical"},{purpose:ctx.purposeOfUse,assurance:"directory",sessionActive:true,activeFacilityId:ctx.facilityId,correlationId:ctx.sessionId.replace(/[^A-Za-z0-9_-]/g,"").slice(0,80)}).allow)throw new ForbiddenError();
 const patient=readMasterPatient(db,ctx,patientId);if(patient.registration_status==="merged")throw new NotFoundError("Open the surviving patient record.");
 if(get<{value:string}>(db,"SELECT value FROM source_controls WHERE name='dependency'")?.value!=="available")throw unavailable();
 return access;
}
function snapshot(row:Row):Record<string,unknown>{try{const value=JSON.parse(row.snapshot_json);if(!value||typeof value!=="object"||Array.isArray(value)||typeof value.display!=="string"||!value.display.trim())throw unavailable();return value;}catch{throw unavailable();}}
function event(row:Row,patientId:string):CanonicalTimelineEvent{
 const facts=snapshot(row);if(!Number.isFinite(Date.parse(row.recorded_at))||!Number.isSafeInteger(row.version)||row.version<1||row.prior_version!==(row.version===1?null:row.version-1))throw unavailable();
 let eventTime:string|null=null,timePrecision:CanonicalTimelineEvent["timePrecision"]="unknown";
 if(row.record_kind==="observation"&&facts.effectiveAt!==undefined){if(typeof facts.effectiveAt!=="string"||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(facts.effectiveAt)||!Number.isFinite(Date.parse(facts.effectiveAt)))throw unavailable();eventTime=new Date(facts.effectiveAt).toISOString();timePrecision="instant";}
 if(row.record_kind==="condition"&&facts.onsetDate!==null&&facts.onsetDate!==undefined){if(typeof facts.onsetDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(facts.onsetDate)||new Date(facts.onsetDate).toISOString().slice(0,10)!==facts.onsetDate)throw unavailable();eventTime=facts.onsetDate;timePrecision="date";}
 const id=digest(JSON.stringify([row.organization_id,row.facility_id,row.record_kind,row.record_id,row.version,row.id]));
 return {schemaVersion:1,id,kind:row.record_kind,eventTime,timePrecision,recordedTime:new Date(row.recorded_at).toISOString(),template:`${row.record_kind}.source-version.v1`,narrative:`${bindings[row.record_kind].label}: ${facts.display} · source version ${row.version}`,authorId:row.actor_id,facilityId:row.facility_id,encounterId:row.encounter_id,visibility:"inherited-source-history",historical:row.version<row.current_version,source:{ledgerId:row.id,kind:row.record_kind,recordId:row.record_id,version:row.version,priorVersion:row.prior_version,sha256:digest(row.snapshot_json),href:`/api/clinical-timeline?patient=${encodeURIComponent(patientId)}&event=${id}`}};
}
function rows(db:AppDatabase,ctx:SessionContext,patientId:string,permissions:string[]){
 const result:Row[]=[];
 for(const [kind,binding] of Object.entries(bindings)){
  if(!permissions.includes(binding.permission))continue;
  const records=all<{id:string;version:number}>(db,`SELECT id,version FROM ${binding.table} WHERE organization_id=? AND facility_id=? AND patient_id=? ORDER BY id LIMIT 501`,ctx.organizationId,ctx.facilityId,patientId);
  if(records.length>500)throw unavailable();
  for(const record of records){
   if(!Number.isSafeInteger(record.version)||record.version<1||result.length+record.version>500)throw unavailable();
   binding.read(db,ctx,record.id);
   const versions=all<Row>(db,`SELECT v.*,s.version current_version FROM source_versions v JOIN ${binding.table} s ON s.id=v.record_id AND s.organization_id=v.organization_id AND s.facility_id=v.facility_id WHERE v.organization_id=? AND v.facility_id=? AND v.record_kind=? AND v.record_id=? AND s.patient_id=? ORDER BY v.version LIMIT 501`,ctx.organizationId,ctx.facilityId,kind,record.id,patientId);
   if(versions.length!==record.version||versions.some((v,i)=>v.version!==i+1)||result.length+versions.length>500)throw unavailable();
   result.push(...versions);
  }
 }
 return result;
}
export type CanonicalTimeline={schemaVersion:number;events:CanonicalTimelineEvent[];hash:string;limit:number;coverage:string[];notice:string};
export type TimelineSource={schemaVersion:number;event:CanonicalTimelineEvent;sourceSnapshot:Record<string,unknown>};
export function readCanonicalTimeline(db:AppDatabase,ctx:SessionContext,patientId:string):CanonicalTimeline;
export function readCanonicalTimeline(db:AppDatabase,ctx:SessionContext,patientId:string,eventId:string):TimelineSource;
export function readCanonicalTimeline(db:AppDatabase,ctx:SessionContext,patientId:string,eventId?:string):CanonicalTimeline|TimelineSource;
export function readCanonicalTimeline(db:AppDatabase,ctx:SessionContext,patientId:string,eventId?:string):CanonicalTimeline|TimelineSource{
 try{
  if(eventId!==undefined&&!/^[a-f0-9]{64}$/.test(eventId))throw new ValidationError("invalid","Select a timeline event.");
  const result=transaction(db,()=>{const permissions=gate(db,ctx,patientId),sourceRows=rows(db,ctx,patientId,permissions),events=sourceRows.map(row=>event(row,patientId)).sort((a,b)=>{const x=a.eventTime??a.recordedTime,y=b.eventTime??b.recordedTime;return y.localeCompare(x)||b.recordedTime.localeCompare(a.recordedTime)||a.id.localeCompare(b.id);});
   if(eventId){const selected=events.find(e=>e.id===eventId);if(!selected)throw new NotFoundError();const row=sourceRows.find(r=>r.id===selected.source.ledgerId)!;const facts=snapshot(row);return {schemaVersion:1,event:selected,sourceSnapshot:facts};}
   return {schemaVersion:1,events,hash:digest(JSON.stringify(events)),limit:500,coverage:Object.keys(bindings).filter(k=>permissions.includes(bindings[k as Kind].permission)),notice:"Versioned clinical source events only. Clinical time may be unknown; recorded time is the explicit sorting fallback. No generated facts."};
  });
  writeAudit(db,ctx,{action:eventId?"timeline.source.read":"timeline.canonical.read",resourceType:"CanonicalTimeline",resourceId:patientId,outcome:"success"});return result;
 }catch(error){writeAudit(db,ctx,{action:"timeline.canonical.read",resourceType:"CanonicalTimeline",resourceId:/^[A-Za-z0-9_-]{1,80}$/.test(patientId)?patientId:null,outcome:"denied"});throw error instanceof AppError?error:unavailable();}
}

export function checkTimelineSource(db:AppDatabase,ctx:SessionContext,patientId:string){const data=readCanonicalTimeline(db,ctx,patientId);writeAudit(db,ctx,{action:"timeline.source.check",resourceType:"CanonicalTimeline",resourceId:patientId,outcome:"success"});return {sourceHash:data.hash,checkedAt:new Date().toISOString(),versionCount:data.events.length};}
