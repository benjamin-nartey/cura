import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { assertTerminologyAccess, lookupControlledConcept } from "./code-system-registry";

export type MappingCode = { system:string; version:string; code:string };
export type MappingInput = { source:MappingCode; target:MappingCode; mappingVersion:string; equivalence:"equivalent"|"broader"|"narrower"|"related"; activeFrom:string; activeTo?:string|null; sourceUrl:string; rationale:string; idempotencyKey:string };
export type MappingReviewInput = { decision:"approved"|"rejected"|"revoked"; expectedVersion:number; reason:string; idempotencyKey:string };
export type TranslationInput = { source:MappingCode; targetSystem:string; targetVersion:string; mappingVersion:string };
export type MappingRow = { id:string; organization_id:string; source_release_id:string; source_concept_id:string; target_release_id:string; target_concept_id:string; mapping_version:string; equivalence:MappingInput["equivalence"]; active_from:string; active_to:string|null; source_url:string; rationale:string; manifest_sha256:string; proposed_by:string; created_at:string; status:"pending"|"approved"|"rejected"|"revoked"; version:number; reviewer_id:string|null; reviewed_at:string|null; review_reason:string|null; source_system:string; source_version:string; source_code:string; source_display:string; target_system:string; target_version:string; target_code:string; target_display:string };
type ReviewRow = { id:string; reviewer_id:string; decision:string; version:number; reason:string; created_at:string };
type Receipt = { id:string; version:number; status:MappingRow["status"]; replayed:boolean };
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const validDate=(value:unknown):value is string=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const today=()=>new Date().toISOString().slice(0,10);
const select=`SELECT m.*,ss.uri source_system,ss.version source_version,sc.code source_code,sc.display source_display,
 ts.uri target_system,ts.version target_version,tc.code target_code,tc.display target_display
 FROM terminology_mapping_state m JOIN terminology_releases sr ON sr.id=m.source_release_id JOIN code_systems ss ON ss.id=sr.code_system_id JOIN concepts sc ON sc.id=m.source_concept_id
 JOIN terminology_releases tr ON tr.id=m.target_release_id JOIN code_systems ts ON ts.id=tr.code_system_id JOIN concepts tc ON tc.id=m.target_concept_id`;
