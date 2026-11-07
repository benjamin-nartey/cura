import { createHash,createHmac,randomUUID,timingSafeEqual } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { all,get,run,transaction,type AppDatabase } from "./db";
import { AppError,ConflictError,ForbiddenError,NotFoundError,ValidationError } from "./errors";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { authorize } from "./authorization";
import { writeAudit } from "./audit";
import { readMasterPatient } from "./master-records";
import { readVisitEncounter } from "./scheduling";
import { correctObservation,listSourceCatalog,readObservation,recordObservation } from "./clinical-source";
import { readSourceR4ForPatient } from "./fhir-source";
import { sourceFhirId,sourceSystemUri } from "./fhir-source-map";
import { queueIntegrationObservation } from "./integration-outbox";

type Connection={id:string;organization_id:string;facility_id:string;name:string;endpoint:string;status:string;version:number;request_hash:string};
type Link={id:string;connection_id:string;patient_id:string;encounter_id:string;external_patient:string;external_encounter:string};
type Inbox={id:string;connection_id:string;message_id:string;body_hash:string;payload:string;external_id:string|null;external_version:number|null;content_hash:string|null;status:string;diagnostic:string;source_id:string|null;source_version:number|null};
type Head={external_version:number;source_id:string;source_version:number;link_id:string};
type Subscription={id:string;connection_id:string;organization_id:string;facility_id:string;patient_id:string;user_id:string;session_id:string;status:string;version:number};
type Delivery={id:string;subscription_id:string;source_id:string;source_version:number;payload:string;body_hash:string;status:string;attempts:number;due_at:number;diagnostic:string;lease_id:string|null;lease_until:number|null};
export class IntegrationError extends AppError {constructor(code="invalid",message="The partner request was rejected."){super(code,message);}}
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const key=(value:string)=>{if(typeof value!=="string"||!/^[A-Za-z0-9_.-]{1,80}$/.test(value))throw new ValidationError("invalid","Use an identifier of 1 to 80 letters, numbers, dots, dashes or underscores.");return value;};
function dependency(db:AppDatabase){assertLocalHealthcareSandbox();if(get<{value:string}>(db,"SELECT value FROM integration_controls WHERE name='dependency'")?.value!=="available")throw new AppError("unavailable","Partner exchange is unavailable. Restore the dependency and retry.");}
function audit(db:AppDatabase,ctx:SessionContext,action:string,id:string,outcome:"success"|"denied"="success"){writeAudit(db,ctx,{action:`integration.${action}`,resourceType:"PartnerExchange",resourceId:id,outcome});}
function actor(db:AppDatabase,ctx:SessionContext,manage=false){
 dependency(db);
 const user=get<{account_status:string;organization_id:string}>(db,"SELECT account_status,organization_id FROM users WHERE id=?",ctx.userId);
 if(!ctx.sessionId||!ctx.facilityId||user?.account_status!=="active"||user.organization_id!==ctx.organizationId)throw new ForbiddenError();
 const binding=get<{user_id:string;revoked_at:string|null;absolute_expires_at:string;idle_expires_at:string}>(db,"SELECT user_id,revoked_at,absolute_expires_at,idle_expires_at FROM auth_sessions WHERE session_id=?",ctx.sessionId);
 if(binding){if(binding.user_id!==ctx.userId||binding.revoked_at||Date.parse(binding.absolute_expires_at)<=Date.now()||Date.parse(binding.idle_expires_at)<=Date.now())throw new ForbiddenError();}
 // Foundation sessions are resolved live by API/worker boundaries, as in SMART.
 if(!ctx.sessionId.startsWith("ses_")){const session=get<{user_id:string;revoked_at:string|null;expires_at:string}>(db,"SELECT user_id,revoked_at,expires_at FROM sessions WHERE id=?",ctx.sessionId);if(!session||session.user_id!==ctx.userId||session.revoked_at||Date.parse(session.expires_at)<=Date.now())throw new ForbiddenError();}
 const permission=manage?"organization.manage":"clinical.observation.read";
 const decision=authorize(db,{principalId:ctx.userId,accountActive:true},permission,{type:"PartnerExchange",organizationId:ctx.organizationId,facilityId:ctx.facilityId,sensitivity:manage?"administrative":"clinical"},{purpose:ctx.purposeOfUse,assurance:"directory",sessionActive:true,activeFacilityId:ctx.facilityId,correlationId:ctx.sessionId.replace(/[^A-Za-z0-9_-]/g,"").slice(0,80)});
 if(!decision.allow||(!manage&&ctx.purposeOfUse!=="TREATMENT"))throw new ForbiddenError();
}
function connection(db:AppDatabase,id:string,ctx?:SessionContext,active=true){
 const row=get<Connection>(db,"SELECT * FROM integration_connections WHERE id=?",id);
 if(!row||(ctx&&(row.organization_id!==ctx.organizationId||row.facility_id!==ctx.facilityId)))throw new NotFoundError();
 if(active&&row.status!=="active")throw new ConflictError("conflict","This partner connection is disabled.");return row;
}
function endpoint(value:string){let url:URL;try{url=new URL(value);}catch{throw new ValidationError();}
 if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||Number(url.port)<1024||[3000,8081,8082,15556].includes(Number(url.port))||url.pathname!=="/curasphere/webhook"||url.search||url.hash||url.username||url.password||url.href!==value)throw new ValidationError("invalid","Use http://127.0.0.1:PORT/curasphere/webhook on a dedicated local partner port.");return value;
}
function signingKey(id:string){const root=process.env.CURASPHERE_INTEGRATION_KEY;if(!root||Buffer.byteLength(root)<32)throw new AppError("unavailable","The local partner signing root is unavailable.");return createHmac("sha256",root).update(`curasphere-partner-v1\n${id}`).digest("hex");}
export function signIntegrationMessage(secret:string,connectionId:string,messageId:string,timestamp:string,body:string){return createHmac("sha256",secret).update(`curasphere-v1\n${connectionId}\n${messageId}\n${timestamp}\n${body}`).digest("hex");}
export function registerIntegrationConnection(db:AppDatabase,ctx:SessionContext,input:{name:string;endpoint:string;idempotencyKey:string}){
 actor(db,ctx,true);key(input.idempotencyKey);const name=input.name.trim();if(!/^[\w .-]{3,100}$/.test(name))throw new ValidationError();const url=endpoint(input.endpoint),requestHash=hash(JSON.stringify([name,url,ctx.facilityId]));
 return transaction(db,()=>{const previous=get<Connection>(db,"SELECT * FROM integration_connections WHERE organization_id=? AND registration_key=?",ctx.organizationId,input.idempotencyKey);if(previous){if(previous.request_hash!==requestHash)throw new ConflictError("conflict","The record changed. Reload and try again.");return {id:previous.id,idempotent:true};}
 const id=`icn_${randomUUID()}`;signingKey(id);run(db,"INSERT INTO integration_connections VALUES(?,?,?,?,?,'active',1,?,?,?,?)",id,ctx.organizationId,ctx.facilityId,name,url,input.idempotencyKey,requestHash,ctx.userId,Date.now());audit(db,ctx,"connection.register",id);return {id,idempotent:false};});
}
export function revealIntegrationKey(db:AppDatabase,ctx:SessionContext,id:string){actor(db,ctx,true);connection(db,id,ctx);audit(db,ctx,"key.reveal",id);return {secret:signingKey(id)};}
export function disableIntegrationConnection(db:AppDatabase,ctx:SessionContext,id:string,version:number){actor(db,ctx,true);connection(db,id,ctx);return transaction(db,()=>{const changed=run(db,"UPDATE integration_connections SET status='disabled',version=version+1 WHERE id=? AND version=? AND status='active'",id,version);if(!changed.changes)throw new ConflictError("conflict","The record changed. Reload and try again.");run(db,"UPDATE integration_outbox SET status='cancelled',diagnostic='connection-disabled',lease_id=NULL,lease_until=NULL WHERE subscription_id IN(SELECT id FROM integration_subscriptions WHERE connection_id=?) AND status IN('queued','retry','sending')",id);audit(db,ctx,"connection.disable",id);return {id};});}
export function linkIntegrationPatient(db:AppDatabase,ctx:SessionContext,input:{connectionId:string;externalPatient:string;externalEncounter:string;patientId:string;encounterId:string}){
 actor(db,ctx);const c=connection(db,input.connectionId,ctx);key(input.externalPatient);key(input.externalEncounter);readMasterPatient(db,ctx,input.patientId);readVisitEncounter(db,ctx,input.encounterId);
 const encounter=get<{patient_id:string;organization_id:string;facility_id:string}>(db,"SELECT patient_id,organization_id,facility_id FROM visit_encounters WHERE id=?",input.encounterId);if(encounter?.patient_id!==input.patientId||encounter.organization_id!==ctx.organizationId||encounter.facility_id!==ctx.facilityId)throw new NotFoundError();
 return transaction(db,()=>{
 if(get(db,"SELECT id FROM integration_links WHERE connection_id=? AND ((external_patient=? AND patient_id<>?) OR (external_encounter=? AND (patient_id<>? OR encounter_id<>? OR external_patient<>?)))",c.id,input.externalPatient,input.patientId,input.externalEncounter,input.patientId,input.encounterId,input.externalPatient))throw new ConflictError("conflict","The partner patient or encounter is already bound to another identity. Reconcile the producer identifiers.");
 const previous=get<Link>(db,"SELECT * FROM integration_links WHERE connection_id=? AND external_patient=? AND external_encounter=?",c.id,input.externalPatient,input.externalEncounter);if(previous){if(previous.patient_id!==input.patientId||previous.encounter_id!==input.encounterId)throw new ConflictError("conflict","This partner identity is already linked. It cannot be retargeted.");return {id:previous.id};}const id=`ilk_${randomUUID()}`;run(db,"INSERT INTO integration_links VALUES(?,?,?,?,?,?,?,?,?,?)",id,c.id,ctx.organizationId,ctx.facilityId,input.externalPatient,input.externalEncounter,input.patientId,input.encounterId,ctx.userId,Date.now());audit(db,ctx,"identity.link",id);return {id};});
}
function object(value:unknown,fields:string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))throw new IntegrationError("invalid","unsupported-fields");return value as Record<string,unknown>;}
function reference(value:unknown,type:string){const row=object(value,["reference"]);if(typeof row.reference!=="string"||!row.reference.startsWith(`${type}/`))throw new IntegrationError("invalid","invalid-reference");return key(row.reference.slice(type.length+1));}
export function parseIntegrationJson(raw:string){
 let json:unknown;try{json=JSON.parse(raw);}catch{throw new IntegrationError("invalid","malformed-json");}
 const tokens=raw.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)??[],stack:Array<Set<string>|null>=[];
 for(let i=0;i<tokens.length;i++){const token=tokens[i];if(token==="{"||token==="["){stack.push(token==="{"?new Set():null);if(stack.length>24)throw new IntegrationError("invalid","payload-too-deep");}else if(token==="}"||token==="]")stack.pop();else if(token.startsWith('"')&&tokens[i+1]===":"){const name=JSON.parse(token) as string,keys=stack[stack.length-1];if(keys?.has(name))throw new IntegrationError("invalid","duplicate-json-field");keys?.add(name);}}
 return json;
}
export function parseIntegrationObservation(raw:string){
 const json=parseIntegrationJson(raw);
 const envelope=object(json,["contractVersion","sourceVersion","resource"]);if(envelope.contractVersion!==1||!Number.isSafeInteger(envelope.sourceVersion)||Number(envelope.sourceVersion)<1)throw new IntegrationError("invalid","unsupported-envelope");
 const r=object(envelope.resource,["resourceType","id","meta","status","code","subject","encounter","effectiveDateTime","valueQuantity"]);
 if(r.resourceType!=="Observation"||typeof r.id!=="string"||!["preliminary","final","corrected"].includes(String(r.status)))throw new IntegrationError("invalid","unsupported-observation");key(r.id);
 if(r.meta!==undefined){const meta=object(r.meta,["versionId"]);if(meta.versionId!==String(envelope.sourceVersion))throw new IntegrationError("invalid","invalid-resource-version");}
 const code=object(r.code,["coding"]);if(!Array.isArray(code.coding)||code.coding.length!==1)throw new IntegrationError("invalid","unsupported-coding");const coding=object(code.coding[0],["system","version","code"]);
 const concept=listSourceCatalog().quantities.find(c=>c.code===coding.code&&sourceSystemUri(c.system)===coding.system&&c.version===coding.version);if(!concept)throw new IntegrationError("invalid","unsupported-code");
 const quantity=object(r.valueQuantity,["value","unit","code","system"]);if(typeof quantity.value!=="number"||!Number.isFinite(quantity.value)||quantity.value<concept.min||quantity.value>concept.max||quantity.code!==concept.unit||quantity.unit!==concept.unit||quantity.system!==sourceSystemUri(listSourceCatalog().unitSystem))throw new IntegrationError("invalid","invalid-quantity");
 if(typeof r.effectiveDateTime!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.effectiveDateTime)||!Number.isFinite(Date.parse(r.effectiveDateTime))||new Date(r.effectiveDateTime).toISOString()!==r.effectiveDateTime)throw new IntegrationError("invalid","invalid-effective-time");
 return {externalId:r.id,version:Number(envelope.sourceVersion),patient:reference(r.subject,"Patient"),encounter:reference(r.encounter,"Encounter"),code:concept.code,value:quantity.value,unit:concept.unit,status:String(r.status),effectiveAt:r.effectiveDateTime,contentHash:hash(JSON.stringify(envelope))};
}
export function verifyIntegrationTransport(db:AppDatabase,id:string,headers:{messageId:string;timestamp:string;signature:string},raw:string,batch=false){
 dependency(db);const c=connection(db,id);key(headers.messageId);
 if(Buffer.byteLength(raw)>(batch?262144:65536))throw new IntegrationError("invalid","body-too-large");
 if(!/^\d{13}$/.test(headers.timestamp)||Math.abs(Date.now()-Number(headers.timestamp))>300000||!/^[a-f0-9]{64}$/.test(headers.signature))throw new ForbiddenError();
 const expected=batch?signIntegrationBatch(signingKey(c.id),c.id,headers.messageId,headers.timestamp,raw):signIntegrationMessage(signingKey(c.id),c.id,headers.messageId,headers.timestamp,raw);if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(headers.signature,"hex")))throw new ForbiddenError();
 return c;
}
export function signIntegrationBatch(secret:string,id:string,message:string,timestamp:string,raw:string){return createHmac("sha256",secret).update(`curasphere-batch-v1\n${id}\n${message}\n${timestamp}\n${raw}`).digest("hex");}
export function receiveIntegrationMessage(db:AppDatabase,id:string,headers:{messageId:string;timestamp:string;signature:string},raw:string){const c=verifyIntegrationTransport(db,id,headers,raw);return persistAuthenticatedMessage(db,c,headers.messageId,raw);}
function persistAuthenticatedMessage(db:AppDatabase,c:Connection,messageId:string,raw:string){
 return transaction(db,()=>{
  const bodyHash=hash(raw),alias=get<{body_hash:string;receipt_id:string}>(db,"SELECT body_hash,receipt_id FROM integration_aliases WHERE connection_id=? AND message_id=?",c.id,messageId);
  if(alias){if(alias.body_hash!==bodyHash)throw new ConflictError("conflict","The message ID already identifies different bytes.");const receipt=get<Inbox>(db,"SELECT * FROM integration_inbox WHERE id=?",alias.receipt_id)!;return {id:receipt.id,status:receipt.status,diagnostic:receipt.diagnostic,duplicate:true};}
  const prior=get<Inbox>(db,"SELECT * FROM integration_inbox WHERE connection_id=? AND message_id=?",c.id,messageId);
  if(prior){if(prior.body_hash!==bodyHash)throw new ConflictError("conflict","The message ID already identifies different bytes.");return {id:prior.id,status:prior.status,diagnostic:prior.diagnostic,duplicate:true};}
  let parsed:ReturnType<typeof parseIntegrationObservation>|undefined,diagnostic="awaiting-review",status="pending";
  try{parsed=parseIntegrationObservation(raw);}catch(error){diagnostic=error instanceof IntegrationError?error.message:"invalid-payload";status="quarantined";}
  if(parsed){const same=get<Inbox>(db,"SELECT * FROM integration_inbox WHERE connection_id=? AND external_id=? AND external_version=? AND status IN('pending','applied')",c.id,parsed.externalId,parsed.version);
   if(same?.content_hash===parsed.contentHash){run(db,"INSERT INTO integration_aliases VALUES(?,?,?,?)",c.id,messageId,bodyHash,same.id);return {id:same.id,status:same.status,diagnostic:same.diagnostic,duplicate:true};}
   const head=get<Head>(db,"SELECT * FROM integration_heads WHERE connection_id=? AND external_id=?",c.id,parsed.externalId);
   if(same){status="quarantined";diagnostic="conflicting-source-version";}
   else if(parsed.version!==(head?.external_version??0)+1){status="quarantined";diagnostic="out-of-order-version";}
   else if(!get(db,"SELECT id FROM integration_links WHERE connection_id=? AND external_patient=? AND external_encounter=?",c.id,parsed.patient,parsed.encounter)){status="quarantined";diagnostic="unmapped-identity";}
  }
  const inboxId=`iin_${randomUUID()}`;run(db,"INSERT INTO integration_inbox(id,connection_id,message_id,body_hash,payload,external_id,external_version,content_hash,status,diagnostic,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",inboxId,c.id,messageId,bodyHash,raw,parsed?.externalId??null,parsed?.version??null,parsed?.contentHash??null,status,diagnostic,Date.now());
  // Transport receipt records no synthetic clinician identity and never logs the body.
  return {id:inboxId,status,diagnostic,duplicate:false};
 });
}
function scopedInbox(db:AppDatabase,ctx:SessionContext,id:string){const row=get<Inbox>(db,"SELECT * FROM integration_inbox WHERE id=?",id);if(!row)throw new NotFoundError();connection(db,row.connection_id,ctx);return row;}
function authorizedLink(db:AppDatabase,ctx:SessionContext,row:Inbox){const parsed=parseIntegrationObservation(row.payload),link=get<Link>(db,"SELECT * FROM integration_links WHERE connection_id=? AND external_patient=? AND external_encounter=?",row.connection_id,parsed.patient,parsed.encounter);if(!link)throw new ConflictError("conflict","Map the partner identity before importing a new message.");readMasterPatient(db,ctx,link.patient_id);readVisitEncounter(db,ctx,link.encounter_id);return {parsed,link};}
export function readIntegrationImport(db:AppDatabase,ctx:SessionContext,id:string){actor(db,ctx);const row=scopedInbox(db,ctx,id),{link}=authorizedLink(db,ctx,row);audit(db,ctx,"import.read",id);return {id:row.id,status:row.status,diagnostic:row.diagnostic,payload:row.payload,patientId:link.patient_id,encounterId:link.encounter_id};}
export function reviewIntegrationImport(db:AppDatabase,ctx:SessionContext,id:string,approve:boolean){
 actor(db,ctx);return transaction(db,()=>{
 const row=scopedInbox(db,ctx,id),{parsed,link}=authorizedLink(db,ctx,row);
 if(row.status==="applied"){audit(db,ctx,"import.replay",id);return {id:row.source_id!,version:row.source_version!,idempotent:true};}
 if(row.status!=="pending")throw new ConflictError("conflict","Only a pending valid import can be reviewed.");
 if(!approve){run(db,"UPDATE integration_inbox SET status='rejected',diagnostic='clinician-rejected',reviewed_by=?,reviewed_at=? WHERE id=?",ctx.userId,Date.now(),id);audit(db,ctx,"import.reject",id);return {id,version:0,idempotent:false};}
 const head=get<Head>(db,"SELECT * FROM integration_heads WHERE connection_id=? AND external_id=?",row.connection_id,parsed.externalId);
 if(parsed.version!==(head?.external_version??0)+1)throw new ConflictError("conflict","The partner source version is stale.");
 const command=`integration_${hash(id).slice(0,55)}`;
 let result:{id:string;version:number};
 if(head){
  if(head.link_id!==link.id)throw new ConflictError("conflict","The source identity cannot change between versions.");
  readObservation(db,ctx,head.source_id);
  const source=get<{version:number;code:string;unit_code:string;effective_at:string}>(db,"SELECT version,code,unit_code,effective_at FROM source_observations WHERE id=?",head.source_id);
  if(!source||source.version!==head.source_version||source.code!==parsed.code||source.unit_code!==parsed.unit||source.effective_at!==parsed.effectiveAt||parsed.status!=="corrected")throw new ConflictError("conflict","The source changed or the correction is incompatible. Reconcile it before import.");
  result=correctObservation(db,ctx,head.source_id,{expectedVersion:head.source_version,valueQuantity:parsed.value,reason:"partner-correction",idempotencyKey:command});
 }else{
  if(parsed.status==="corrected")throw new ConflictError("conflict","A correction requires an imported source record.");
  const encounter=get<{practitioner_id:string}>(db,"SELECT practitioner_id FROM visit_encounters WHERE id=?",link.encounter_id)!;
  result=recordObservation(db,ctx,{patientId:link.patient_id,encounterId:link.encounter_id,practitionerId:encounter.practitioner_id,code:parsed.code,valueQuantity:parsed.value,unit:parsed.unit,status:parsed.status,effectiveAt:parsed.effectiveAt,idempotencyKey:command});
 }
 run(db,"INSERT INTO integration_heads VALUES(?,?,?,?,?,?) ON CONFLICT(connection_id,external_id) DO UPDATE SET external_version=excluded.external_version,source_version=excluded.source_version",row.connection_id,parsed.externalId,parsed.version,result.id,result.version,link.id);
 run(db,"UPDATE integration_inbox SET status='applied',diagnostic='applied',reviewed_by=?,reviewed_at=?,source_id=?,source_version=? WHERE id=?",ctx.userId,Date.now(),result.id,result.version,id);audit(db,ctx,"import.apply",id);return {...result,idempotent:false};
 });
}
export function createIntegrationSubscription(db:AppDatabase,ctx:SessionContext,connectionId:string,patientId:string){actor(db,ctx);connection(db,connectionId,ctx);readMasterPatient(db,ctx,patientId);return transaction(db,()=>{const existing=get<Subscription>(db,"SELECT * FROM integration_subscriptions WHERE connection_id=? AND patient_id=? AND user_id=?",connectionId,patientId,ctx.userId);if(existing)return {id:existing.id};const id=`isu_${randomUUID()}`;run(db,"INSERT INTO integration_subscriptions VALUES(?,?,?,?,?,?,?,'active',1,?)",id,connectionId,ctx.organizationId,ctx.facilityId,patientId,ctx.userId,ctx.sessionId,Date.now());audit(db,ctx,"subscription.create",id);return {id};});}
function subscription(db:AppDatabase,ctx:SessionContext,id:string){const row=get<Subscription>(db,"SELECT * FROM integration_subscriptions WHERE id=? AND organization_id=? AND facility_id=? AND user_id=?",id,ctx.organizationId,ctx.facilityId,ctx.userId);if(!row)throw new NotFoundError();connection(db,row.connection_id,ctx);readMasterPatient(db,ctx,row.patient_id);return row;}
export function transitionIntegrationSubscription(db:AppDatabase,ctx:SessionContext,id:string,version:number,status:string){actor(db,ctx);const row=subscription(db,ctx,id);if(!["active","paused","ended"].includes(status)||row.status==="ended"||status===row.status)throw new ConflictError("conflict","The record changed. Reload and try again.");return transaction(db,()=>{if(!run(db,"UPDATE integration_subscriptions SET status=?,version=version+1,session_id=? WHERE id=? AND version=?",status,ctx.sessionId,id,version).changes)throw new ConflictError("conflict","The record changed. Reload and try again.");if(status==="ended")run(db,"UPDATE integration_outbox SET status='cancelled',diagnostic='subscription-ended',lease_id=NULL,lease_until=NULL WHERE subscription_id=? AND status IN('queued','retry','sending')",id);audit(db,ctx,`subscription.${status}`,id);return {id};});}
export function exportIntegrationObservation(db:AppDatabase,ctx:SessionContext,subscriptionId:string,sourceId:string){actor(db,ctx);const sub=subscription(db,ctx,subscriptionId);if(sub.status!=="active")throw new ConflictError("conflict","The record changed. Reload and try again.");readSourceR4ForPatient(db,ctx,"Observation",sub.patient_id,sourceFhirId(ctx.organizationId,"Observation",sourceId));return transaction(db,()=>{queueIntegrationObservation(db,sourceId,sub.id);const row=get<{id:string}>(db,"SELECT id FROM integration_outbox WHERE subscription_id=? AND source_id=? ORDER BY source_version DESC LIMIT 1",sub.id,sourceId);if(!row)throw new ConflictError("conflict","The record changed. Reload and try again.");audit(db,ctx,"export.queue",row.id);return {id:row.id};});}
export function integrationSessionForDelivery(db:AppDatabase,id:string){return get<{session_id:string}>(db,"SELECT s.session_id FROM integration_outbox o JOIN integration_subscriptions s ON s.id=o.subscription_id WHERE o.id=?",id)?.session_id??null;}
export function listIntegrationDeliveryCandidates(db:AppDatabase){dependency(db);return all<{id:string}>(db,"SELECT id FROM integration_outbox WHERE (status IN('queued','retry') AND due_at<=?) OR (status='sending' AND lease_until<=?) ORDER BY due_at LIMIT 20",Date.now(),Date.now()).map(row=>row.id);}
export async function deliverIntegrationMessage(db:AppDatabase,id:string,ctx:SessionContext|null){
 dependency(db);
 const claim=transaction(db,()=>{
  const row=get<Delivery>(db,"SELECT * FROM integration_outbox WHERE id=?",id);if(!row)throw new NotFoundError();
  if(!["queued","retry","sending"].includes(row.status)||(row.status==="sending"&&Number(row.lease_until)>Date.now())||row.due_at>Date.now())return null;
  const sub=get<Subscription>(db,"SELECT * FROM integration_subscriptions WHERE id=?",row.subscription_id)!;
  if(sub.status==="paused")return null;
  let c:Connection;
  try{if(!ctx||ctx.sessionId!==sub.session_id||ctx.userId!==sub.user_id||ctx.organizationId!==sub.organization_id||ctx.facilityId!==sub.facility_id||sub.status!=="active")throw new ForbiddenError();actor(db,ctx);c=connection(db,sub.connection_id,ctx);endpoint(c.endpoint);readSourceR4ForPatient(db,ctx,"Observation",sub.patient_id,sourceFhirId(ctx.organizationId,"Observation",row.source_id));signingKey(c.id);}
  catch(error){if(error instanceof AppError&&error.code==="unavailable")throw error;run(db,"UPDATE integration_outbox SET status='cancelled',diagnostic='authority-revoked',lease_id=NULL,lease_until=NULL WHERE id=?",id);return null;}
  if(row.attempts>=5){run(db,"UPDATE integration_outbox SET status='quarantined',diagnostic='attempts-exhausted',lease_id=NULL,lease_until=NULL WHERE id=?",id);return null;}
  const lease=randomUUID();run(db,"UPDATE integration_outbox SET status='sending',attempts=attempts+1,lease_id=?,lease_until=?,diagnostic='sending' WHERE id=?",lease,Date.now()+15000,id);return {row,c,lease};
 });
 if(!claim)return {id,status:get<{status:string}>(db,"SELECT status FROM integration_outbox WHERE id=?",id)!.status};
 const timestamp=String(Date.now()),signature=signIntegrationMessage(signingKey(claim.c.id),claim.c.id,id,timestamp,claim.row.payload);
 let delivered=false,diagnostic="network-failure";
 try{const response=await fetch(claim.c.endpoint,{method:"POST",headers:{"content-type":"application/json","x-curasphere-connection":claim.c.id,"x-curasphere-message":id,"x-curasphere-timestamp":timestamp,"x-curasphere-signature":signature},body:claim.row.payload,redirect:"manual",signal:AbortSignal.timeout(2000)});delivered=response.status>=200&&response.status<300;diagnostic=delivered?"acknowledged":`http-${response.status}`;await response.body?.cancel();}catch{/* Never store provider response text or clinical payload in diagnostics. */}
 return transaction(db,()=>{const attempts=claim.row.attempts+1,status=delivered?"delivered":attempts>=5?"quarantined":"retry";run(db,"UPDATE integration_outbox SET status=?,diagnostic=?,due_at=?,lease_id=NULL,lease_until=NULL,delivered_at=? WHERE id=? AND lease_id=? AND status='sending'",status,diagnostic,Date.now()+Math.min(300000,1000*2**attempts),delivered?Date.now():null,id,claim.lease);audit(db,ctx!,delivered?"delivery.acknowledged":"delivery.failed",id,delivered?"success":"denied");return {id,status:get<{status:string}>(db,"SELECT status FROM integration_outbox WHERE id=?",id)!.status};});
}
export function listIntegrationWorkspace(db:AppDatabase,ctx:SessionContext){
 let manage=false;try{actor(db,ctx,true);manage=true;}catch{actor(db,ctx);}
 const connections=all<Connection>(db,"SELECT id,organization_id,facility_id,name,endpoint,status,version FROM integration_connections WHERE organization_id=? AND facility_id=? ORDER BY name",ctx.organizationId,ctx.facilityId).map(row=>({...row}));
 if(manage)return {manage,connections,links:[],inbox:[],subscriptions:[],deliveries:[]};
 const links=all<Link>(db,"SELECT l.* FROM integration_links l JOIN integration_connections c ON c.id=l.connection_id WHERE c.organization_id=? AND c.facility_id=?",ctx.organizationId,ctx.facilityId).filter(row=>{try{readMasterPatient(db,ctx,row.patient_id);readVisitEncounter(db,ctx,row.encounter_id);return true;}catch{return false;}}).map(row=>({...row}));
 const allowed=new Set(links.map(row=>`${row.connection_id}/${row.external_patient}/${row.external_encounter}`));
 const inbox=all<Inbox>(db,"SELECT i.* FROM integration_inbox i JOIN integration_connections c ON c.id=i.connection_id WHERE c.organization_id=? AND c.facility_id=? ORDER BY i.received_at DESC LIMIT 200",ctx.organizationId,ctx.facilityId).filter(row=>{if(!row.external_id)return true;try{const p=parseIntegrationObservation(row.payload);return allowed.has(`${row.connection_id}/${p.patient}/${p.encounter}`);}catch{return false;}}).map(row=>({id:row.id,connectionId:row.connection_id,messageId:row.message_id,status:row.status,diagnostic:row.diagnostic,externalId:row.external_id,externalVersion:row.external_version,sourceId:row.source_id}));
 const subscriptions=all<Subscription>(db,"SELECT * FROM integration_subscriptions WHERE organization_id=? AND facility_id=? AND user_id=?",ctx.organizationId,ctx.facilityId,ctx.userId).filter(row=>{try{readMasterPatient(db,ctx,row.patient_id);return true;}catch{return false;}}).map(row=>({id:row.id,connection_id:row.connection_id,patient_id:row.patient_id,status:row.status,version:row.version}));
 const deliveries=all<Delivery>(db,"SELECT o.* FROM integration_outbox o JOIN integration_subscriptions s ON s.id=o.subscription_id WHERE s.organization_id=? AND s.facility_id=? AND s.user_id=? ORDER BY o.created_at DESC LIMIT 200",ctx.organizationId,ctx.facilityId,ctx.userId).filter(row=>subscriptions.some(s=>s.id===row.subscription_id)).map(row=>({id:row.id,subscriptionId:row.subscription_id,sourceId:row.source_id,sourceVersion:row.source_version,status:row.status,attempts:row.attempts,diagnostic:row.diagnostic,dueAt:row.due_at}));
 return {manage,connections,links,inbox,subscriptions,deliveries};
}
export function listIntegrationEncounters(db:AppDatabase,ctx:SessionContext){actor(db,ctx);return all<{id:string;patient_id:string;status:string}>(db,"SELECT id,patient_id,status FROM visit_encounters WHERE organization_id=? AND facility_id=? ORDER BY created_at DESC",ctx.organizationId,ctx.facilityId).filter(row=>{try{readMasterPatient(db,ctx,row.patient_id);readVisitEncounter(db,ctx,row.id);return true;}catch{return false;}}).map(row=>({id:row.id,patientId:row.patient_id,label:`${row.id} · ${row.status}`}));}

