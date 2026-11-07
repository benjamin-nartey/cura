import {graphSourceLinksChanged,readGraphSourceCatalog} from './evidence-source-lineage';
import {createHash,randomUUID} from "node:crypto";
import type {SessionContext} from "@curasphere/contracts";
import {all,get,run,transaction,type AppDatabase} from "./db";
import {readTwinSourceInventory,type TwinEvidencePointer} from "./twin-evidence";
import {writeAudit} from "./audit";
import {AppError,NotFoundError,ValidationError} from "./errors";

export const GRAPH_CLAIM_TYPES=["source-assertion","hypothesis","care-gap-question","risk-question"] as const;
export type GraphClaimType=typeof GRAPH_CLAIM_TYPES[number];
export type GraphClaimCommand={patient:string;commandKey:string;claim?:string;expectedVersion:number;type:GraphClaimType;text:string;sources:string[];sourceHash:string};
type Header={id:string;organization_id:string;facility_id:string;patient_id:string;owner_id:string;purpose:string;coverage:string;created_at:string};
type Revision={id:string;claim_id:string;version:number;claim_type:GraphClaimType;claim_text:string;evidence_state:'unverified';author_id:string;author_kind:'human';model_name:null;model_version:null;recorded_at:string;source_hash:string;citation_count:number;payload_hash:string};
type Edge={fact_id:string;relationship:'cites';kind:string;record_id:string;clinical_ledger:string|null;work_ledger:string|null;source_version:number;source_sha:string;recorded_at:string};
type Inventory=ReturnType<typeof readTwinSourceInventory>;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bad=()=>new ValidationError('invalid','Use the bounded typed-claim contract. Claims cannot be marked clinically verified.');
const conflict=()=>new AppError('conflict','The claim or source context changed. Refresh before recording a new revision.');
const unavailable=()=>new AppError('unavailable','Evidence claims cannot be verified against current source access and integrity. Restore access or services and refresh.');
const validPatient=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
const validClaim=(id:unknown):id is string=>typeof id==='string'&&/^egc_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
function audited<T>(db:AppDatabase,ctx:SessionContext,patient:unknown,action:string,fn:()=>T):T{
  try{return transaction(db,()=>{if(!validPatient(patient))throw bad();const result=fn();writeAudit(db,ctx,{action,resourceType:'EvidenceClaim',resourceId:patient,outcome:'success'});return result;});}
  catch(error){writeAudit(db,ctx,{action:'evidence.graph.denied',resourceType:'EvidenceClaim',resourceId:validPatient(patient)?patient:null,outcome:error instanceof AppError&&error.code==='conflict'?'conflict':'denied'});throw error instanceof AppError?error:unavailable();}
}
function inventory(db:AppDatabase,ctx:SessionContext,patient:string){
  const value=readTwinSourceInventory(db,ctx,patient);
  if(!ctx.facilityId||ctx.purposeOfUse!=='TREATMENT')throw new NotFoundError();
  return value;
}
function sourceContext(db: AppDatabase, ctx: SessionContext, current: Inventory, patient: string) {
  const documents = all<{id:string; sha256:string}>(
    db,
    'SELECT id, sha256 FROM graph_documents WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=? AND purpose=? AND coverage=? ORDER BY id LIMIT 101',
    ctx.organizationId, ctx.facilityId!, patient, ctx.userId, ctx.purposeOfUse, current.coverage,
  );
  if (documents.length > 100) throw unavailable();
  return digest([ctx.organizationId, ctx.facilityId, patient, ctx.userId, ctx.purposeOfUse, current.coverage, current.sourceHash, documents]);
}
function header(db:AppDatabase,ctx:SessionContext,patient:string,id:string,coverage:string){
  if(!validClaim(id))throw bad();const h=get<Header>(db,'SELECT * FROM graph_claims WHERE id=?',id);
  if(!h||h.organization_id!==ctx.organizationId||h.facility_id!==ctx.facilityId||h.patient_id!==patient||h.owner_id!==ctx.userId||h.purpose!==ctx.purposeOfUse||h.coverage!==coverage)throw new NotFoundError();return h;
}
function pointers(db:AppDatabase,r:Revision):TwinEvidencePointer[]{
  return all<Edge>(db,'SELECT * FROM graph_claim_sources WHERE revision_id=? ORDER BY fact_id',r.id).map(e=>{
    if(e.relationship!=='cites'||(e.clinical_ledger===null)===(e.work_ledger===null))throw unavailable();
    return {id:e.fact_id,kind:e.kind,recordId:e.record_id,ledgerId:e.clinical_ledger??e.work_ledger!,ledgerTable:e.clinical_ledger?'source_versions':'work_versions',version:e.source_version,sha256:e.source_sha,recordedAt:e.recorded_at};
  });
}
function payload(r:Omit<Revision,'payload_hash'>|Revision,sources:TwinEvidencePointer[]){return {id:r.id,claim:r.claim_id,version:r.version,type:r.claim_type,text:r.claim_text,evidenceState:r.evidence_state,author:r.author_id,authorKind:r.author_kind,modelName:r.model_name,modelVersion:r.model_version,recordedAt:r.recorded_at,sourceHash:r.source_hash,citationCount:r.citation_count,sources};}
function sourceCatalog(db: AppDatabase, ctx: SessionContext, patientId: string, inventory: Inventory) {
  let catalog: ReturnType<typeof readGraphSourceCatalog> | undefined;
  return () => (catalog ??= readGraphSourceCatalog(db, {context: ctx, patientId}, inventory)).sources;
}