function code(value:MappingCode):MappingCode {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(k=>!["system","version","code"].includes(k)) || ![value.system,value.version,value.code].every(v=>typeof v==="string" && v.length>0) || value.system.length>300 || value.version.length>100 || value.code.length>80) throw new ValidationError("invalid","Supply an exact system, version and code for each concept.");
  return {system:value.system,version:value.version,code:value.code};
}
function commandKey(value:unknown) { if(typeof value!=="string" || !/^[A-Za-z0-9_-]{8,80}$/.test(value))throw new ValidationError();return value; }
function replay(db:AppDatabase,ctx:SessionContext,key:string,hash:string) {
  const prior=get<{request_hash:string;response_json:string}>(db,"SELECT request_hash,response_json FROM terminology_mapping_commands WHERE organization_id=? AND command_key=?",ctx.organizationId,key);
  if(!prior)return null;if(prior.request_hash!==hash)throw new ConflictError("conflict","This submission key belongs to a different mapping command.");
  return {...JSON.parse(prior.response_json),replayed:true} as Receipt;
}
function receipt(db:AppDatabase,ctx:SessionContext,key:string,hash:string,result:Receipt) {
  run(db,"INSERT INTO terminology_mapping_commands(organization_id,command_key,request_hash,mapping_id,response_json) VALUES(?,?,?,?,?)",ctx.organizationId,key,hash,result.id,JSON.stringify(result));
}
function event(db:AppDatabase,ctx:SessionContext,type:string,result:Receipt) {
  run(db,"INSERT INTO outbox(id,organization_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)",randomUUID(),ctx.organizationId,type,JSON.stringify({contractVersion:1,mappingId:result.id,version:result.version,status:result.status}),new Date().toISOString());
}
function row(db:AppDatabase,ctx:SessionContext,id:string) {
  const mapping=get<MappingRow>(db,`${select} WHERE m.organization_id=? AND m.id=?`,ctx.organizationId,id);
  if(!mapping)throw new NotFoundError("This mapping is not available.");return mapping;
}
function pinned(db:AppDatabase,ctx:SessionContext,tuple:MappingCode) {
  const concept=lookupControlledConcept(db,ctx,tuple.system,tuple.version,tuple.code);
  const pin=get<{id:string;active_from:string;active_to:string|null}>(db,"SELECT c.id,r.active_from,r.active_to FROM concepts c JOIN terminology_release_concepts p ON p.concept_id=c.id JOIN terminology_releases r ON r.id=p.release_id WHERE r.id=? AND c.code=?",concept.releaseId,tuple.code)!;
  return {releaseId:concept.releaseId,conceptId:pin.id,activeFrom:pin.active_from,activeTo:pin.active_to};
}
export function proposeTerminologyMapping(db:AppDatabase,ctx:SessionContext,input:MappingInput) {
  assertTerminologyAccess(db,ctx,"terminology.manage");
  if(!input)throw new ValidationError();const source=code(input.source),target=code(input.target),key=commandKey(input.idempotencyKey);
  if(typeof input.mappingVersion!=="string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.mappingVersion) || !["equivalent","broader","narrower","related"].includes(input.equivalence) || !validDate(input.activeFrom) || input.activeTo!==null && input.activeTo!==undefined && input.activeTo!=="" && (!validDate(input.activeTo) || input.activeTo<=input.activeFrom) || typeof input.rationale!=="string" || input.rationale.trim().length<10 || input.rationale.length>1000) throw new ValidationError("invalid","Enter a version, explicit relationship, valid interval and provenance rationale.");
  if(JSON.stringify(source)===JSON.stringify(target))throw new ValidationError("invalid","Source and target must identify different concepts.");
  let url:URL;try{url=new URL(input.sourceUrl);}catch{throw new ValidationError();}
  if(typeof input.sourceUrl!=="string" || input.sourceUrl.length>500 || url.protocol!=="https:" || url.username || url.password || url.search || url.hash)throw new ValidationError("invalid","Use an HTTPS provenance URL without credentials or query tokens.");
  const value={source,target,mappingVersion:input.mappingVersion,equivalence:input.equivalence,activeFrom:input.activeFrom,activeTo:input.activeTo||null,sourceUrl:url.href,rationale:input.rationale.trim()};
  const hash=digest({action:"propose",actor:ctx.userId,...value});
  return transaction(db,()=>{
    const prior=replay(db,ctx,key,hash);if(prior)return prior;
    const s=pinned(db,ctx,source),t=pinned(db,ctx,target);
    const end=[s.activeTo,t.activeTo].filter((v):v is string=>Boolean(v)).sort()[0];
    if(value.activeFrom<s.activeFrom || value.activeFrom<t.activeFrom || end && (!value.activeTo || value.activeTo>end))throw new ValidationError("invalid","The mapping interval must stay within both release intervals.");
    if(get(db,"SELECT id FROM terminology_mappings WHERE organization_id=? AND source_release_id=? AND source_concept_id=? AND target_release_id=? AND target_concept_id=? AND mapping_version=?",ctx.organizationId,s.releaseId,s.conceptId,t.releaseId,t.conceptId,value.mappingVersion))throw new ConflictError("conflict","This mapping version already exists. Use a new version for corrections.");
    const id=`map_${randomUUID()}`;
    run(db,`INSERT INTO terminology_mappings(id,organization_id,source_release_id,source_concept_id,target_release_id,target_concept_id,mapping_version,equivalence,active_from,active_to,source_url,rationale,manifest_sha256,proposed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,ctx.organizationId,s.releaseId,s.conceptId,t.releaseId,t.conceptId,value.mappingVersion,value.equivalence,value.activeFrom,value.activeTo,value.sourceUrl,value.rationale,digest(value),ctx.userId,new Date().toISOString());
    const result:Receipt={id,status:"pending",version:1,replayed:false};receipt(db,ctx,key,hash,result);event(db,ctx,"terminology.mapping.proposed.v1",result);
    writeAudit(db,ctx,{action:"terminology.mapping.propose",resourceType:"TerminologyMapping",resourceId:id,outcome:"success"});return result;
  });
}
export function readTerminologyMapping(db:AppDatabase,ctx:SessionContext,id:string) {
  assertTerminologyAccess(db,ctx,"terminology.read");const mapping=row(db,ctx,id);
  const reviews=all<ReviewRow>(db,"SELECT id,reviewer_id,decision,version,reason,created_at FROM terminology_mapping_reviews WHERE mapping_id=? ORDER BY version",id);
  writeAudit(db,ctx,{action:"terminology.mapping.read",resourceType:"TerminologyMapping",resourceId:id,outcome:"success"});return {...mapping,reviews};
}
export function reviewTerminologyMapping(db:AppDatabase,ctx:SessionContext,id:string,input:MappingReviewInput) {
  assertTerminologyAccess(db,ctx,"terminology.review");
  if(!input || !["approved","rejected","revoked"].includes(input.decision) || !Number.isInteger(input.expectedVersion) || input.expectedVersion<1 || typeof input.reason!=="string" || input.reason.trim().length<10 || input.reason.length>1000)throw new ValidationError("invalid","Choose a decision, expected version and a review reason of at least 10 characters.");
  const key=commandKey(input.idempotencyKey),value={decision:input.decision,expectedVersion:input.expectedVersion,reason:input.reason.trim()};const hash=digest({action:"review",actor:ctx.userId,id,...value});
  try { return transaction(db,()=>{
    const prior=replay(db,ctx,key,hash);if(prior)return prior;const mapping=row(db,ctx,id);
    if(mapping.proposed_by===ctx.userId)throw new ForbiddenError("forbidden","An independent reviewer must decide this proposal.");
    if(mapping.version!==input.expectedVersion || !(mapping.status==="pending" && ["approved","rejected"].includes(value.decision) || mapping.status==="approved" && value.decision==="revoked"))throw new ConflictError("conflict","The mapping changed or this decision is no longer available. Reload the current version.");
    if(value.decision==="approved"){
      pinned(db,ctx,{system:mapping.source_system,version:mapping.source_version,code:mapping.source_code});pinned(db,ctx,{system:mapping.target_system,version:mapping.target_version,code:mapping.target_code});
      if(mapping.active_to && mapping.active_to<=today())throw new ValidationError("invalid","An expired mapping cannot be approved.");
    }
    const result:Receipt={id,status:value.decision,version:mapping.version+1,replayed:false};
    run(db,"INSERT INTO terminology_mapping_reviews(id,mapping_id,organization_id,reviewer_id,decision,version,reason,created_at) VALUES(?,?,?,?,?,?,?,?)",randomUUID(),id,ctx.organizationId,ctx.userId,value.decision,result.version,value.reason,new Date().toISOString());
    receipt(db,ctx,key,hash,result);event(db,ctx,"terminology.mapping.reviewed.v1",result);writeAudit(db,ctx,{action:`terminology.mapping.${value.decision}`,resourceType:"TerminologyMapping",resourceId:id,outcome:"success"});return result;
  }); } catch(error) {
    writeAudit(db,ctx,{action:"terminology.mapping.review",resourceType:"TerminologyMapping",resourceId:null,outcome:"denied"});throw error;
  }
}
export function listTerminologyMappings(db:AppDatabase,ctx:SessionContext,view="review") {
  assertTerminologyAccess(db,ctx,"terminology.read");if(!["review","all"].includes(view))throw new ValidationError();
  const rows=all<MappingRow & {pending_count:number;approved_count:number}>(db,`${select.replace("SELECT m.*,",`SELECT m.*,
   (SELECT COUNT(*) FROM terminology_mapping_state p WHERE p.organization_id=m.organization_id AND p.source_release_id=m.source_release_id AND p.source_concept_id=m.source_concept_id AND p.target_release_id=m.target_release_id AND p.mapping_version=m.mapping_version AND p.status='pending') pending_count,
   (SELECT COUNT(*) FROM terminology_mapping_state p WHERE p.organization_id=m.organization_id AND p.source_release_id=m.source_release_id AND p.source_concept_id=m.source_concept_id AND p.target_release_id=m.target_release_id AND p.mapping_version=m.mapping_version AND p.status='approved') approved_count,`)}
   WHERE m.organization_id=? AND (?='all' OR m.status='pending' OR (m.status='approved' AND (m.equivalence<>'equivalent' OR EXISTS(SELECT 1 FROM terminology_mapping_state p WHERE p.organization_id=m.organization_id AND p.source_release_id=m.source_release_id AND p.source_concept_id=m.source_concept_id AND p.target_release_id=m.target_release_id AND p.mapping_version=m.mapping_version AND p.id<>m.id AND p.status IN ('pending','approved'))))) ORDER BY m.created_at,m.id LIMIT 100`,ctx.organizationId,view);
  writeAudit(db,ctx,{action:"terminology.mapping.list",resourceType:"TerminologyMapping",resourceId:null,outcome:"success"});
  return rows.map(r=>({...r,reviewReason:r.status==="pending"?"Awaiting independent review":r.status==="approved" && r.equivalence!=="equivalent"?"Non-equivalent relationship":r.status==="approved" && (r.pending_count>0 || r.approved_count>1)?"Competing candidates":null}));
}
export function translateTerminologyMapping(db:AppDatabase,ctx:SessionContext,input:TranslationInput) {
  assertTerminologyAccess(db,ctx,"terminology.read");if(!input)throw new ValidationError();const source=code(input.source);
  if(![input.targetSystem,input.targetVersion,input.mappingVersion].every(v=>typeof v==="string" && v.length>0 && v.length<=300))throw new ValidationError();
  const s=pinned(db,ctx,source);
  const target=get<{id:string;rights_kind:string;active_from:string;active_to:string|null}>(db,"SELECT r.id,r.rights_kind,r.active_from,r.active_to FROM terminology_releases r JOIN code_systems c ON c.id=r.code_system_id WHERE r.organization_id=? AND c.uri=? AND c.version=?",ctx.organizationId,input.targetSystem,input.targetVersion);
  if(!target)throw new ValidationError("code","The target system and version are not registered.");if(target.rights_kind!=="synthetic")throw new ForbiddenError("license","Reference-only terminology content is unavailable.");
  if(target.active_from>today() || target.active_to && target.active_to<=today())throw new ValidationError("code","The target release is not effective.");
  const candidates=all<MappingRow>(db,`${select} WHERE m.organization_id=? AND m.source_release_id=? AND m.source_concept_id=? AND m.target_release_id=? AND m.mapping_version=? AND m.status IN ('pending','approved') AND m.active_from<=? AND (m.active_to IS NULL OR m.active_to>?) ORDER BY m.id`,ctx.organizationId,s.releaseId,s.conceptId,target.id,input.mappingVersion,today(),today());
  const approved=candidates.filter(c=>c.status==="approved");
  if(candidates.some(c=>c.status==="pending") || approved.length!==1 || approved[0].equivalence!=="equivalent") {
    const reason=candidates.some(c=>c.status==="pending")?"pending-review":approved.length>1?"ambiguous":approved.length===1?"non-equivalent":"unmapped";
    writeAudit(db,ctx,{action:"terminology.mapping.translate",resourceType:"TerminologyMapping",resourceId:null,outcome:"denied"});
    return {status:"needs-review" as const,reason,source,mappingVersion:input.mappingVersion,candidates:candidates.map(c=>({id:c.id,status:c.status,equivalence:c.equivalence,version:c.version})),queueUrl:"/terminology/mappings",synthetic:true};
  }
  const mapping=approved[0],concept=lookupControlledConcept(db,ctx,mapping.target_system,mapping.target_version,mapping.target_code);
  writeAudit(db,ctx,{action:"terminology.mapping.translate",resourceType:"TerminologyMapping",resourceId:mapping.id,outcome:"success"});
  return {status:"resolved" as const,source,target:concept,mapping:{id:mapping.id,mappingVersion:mapping.mapping_version,version:mapping.version,equivalence:mapping.equivalence,reviewerId:mapping.reviewer_id,reviewedAt:mapping.reviewed_at,sourceUrl:mapping.source_url,manifestSha256:mapping.manifest_sha256},synthetic:true};
}
