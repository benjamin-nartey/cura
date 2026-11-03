import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { all, get, run, type AppDatabase } from "./db";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { AppError, ConflictError, ForbiddenError, ValidationError } from "./errors";
import { assertTerminologyAccess } from "./code-system-registry";
import { writeAudit } from "./audit";
export type CodingKind="condition"|"allergy"|"observation"|"medication-order"|"work-order";
export type CodingDefinition=Record<string,unknown>&{system:string;version:string;code:string;display:string};
export type CodingSelection={system:string;version:string;revision:string};
type Actor={organizationId:string;facilityId:string|null;userId:string;sessionId:string};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function canonical(value:unknown):unknown {if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));return value;}
export function codingDefinition(kind:CodingKind,concept:CodingDefinition,unitSystem:string|null=null):CodingDefinition{return {...concept,kind,unitSystem,bindingPack:"curasphere-synthetic-bindings-2026.10"};}
export function workCodingDefinition(concept:CodingDefinition,catalog?:{entryVersionId:string;revision:number;unitCode:string;unitPackVersion:string}|null){return {...concept,kind:"work-order",bindingPack:catalog?"controlled-facility-catalog":"curasphere-synthetic-bindings-2026.10",unit:catalog?.unitCode??null,unitSystem:catalog?.unitPackVersion??null,catalogVersionId:catalog?.entryVersionId??null,catalogRevision:catalog?.revision??null};}
export function codingRevision(kind:CodingKind,definition:CodingDefinition){return digest({kind,definition:canonical(definition)});}
export function codingCommandHash(base:string,selection:CodingSelection|undefined,actor:Actor){return selection?digest({base,selection,actor:actor.userId,facility:actor.facilityId}):base;}
export function validateCodingSelection(kind:CodingKind,definition:CodingDefinition,selection?:CodingSelection){
 if(!selection)return;
 if(typeof selection.system!=="string"||typeof selection.version!=="string"||selection.system!==definition.system||selection.version!==definition.version)throw new ValidationError("code","The code system or version does not match the selected workflow code.");
 if(typeof selection.revision!=="string"||selection.revision!==codingRevision(kind,definition))throw new ConflictError("conflict","The coding definition changed. Reload the picker before recording.");
}
export function pinClinicalCoding(db:AppDatabase,actor:Actor,kind:CodingKind,id:string,definition:CodingDefinition,selection?:CodingSelection){
 assertLocalHealthcareSandbox();if(!actor.facilityId)throw new ForbiddenError();
 if(get<{account_status:string}>(db,"SELECT account_status FROM users WHERE id=?",actor.userId)?.account_status!=="active")throw new ForbiddenError("forbidden","An active account is required to pin clinical coding.");
 if(get<{value:string}>(db,"SELECT value FROM terminology_registry_controls WHERE name='dependency'")?.value!=="available")throw new AppError("unavailable","Clinical coding bindings are unavailable; no record was saved.");
 validateCodingSelection(kind,definition,selection);const normalized=canonical(definition),revision=codingRevision(kind,definition),definitionId=digest({organization:actor.organizationId,kind,revision}),now=new Date().toISOString();
 if(!get(db,"SELECT id FROM clinical_coding_definitions WHERE id=?",definitionId))run(db,"INSERT INTO clinical_coding_definitions(id,organization_id,kind,system,version,code,display,revision,definition_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",definitionId,actor.organizationId,kind,definition.system,definition.version,definition.code,definition.display,revision,JSON.stringify(normalized),now);
 run(db,"INSERT INTO clinical_coding_pins(organization_id,facility_id,kind,resource_id,definition_id,recorded_by,created_at) VALUES(?,?,?,?,?,?,?)",actor.organizationId,actor.facilityId,kind,id,definitionId,actor.userId,now);
 run(db,"INSERT INTO outbox(id,organization_id,event_type,payload_json,created_at) VALUES(?,?,'terminology.coding.pinned.v1',?,?)",randomUUID(),actor.organizationId,JSON.stringify({contractVersion:1,kind,resourceId:id,definitionId,revision}),now);
}
// Internal accessor: callers must authorize the corresponding source record before calling.
export function codingForAuthorizedSource(db:AppDatabase,organizationId:string,kind:CodingKind,id:string){
 const row=get<{id:string;system:string;version:string;code:string;display:string;revision:string;definition_json:string;created_at:string}>(db,"SELECT d.*,p.created_at FROM clinical_coding_pins p JOIN clinical_coding_definitions d ON d.id=p.definition_id WHERE p.organization_id=? AND p.kind=? AND p.resource_id=?",organizationId,kind,id);return row?{id:row.id,system:row.system,version:row.version,code:row.code,display:row.display,revision:row.revision,definition:JSON.parse(row.definition_json) as CodingDefinition,recordedAt:row.created_at}:null;
}
export function inspectCodingMappings(db:AppDatabase,ctx:SessionContext,definition:{system:string;version:string;code:string}){
 assertTerminologyAccess(db,ctx,"terminology.read");return all<{id:string;status:string;equivalence:string;mapping_version:string;reviewer_id:string|null;target_display:string}>(db,`SELECT m.id,m.status,m.equivalence,m.mapping_version,m.reviewer_id,t.display target_display FROM terminology_mapping_state m JOIN terminology_releases r ON r.id=m.source_release_id JOIN code_systems s ON s.id=r.code_system_id JOIN concepts c ON c.id=m.source_concept_id JOIN concepts t ON t.id=m.target_concept_id WHERE m.organization_id=? AND s.uri=? AND s.version=? AND c.code=? ORDER BY m.created_at DESC LIMIT 100`,ctx.organizationId,definition.system,definition.version,definition.code);
}
const sources=[{kind:"condition",table:"source_conditions"},{kind:"allergy",table:"source_allergies"},{kind:"observation",table:"source_observations"},{kind:"medication-order",table:"source_medication_orders"},{kind:"work-order",table:"work_orders"}] as const;
export function codingConformanceReport(db:AppDatabase,ctx:SessionContext){
 assertTerminologyAccess(db,ctx,"terminology.manage");if(!ctx.facilityId)throw new ForbiddenError();const rows=sources.map(({kind,table})=>{
  const count=get<{total:number;missing:number}>(db,`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN code='' OR code_system='' OR code_system_version='' THEN 1 ELSE 0 END),0) missing FROM ${table} WHERE organization_id=? AND facility_id=?`,ctx.organizationId,ctx.facilityId)!;
  const pinned=get<{n:number}>(db,"SELECT COUNT(*) n FROM clinical_coding_pins WHERE organization_id=? AND facility_id=? AND kind=?",ctx.organizationId,ctx.facilityId,kind)!.n;
  return {kind,total:count.total,missingMetadata:count.missing,pinned,historicalUnpinned:count.total-pinned};
 });writeAudit(db,ctx,{action:"terminology.coding.conformance",resourceType:"ClinicalCoding",resourceId:null,outcome:"success"});return {scope:"active-facility",rows,meaning:"Metadata coverage only; not licensed terminology, clinical validation or formal phase acceptance."};
}