export function assertIntegrationActor(db:AppDatabase,ctx:SessionContext){actor(db,ctx);}
export function assertIntegrationConnection(db:AppDatabase,ctx:SessionContext,id:string,active=true){return connection(db,id,ctx,active);}
export function integrationCursorMac(value:string){return createHmac("sha256",signingKey("reconciliation-cursors")).update(value).digest("hex");}
export function integrationOwnedSubscription(db:AppDatabase,ctx:SessionContext,id:string){actor(db,ctx);return subscription(db,ctx,id);}
export function previewIntegrationMessage(db:AppDatabase,ctx:SessionContext,id:string,raw:string){actor(db,ctx);connection(db,id,ctx);const {link}=authorizedLink(db,ctx,{connection_id:id,payload:raw} as Inbox);const patient=readMasterPatient(db,ctx,link.patient_id);return {patientId:link.patient_id,patientLabel:`${patient.family_name}, ${patient.given_name} · ${patient.mrn}`,encounterId:link.encounter_id,payload:raw};}
export function receiveIntegrationBatchItem(db:AppDatabase,ctx:SessionContext,batchId:string,seq:number){actor(db,ctx);const item=get<{connection_id:string;payload:string;message_id:string;body_hash:string}>(db,"SELECT b.connection_id,i.payload,i.message_id,i.body_hash FROM integration_batches b JOIN integration_batch_items i ON i.batch_id=b.id WHERE b.id=? AND i.seq=? AND b.kind='import' AND b.organization_id=? AND b.facility_id=? AND b.owner_id=?",batchId,seq,ctx.organizationId,ctx.facilityId,ctx.userId);if(!item||hash(item.payload)!==item.body_hash)throw new NotFoundError();return persistAuthenticatedMessage(db,connection(db,item.connection_id,ctx),item.message_id,item.payload);}
export function recoverIntegrationReceipt(db:AppDatabase,ctx:SessionContext,id:string,commandKey:string,reason:string){actor(db,ctx);key(commandKey);if(!/^[a-z-]{3,60}$/.test(reason))throw new ValidationError();return transaction(db,()=>{const row=scopedInbox(db,ctx,id);authorizedLink(db,ctx,row);const requestHash=hash(JSON.stringify([ctx.userId,id,reason]));const prior=get<{request_hash:string;result_id:string}>(db,"SELECT request_hash,result_id FROM integration_recoveries WHERE organization_id=? AND command_key=?",ctx.organizationId,commandKey);if(prior){if(prior.request_hash!==requestHash)throw new ConflictError("conflict","The recovery key was already used.");return {id:prior.result_id};}if(row.status!=="quarantined")throw new ConflictError("conflict","Only quarantined receipts can be recovered.");const result=persistAuthenticatedMessage(db,connection(db,row.connection_id,ctx),`recovery-${hash(id+commandKey).slice(0,60)}`,row.payload);if(result.status==="quarantined")throw new ConflictError("conflict","The immutable payload is still invalid or its prerequisite is unresolved.");run(db,"INSERT INTO integration_recoveries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",`irc_${randomUUID()}`,ctx.organizationId,ctx.facilityId,ctx.userId,"import",id,result.id,reason,row.status,0,commandKey,requestHash,Date.now());audit(db,ctx,"receipt.recover",id);return {id:result.id};});}
export function redriveIntegrationDelivery(db:AppDatabase,ctx:SessionContext,id:string,version:number,commandKey:string,reason:string){actor(db,ctx);key(commandKey);if(!/^[a-z-]{3,60}$/.test(reason))throw new ValidationError();return transaction(db,()=>{const row=get<Delivery&{recovery_count:number;recovery_version:number}>(db,"SELECT * FROM integration_outbox WHERE id=?",id);if(!row)throw new NotFoundError();const sub=subscription(db,ctx,row.subscription_id);if(sub.status!=="active"||sub.session_id!==ctx.sessionId)throw new ForbiddenError("forbidden","Pause and resume the owned subscription in this session before redrive.");readSourceR4ForPatient(db,ctx,"Observation",sub.patient_id,sourceFhirId(ctx.organizationId,"Observation",row.source_id));signingKey(sub.connection_id);const requestHash=hash(JSON.stringify([ctx.userId,id,version,reason]));const prior=get<{request_hash:string}>(db,"SELECT request_hash FROM integration_recoveries WHERE organization_id=? AND command_key=?",ctx.organizationId,commandKey);if(prior){if(prior.request_hash!==requestHash)throw new ConflictError("conflict","The recovery key was already used.");return {id};}if(!["quarantined","cancelled"].includes(row.status)||row.recovery_count>=3||row.recovery_version!==version)throw new ConflictError("conflict","This delivery cannot be redriven at its current version.");run(db,"INSERT INTO integration_recoveries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",`irc_${randomUUID()}`,ctx.organizationId,ctx.facilityId,ctx.userId,"delivery",id,id,reason,row.status,row.attempts,commandKey,requestHash,Date.now());run(db,"UPDATE integration_outbox SET status='retry',attempts=0,due_at=?,lease_id=NULL,lease_until=NULL,diagnostic='operator-redrive',recovery_count=recovery_count+1,recovery_version=recovery_version+1 WHERE id=?",Date.now(),id);audit(db,ctx,"delivery.redrive",id);return {id};});}