function revisionView(db:AppDatabase,h:Header,r:Revision,current:Inventory,catalog:ReturnType<typeof sourceCatalog>){
  const citations=pointers(db,r);
  if(r.evidence_state!=='unverified'||r.author_id!==h.owner_id||r.author_kind!=='human'||r.model_name!==null||r.model_version!==null||citations.length!==r.citation_count||digest(payload(r,citations))!==r.payload_hash)throw unavailable();
  // A pointer matches only when all metadata agrees with a current authorized source.
  const citationsMatch = citations.every(p => current.pointers.some(q => q.id === p.id && digest(q) === digest(p)));
  const linkedSourceChanged = graphSourceLinksChanged(db, h.id, r.id, catalog);
  const matched = citationsMatch && !linkedSourceChanged;
  const sourceState = !matched ? 'changed-or-unavailable' : citations.length === 0 ? 'uncited' : 'current';
  return {id:h.id,revisionId:r.id,version:r.version,type:r.claim_type,text:matched?r.claim_text:null,evidenceState:'unverified' as const,sourceState,author:{id:r.author_id,kind:r.author_kind},model:{name:null,version:null},createdAt:h.created_at,recordedAt:r.recorded_at,sources:matched?citations:[],notice:matched?'A citation link is not clinical verification. No clinical recommendation is inferred.':'Dependent text and citations are withheld until current authorized sources are checked and a new revision is recorded.'};
}
function latest(db:AppDatabase,claim:string){const r=get<Revision>(db,'SELECT * FROM graph_claim_revisions WHERE claim_id=? ORDER BY version DESC LIMIT 1',claim);if(!r)throw unavailable();return r;}
export function assertGraphClaimAccess(db:AppDatabase,ctx:SessionContext,patient:string){return audited(db,ctx,patient,'evidence.graph.access',()=>{inventory(db,ctx,patient);return true;});}
export function readGraphClaims(db:AppDatabase,ctx:SessionContext,patient:string,options:{claim?:string;revision?:number;sourceQuery?:string}={}){
  return audited(db,ctx,patient,'evidence.graph.read',()=>{
    if(Object.keys(options).some(k=>!['claim','revision','sourceQuery'].includes(k))||options.revision!==undefined&&(!options.claim||!Number.isSafeInteger(options.revision)||options.revision<1||options.revision>100)||options.sourceQuery!==undefined&&(typeof options.sourceQuery!=='string'||options.sourceQuery.length>80))throw bad();
    const current=inventory(db,ctx,patient),query=(options.sourceQuery??'').trim().toLocaleLowerCase('en');
    const headers=options.claim?[header(db,ctx,patient,options.claim,current.coverage)]:all<Header>(db,'SELECT * FROM graph_claims WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=? AND purpose=? AND coverage=? ORDER BY created_at DESC,id LIMIT 101',ctx.organizationId,ctx.facilityId!,patient,ctx.userId,ctx.purposeOfUse,current.coverage);
    if(headers.length>100)throw unavailable();
    const catalog = sourceCatalog(db, ctx, patient, current);
    const claims=headers.map(h=>{const r=options.revision!==undefined?get<Revision>(db,'SELECT * FROM graph_claim_revisions WHERE claim_id=? AND version=?',h.id,options.revision):latest(db,h.id);if(!r)throw new NotFoundError();return {...revisionView(db,h,r,current,catalog),latestVersion:latest(db,h.id).version};});
    const sources=current.facts.filter(f=>!query||[f.kind,f.recordId,f.snapshot.display,f.snapshot.code].some(v=>typeof v==='string'&&v.toLocaleLowerCase('en').includes(query))).map(({snapshot,...p})=>({...p,label:typeof snapshot.display==='string'?snapshot.display:typeof snapshot.code==='string'?snapshot.code:p.kind}));
    return {contractVersion:1,patientId:patient,ownerId:ctx.userId,sourceHash:sourceContext(db,ctx,current,patient),coverage:JSON.parse(current.coverage) as string[],checkedAt:new Date().toISOString(),claims,sources:sources.slice(0,50),sourceCount:sources.length,sourceQuery:query,types:GRAPH_CLAIM_TYPES,notice:'Unverified derived drafts only. Recorded source statuses remain authoritative. Medication drafts are not active therapy; care gaps and clinical risk are not assessed.'};
  });
}
function command(input:GraphClaimCommand){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['patient','commandKey','claim','expectedVersion','type','text','sources','sourceHash'].includes(k))||!validPatient(input.patient)||typeof input.commandKey!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(input.commandKey)||input.claim!==undefined&&!validClaim(input.claim)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||input.expectedVersion>99||(input.claim===undefined)!==(input.expectedVersion===0)||!GRAPH_CLAIM_TYPES.includes(input.type)||typeof input.text!=='string'||input.text.trim().length<1||input.text.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(input.text)||!Array.isArray(input.sources)||input.sources.length>12||new Set(input.sources).size!==input.sources.length||input.sources.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||typeof input.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceHash))throw bad();
  return {patient:input.patient,commandKey:input.commandKey,claim:input.claim,expectedVersion:input.expectedVersion,type:input.type,text:input.text.trim(),sources:[...input.sources].sort(),sourceHash:input.sourceHash};
}
export function recordGraphClaim(db:AppDatabase,ctx:SessionContext,input:GraphClaimCommand){
  return audited(db,ctx,input?.patient,'evidence.graph.record',()=>{
    const c=command(input),current=inventory(db,ctx,c.patient),requestHash=digest(c);
    const receipt=get<{coverage:string;request_hash:string;claim_id:string;revision_id:string}>(db,'SELECT * FROM graph_claim_commands WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=? AND purpose=? AND command_key=?',ctx.organizationId,ctx.facilityId!,c.patient,ctx.userId,ctx.purposeOfUse,c.commandKey);
    if(receipt){if(receipt.coverage!==current.coverage||receipt.request_hash!==requestHash)throw conflict();const h=header(db,ctx,c.patient,receipt.claim_id,current.coverage),r=get<Revision>(db,'SELECT * FROM graph_claim_revisions WHERE id=? AND claim_id=?',receipt.revision_id,h.id);if(!r)throw unavailable();return {contractVersion:1,patientId:c.patient,sourceHash:sourceContext(db,ctx,current,c.patient),claim:revisionView(db,h,r,current,sourceCatalog(db,ctx,c.patient,current)),replayed:true};}
    if(c.sourceHash!==sourceContext(db,ctx,current,c.patient))throw conflict();
    const sources=c.sources.map(id=>{const p=current.pointers.find(p=>p.id===id);if(!p)throw conflict();return p;});
    let h:Header;
    if(c.claim){h=header(db,ctx,c.patient,c.claim,current.coverage);if(latest(db,h.id).version!==c.expectedVersion)throw conflict();}
    else{const n=get<{n:number}>(db,'SELECT COUNT(*) n FROM graph_claims WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=?',ctx.organizationId,ctx.facilityId!,c.patient,ctx.userId)!.n;if(n>=100)throw new ValidationError('invalid','The local claim bound is reached. Retain evidence and request an approved retention decision.');h={id:`egc_${randomUUID()}`,organization_id:ctx.organizationId,facility_id:ctx.facilityId!,patient_id:c.patient,owner_id:ctx.userId,purpose:ctx.purposeOfUse,coverage:current.coverage,created_at:new Date().toISOString()};run(db,'INSERT INTO graph_claims(id,organization_id,facility_id,patient_id,owner_id,purpose,coverage,created_at) VALUES(?,?,?,?,?,?,?,?)',h.id,h.organization_id,h.facility_id,h.patient_id,h.owner_id,h.purpose,h.coverage,h.created_at);}
    const r:Revision={id:`egr_${randomUUID()}`,claim_id:h.id,version:c.expectedVersion+1,claim_type:c.type,claim_text:c.text,evidence_state:'unverified',author_id:ctx.userId,author_kind:'human',model_name:null,model_version:null,recorded_at:new Date().toISOString(),source_hash:current.sourceHash,citation_count:sources.length,payload_hash:''};r.payload_hash=digest(payload(r,sources));
    run(db,'INSERT INTO graph_claim_revisions(id,claim_id,version,claim_type,claim_text,evidence_state,author_id,author_kind,model_name,model_version,recorded_at,source_hash,citation_count,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',r.id,r.claim_id,r.version,r.claim_type,r.claim_text,r.evidence_state,r.author_id,r.author_kind,null,null,r.recorded_at,r.source_hash,r.citation_count,r.payload_hash);
    for(const p of sources)run(db,'INSERT INTO graph_claim_sources(revision_id,fact_id,relationship,kind,record_id,clinical_ledger,work_ledger,source_version,source_sha,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)',r.id,p.id,'cites',p.kind,p.recordId,p.ledgerTable==='source_versions'?p.ledgerId:null,p.ledgerTable==='work_versions'?p.ledgerId:null,p.version,p.sha256,p.recordedAt);
    run(db,'INSERT INTO graph_claim_commands(organization_id,facility_id,patient_id,owner_id,purpose,coverage,command_key,request_hash,claim_id,revision_id) VALUES(?,?,?,?,?,?,?,?,?,?)',ctx.organizationId,ctx.facilityId!,c.patient,ctx.userId,ctx.purposeOfUse,current.coverage,c.commandKey,requestHash,h.id,r.id);
    run(db,'INSERT INTO outbox(id,organization_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?)',randomUUID(),ctx.organizationId,'evidence.graph.revised',JSON.stringify({contractVersion:1,organizationId:ctx.organizationId,facilityId:ctx.facilityId,patientId:c.patient,claimId:h.id,revisionId:r.id,version:r.version,evidenceState:'unverified'}),r.recorded_at);
    return {contractVersion:1,patientId:c.patient,sourceHash:sourceContext(db,ctx,current,c.patient),claim:revisionView(db,h,r,current,sourceCatalog(db,ctx,c.patient,current)),replayed:false};
  });
}
