import {assessEvidence} from './evidence-sufficiency';
import {randomUUID} from 'node:crypto';
import type {SessionContext} from '@curasphere/contracts';
import {all,get,run,transaction,type AppDatabase} from './db';
import {readGraphClaims} from './evidence-graph';
import {readTwinSourceInventory} from './twin-evidence';
import {previewSourceR4} from './fhir-source';
import {writeAudit} from './audit';
import {AppError,NotFoundError,ValidationError} from './errors';

import {
 GRAPH_RELATIONSHIPS, documentPayload, edgePayload, graphSourceHash as hash,
 readGraphSourceCatalog, resolveGraphSource,
 type GraphSourceDocument, type GraphSourceEdge as Edge, type GraphRelationship, type GraphSourceFormat,
} from './evidence-source-lineage';
export {GRAPH_RELATIONSHIPS, type GraphRelationship, type GraphSourceFormat} from './evidence-source-lineage';
type Base={patient:string;commandKey:string;sourceHash:string};
export type GraphIngestionCommand=Base&({action:'document';title:string;content:string;effectiveAt:string|null}|{action:'link';claim:string;expectedVersion:number;format:GraphSourceFormat;source:string;relationship:GraphRelationship});
const invalid=()=>new ValidationError('invalid','Use the bounded source ingestion contract.');
const conflict=()=>new AppError('conflict','The claim or source context changed. Refresh before linking evidence.');
const unavailable=()=>new AppError('unavailable','Exact source integrity or access is unavailable. Refresh after restoring services.');
const text=(s:unknown,n:number):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=n&&!/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(s);
function audit<T>(db:AppDatabase,ctx:SessionContext,patient:string,action:string,fn:()=>T):T{
 try{return transaction(db,()=>{const result=fn();writeAudit(db,ctx,{action:'evidence.ingestion.'+action,resourceType:'EvidenceSource',resourceId:patient,outcome:'success'});return result;});}
 catch(e){writeAudit(db,ctx,{action:'evidence.ingestion.denied',resourceType:'EvidenceSource',resourceId:null,outcome:'denied'});throw e instanceof AppError?e:unavailable();}
}
function scope(db:AppDatabase,ctx:SessionContext,patient:string) {
 const graph=readGraphClaims(db,ctx,patient);
 const inventory=readTwinSourceInventory(db,ctx,patient);
 const {documents,sources}=readGraphSourceCatalog(db,{context:ctx,patientId:patient},inventory);
 return {graph,inventory,documents,sources,sourceHash:hash([graph.sourceHash,documents.map(d=>[d.id,d.sha256])])};
}
type Scope=ReturnType<typeof scope>;
function edges(db:AppDatabase,s:Scope){
 const result:ReturnType<typeof edgeView>[]=[];
 for(const claim of s.graph.claims){
  const rows=all<Edge>(db,'SELECT * FROM graph_source_edges WHERE claim_id=? ORDER BY recorded_at,id LIMIT 101',claim.id);if(rows.length>100)throw unavailable();
  for(const e of rows)result.push(edgeView(e,s));
 }
 return result;
}
function edgeView(e:Edge,s:Scope){
 const claim=s.graph.claims.find(c=>c.id===e.claim_id);
 const current=resolveGraphSource(e,s.sources);
 const available=!!claim&&claim.revisionId===e.revision_id&&claim.sourceState!=='changed-or-unavailable'&&!!current;
 return {id:e.id,claimId:e.claim_id,claimRevisionId:e.revision_id,relationship:e.relationship,recordedAt:e.recorded_at,state:available?'current' as const:'changed-or-unavailable' as const,source:available?current:null,evidenceState:'unverified' as const};
}
export function readGraphSources(db:AppDatabase,ctx:SessionContext,patient:string,edge?:string){return audit(db,ctx,patient,'read',()=>{
 const s=scope(db,ctx,patient),links=edges(db,s);
 if(edge!==undefined){if(!/^egs_[a-f0-9-]{36}$/.test(edge))throw invalid();const link=links.find(e=>e.id===edge);if(!link?.source)throw new NotFoundError();const p=link.source;
  let exact:unknown;
  if(p.format==='local-document'){const d=s.documents.find(d=>d.id===p.id);if(!d)throw unavailable();exact={...documentPayload(d),sha256:d.sha256,synthetic:true};}
  else {const fact=s.inventory.facts.find(f=>f.id===p.id);if(!fact)throw unavailable();
   if(p.format==='timeline')exact=fact.snapshot;
   else {const type=({'condition':'Condition','allergy':'AllergyIntolerance','observation':'Observation','medication-order':'MedicationRequest','work:order':'ServiceRequest'} as Record<string,string>)[fact.kind];if(!type)throw unavailable();exact=previewSourceR4(db,ctx,type,p.recordId);}
  }
  const revision = s.graph.claims.find(claim => claim.revisionId === link.claimRevisionId);
  if (!revision?.text) throw new NotFoundError();
  const claim = {type:revision.type, version:revision.version, text:revision.text, evidenceState:revision.evidenceState};
  return {contractVersion:1,patientId:patient,ownerId:ctx.userId,sourceHash:s.sourceHash,checkedAt:new Date().toISOString(),sources:[],claims:[],edges:[],inspection:{edge:link,exact,claim},relationships:GRAPH_RELATIONSHIPS};
 }
 return {contractVersion:1,patientId:patient,ownerId:ctx.userId,sourceHash:s.sourceHash,checkedAt:new Date().toISOString(),sources:s.sources,claims:s.graph.claims.map(c=>({id:c.id,version:c.version,revisionId:c.revisionId,type:c.type,sourceState:c.sourceState,assessment:assessEvidence(c.type,c.sourceState==='changed-or-unavailable',links.filter(link=>link.claimRevisionId===c.revisionId))})),edges:links,inspection:null,relationships:GRAPH_RELATIONSHIPS};
});}
function command(input:GraphIngestionCommand){
 if(!input||typeof input!=='object'||Array.isArray(input))throw invalid();const allowed=input.action==='document'?['patient','commandKey','sourceHash','action','title','content','effectiveAt']:['patient','commandKey','sourceHash','action','claim','expectedVersion','format','source','relationship'];
 if(Object.keys(input).some(k=>!allowed.includes(k))||typeof input.patient!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(input.patient)||typeof input.commandKey!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(input.commandKey)||typeof input.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceHash))throw invalid();
 const base={patient:input.patient,commandKey:input.commandKey,sourceHash:input.sourceHash,action:input.action};
 if(input.action==='document'){
  if(!text(input.title,160)||!text(input.content,8000)||input.effectiveAt!==null&&(typeof input.effectiveAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.effectiveAt)||!Number.isFinite(Date.parse(input.effectiveAt))||new Date(input.effectiveAt).toISOString().slice(0,19)!==input.effectiveAt.slice(0,19)))throw invalid();
  return {...base,action:'document' as const,title:input.title.trim(),content:input.content.trim(),effectiveAt:input.effectiveAt};
 }
 if(input.action!=='link'||typeof input.claim!=='string'||!/^egc_[a-f0-9-]{36}$/.test(input.claim)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1||input.expectedVersion>100||!['timeline','fhir-r4','local-document'].includes(input.format)||typeof input.source!=='string'||!(/^[a-f0-9]{64}$/.test(input.source)||/^egd_[a-f0-9-]{36}$/.test(input.source))||!GRAPH_RELATIONSHIPS.includes(input.relationship))throw invalid();
 return {...base,action:'link' as const,claim:input.claim,expectedVersion:input.expectedVersion,format:input.format,source:input.source,relationship:input.relationship};
}
export function ingestGraphSource(db:AppDatabase,ctx:SessionContext,input:GraphIngestionCommand){return audit(db,ctx,input?.patient,'record',()=>{
 const c=command(input),s=scope(db,ctx,c.patient),requestHash=hash(c),prior=get<{request_hash:string;coverage:string;result_id:string}>(db,'SELECT * FROM graph_ingestion_commands WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=? AND purpose=? AND command_key=?',ctx.organizationId,ctx.facilityId!,c.patient,ctx.userId,ctx.purposeOfUse,c.commandKey);
 if(prior){if(prior.request_hash!==requestHash||prior.coverage!==s.inventory.coverage)throw conflict();const result=c.action==='link'?edges(db,s).find(e=>e.id===prior.result_id):s.sources.find(p=>p.id===prior.result_id&&p.format==='local-document');if(!result)throw new NotFoundError();return {contractVersion:1,patientId:c.patient,result,replayed:true};}
 if(c.sourceHash!==s.sourceHash)throw conflict();let id:string;
 if(c.action==='document'){
  const count=get<{n:number}>(db,'SELECT COUNT(*) n FROM graph_documents WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=?',ctx.organizationId,ctx.facilityId!,c.patient,ctx.userId)!.n;if(count>=100)throw invalid();
  const d:GraphSourceDocument={id:`egd_${randomUUID()}`,organization_id:ctx.organizationId,facility_id:ctx.facilityId!,patient_id:c.patient,owner_id:ctx.userId,purpose:ctx.purposeOfUse,coverage:s.inventory.coverage,title:c.title,content:c.content,effective_at:c.effectiveAt,recorded_at:new Date().toISOString(),version:1,sha256:''};d.sha256=hash(documentPayload(d));
  run(db,'INSERT INTO graph_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',d.id,d.organization_id,d.facility_id,d.patient_id,d.owner_id,d.purpose,d.coverage,d.title,d.content,d.effective_at,d.recorded_at,d.version,d.sha256);id=d.id;
 }else{
  const claim=s.graph.claims.find(v=>v.id===c.claim);if(!claim)throw new NotFoundError();if(claim.version!==c.expectedVersion||claim.sourceState==='changed-or-unavailable')throw conflict();
  const source=s.sources.find(p=>p.id===c.source&&p.format===c.format);if(!source)throw new NotFoundError();
  if(get(db,'SELECT id FROM graph_source_edges WHERE revision_id=? AND source_format=? AND source_id=?',claim.revisionId,c.format,c.source)||get<{n:number}>(db,'SELECT COUNT(*) n FROM graph_source_edges WHERE claim_id=?',claim.id)!.n>=100)throw conflict();
  const e:Edge={id:`egs_${randomUUID()}`,claim_id:claim.id,revision_id:claim.revisionId,relationship:c.relationship,source_format:c.format,source_id:c.source,source_json:JSON.stringify(source),recorded_at:new Date().toISOString(),sha256:''};e.sha256=hash(edgePayload(e));
  run(db,'INSERT INTO graph_source_edges VALUES(?,?,?,?,?,?,?,?,?)',e.id,e.claim_id,e.revision_id,e.relationship,e.source_format,e.source_id,e.source_json,e.recorded_at,e.sha256);id=e.id;
 }
 run(db,'INSERT INTO graph_ingestion_commands VALUES(?,?,?,?,?,?,?,?,?)',ctx.organizationId,ctx.facilityId!,c.patient,ctx.userId,ctx.purposeOfUse,c.commandKey,s.inventory.coverage,requestHash,id);
 run(db,'INSERT INTO outbox(id,organization_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)',randomUUID(),ctx.organizationId,'evidence.source.recorded',JSON.stringify({contractVersion:1,patientId:c.patient,ownerId:ctx.userId,action:c.action,resultId:id,evidenceState:'unverified'}),new Date().toISOString());
 return {contractVersion:1,patientId:c.patient,result:{id},replayed:false};
});}
