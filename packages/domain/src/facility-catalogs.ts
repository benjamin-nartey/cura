import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { assertTerminologyAccess, lookupControlledConcept } from "./code-system-registry";
import { SUPPORTED_UNIT_CODES } from "./unit-conversion";

export const CATALOG_UNIT_PACK_VERSION="curasphere-catalog-units-2026.11";
export const CATALOG_UNIT_CODES=Object.freeze(["1",...SUPPORTED_UNIT_CODES]);
export type CatalogInput={catalogKey:string;scope:"organization"|"facility";expectedRevision:number;baseVersionId?:string|null;concept:{system:string;version:string;code:string};kind:"drug"|"test"|"procedure";orderCategory?:"laboratory"|"imaging"|"nursing"|null;display:string;unitCode:string;status:"active"|"inactive"|"retired";activeFrom:string;activeTo?:string|null;sourceUrl:string;sourceNote:string;idempotencyKey:string};
export type CatalogVersion={id:string;organization_id:string;facility_id:string|null;scope_key:string;catalog_key:string;revision:number;base_version_id:string|null;release_id:string;concept_id:string;kind:CatalogInput["kind"];order_category:"laboratory"|"imaging"|"nursing"|null;display:string;unit_code:string;unit_pack_version:string;status:string;active_from:string;active_to:string|null;source_url:string;source_note:string;manifest_sha256:string;created_by:string;created_at:string;system:string;code_system_version:string;code:string};
export type CatalogResolution={item:CatalogVersion|null;available:boolean;reason:string|null;origin:"organization"|"facility"|null;defaultVersionId:string|null;defaultRevision:number};
export type OrderCatalogSnapshot={entryVersionId:string;catalogKey:string;revision:number;scope:string;baseVersionId:string|null;releaseId:string;system:string;codeSystemVersion:string;code:string;display:string;kind:string;orderCategory:string|null;unitCode:string;unitPackVersion:string;manifestSha256:string};
const select="SELECT v.*,s.uri system,s.version code_system_version,c.code FROM facility_catalog_versions v JOIN terminology_releases r ON r.id=v.release_id JOIN code_systems s ON s.id=r.code_system_id JOIN concepts c ON c.id=v.concept_id";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date=(v:unknown):v is string=>typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
const today=()=>new Date().toISOString().slice(0,10);
function key(v:unknown):asserts v is string {if(typeof v!=="string" || !/^[a-z][a-z0-9-]{1,79}$/.test(v))throw new ValidationError("invalid","Use a catalog key with lowercase letters, digits and hyphens.");}
function head(db:AppDatabase,ctx:SessionContext,catalogKey:string,scope:string){return get<{version_id:string;revision:number}>(db,"SELECT version_id,revision FROM facility_catalog_heads WHERE organization_id=? AND scope_key=? AND catalog_key=?",ctx.organizationId,scope,catalogKey);}
function version(db:AppDatabase,ctx:SessionContext,id:string){const row=get<CatalogVersion>(db,`${select} WHERE v.organization_id=? AND v.id=? AND (v.facility_id IS NULL OR v.facility_id=?)`,ctx.organizationId,id,ctx.facilityId);if(!row)throw new NotFoundError("This catalog version is not available.");return row;}
function resolve(db:AppDatabase,ctx:SessionContext,catalogKey:string):CatalogResolution {
 const global=head(db,ctx,catalogKey,"organization"),local=ctx.facilityId?head(db,ctx,catalogKey,ctx.facilityId):undefined;
 const chosen=local??global;if(!chosen)return {item:null,available:false,reason:"No catalog item is registered.",origin:null,defaultVersionId:null,defaultRevision:0};
 const item=version(db,ctx,chosen.version_id),origin=local?"facility":"organization";
 const result={item,origin,defaultVersionId:global?.version_id??null,defaultRevision:global?.revision??0} as const;
 if(local && item.base_version_id!==global?.version_id)return {...result,available:false,reason:"The facility override pins an older default. Register a reviewed override for the current default."};
 if(local && global){const base=version(db,ctx,global.version_id);if(base.status!=="active" || base.active_from>today() || base.active_to && base.active_to<=today())return {...result,available:false,reason:"The organization default is unavailable; a facility override cannot bypass it."};}
 if(item.status!=="active")return {...result,available:false,reason:`This ${origin} item is ${item.status}; fallback is blocked.`};
 if(item.active_from>today() || item.active_to && item.active_to<=today())return {...result,available:false,reason:"The selected catalog version is outside its effective interval; fallback is blocked."};
 try{lookupControlledConcept(db,ctx,item.system,item.code_system_version,item.code);}catch(error){if(error instanceof ValidationError)return {...result,available:false,reason:"The pinned concept release is not currently usable."};throw error;}
 return {...result,available:true,reason:null};
}
export function resolveFacilityCatalog(db:AppDatabase,ctx:SessionContext,catalogKey:string){assertTerminologyAccess(db,ctx,"terminology.read");key(catalogKey);const result=resolve(db,ctx,catalogKey);writeAudit(db,ctx,{action:"terminology.catalog.resolve",resourceType:"FacilityCatalog",resourceId:result.item?.id??null,outcome:result.available?"success":"denied"});return result;}
export function listFacilityCatalog(db:AppDatabase,ctx:SessionContext){
 assertTerminologyAccess(db,ctx,"terminology.read");const keys=all<{catalog_key:string}>(db,"SELECT DISTINCT catalog_key FROM facility_catalog_heads WHERE organization_id=? AND scope_key IN ('organization',?) ORDER BY catalog_key LIMIT 100",ctx.organizationId,ctx.facilityId);
 const items=keys.map(k=>resolve(db,ctx,k.catalog_key));writeAudit(db,ctx,{action:"terminology.catalog.list",resourceType:"FacilityCatalog",resourceId:null,outcome:"success"});return items;
}
export function readFacilityCatalogVersion(db:AppDatabase,ctx:SessionContext,id:string){
 assertTerminologyAccess(db,ctx,"terminology.read");const item=version(db,ctx,id),current=head(db,ctx,item.catalog_key,item.scope_key);
 const history=all<{id:string;revision:number;status:string;display:string;created_at:string}>(db,"SELECT id,revision,status,display,created_at FROM facility_catalog_versions WHERE organization_id=? AND scope_key=? AND catalog_key=? ORDER BY revision DESC LIMIT 100",ctx.organizationId,item.scope_key,item.catalog_key);
 writeAudit(db,ctx,{action:"terminology.catalog.read",resourceType:"FacilityCatalog",resourceId:id,outcome:"success"});return {...item,current:current?.version_id===id,currentRevision:current?.revision??0,history};
}
export function registerFacilityCatalogVersion(db:AppDatabase,ctx:SessionContext,input:CatalogInput){
 assertTerminologyAccess(db,ctx,"facility.catalog.manage");if(!input)throw new ValidationError();key(input.catalogKey);
 if(!["organization","facility"].includes(input.scope) || !Number.isInteger(input.expectedRevision) || input.expectedRevision<0 || !["drug","test","procedure"].includes(input.kind) || !["active","inactive","retired"].includes(input.status) || typeof input.display!=="string" || input.display.trim().length<2 || input.display.length>200 || typeof input.sourceNote!=="string" || input.sourceNote.trim().length<10 || input.sourceNote.length>1000 || typeof input.idempotencyKey!=="string" || !/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey))throw new ValidationError("invalid","Enter an explicit scope, revision, kind, status and catalog provenance.");
 if(input.scope==="organization")assertTerminologyAccess(db,ctx,"terminology.manage");else if(!ctx.facilityId)throw new ForbiddenError();
 const c=input.concept;if(!c || typeof c!=="object" || Object.keys(c).some(k=>!["system","version","code"].includes(k)) || ![c.system,c.version,c.code].every(v=>typeof v==="string" && v.length>0 && v.length<=300))throw new ValidationError();
 const category=input.orderCategory||null;if(input.kind==="drug"?category!==null:input.kind==="test"?category!=="laboratory":!["imaging","nursing"].includes(category??""))throw new ValidationError("invalid","Choose a department category appropriate to the item kind. Drugs are metadata-only.");
 if(!CATALOG_UNIT_CODES.includes(input.unitCode))throw new ValidationError("code","Choose an exact supported catalog unit.");
 if(!date(input.activeFrom) || input.activeTo!==null && input.activeTo!==undefined && input.activeTo!=="" && (!date(input.activeTo)||input.activeTo<=input.activeFrom))throw new ValidationError("invalid","Enter a valid effective interval.");
 let url:URL;try{url=new URL(input.sourceUrl);}catch{throw new ValidationError();}if(typeof input.sourceUrl!=="string" || input.sourceUrl.length>500 || url.protocol!=="https:" || url.username || url.password || url.search || url.hash)throw new ValidationError("invalid","Use an HTTPS provenance URL without credentials or query tokens.");
 const facility=input.scope==="facility"?ctx.facilityId:null,scope=facility??"organization";
 const value={catalogKey:input.catalogKey,scope,expectedRevision:input.expectedRevision,baseVersionId:input.baseVersionId||null,concept:{system:c.system,version:c.version,code:c.code},kind:input.kind,orderCategory:category,display:input.display.trim(),unitCode:input.unitCode,unitPackVersion:CATALOG_UNIT_PACK_VERSION,status:input.status,activeFrom:input.activeFrom,activeTo:input.activeTo||null,sourceUrl:url.href,sourceNote:input.sourceNote.trim()};
 const requestHash=hash({actor:ctx.userId,...value});
 return transaction(db,()=>{
  const prior=get<{request_hash:string;response_json:string}>(db,"SELECT request_hash,response_json FROM facility_catalog_commands WHERE organization_id=? AND command_key=?",ctx.organizationId,input.idempotencyKey);if(prior){if(prior.request_hash!==requestHash)throw new ConflictError("conflict","This key belongs to a different catalog submission.");return {...JSON.parse(prior.response_json),replayed:true} as {id:string;revision:number;replayed:boolean};}
  const old=head(db,ctx,value.catalogKey,scope);if((old?.revision??0)!==input.expectedRevision)throw new ConflictError("conflict","The catalog changed. Reload and register against the current revision.");
  const concept=lookupControlledConcept(db,ctx,c.system,c.version,c.code),pin=get<{id:string;active_from:string;active_to:string|null}>(db,"SELECT c.id,r.active_from,r.active_to FROM terminology_releases r JOIN terminology_release_concepts p ON p.release_id=r.id JOIN concepts c ON c.id=p.concept_id WHERE r.id=? AND c.code=?",concept.releaseId,c.code)!;
  if(value.activeFrom<pin.active_from || pin.active_to && (!value.activeTo || value.activeTo>pin.active_to))throw new ValidationError("invalid","The catalog interval must stay within the concept release interval.");
  if(old){const before=version(db,ctx,old.version_id);if(before.kind!==value.kind || before.system!==c.system || before.code!==c.code || before.order_category!==category)throw new ConflictError("conflict","A catalog key retains its kind and coded identity. Use a new key for a different concept.");if(before.status==="retired" && value.status!=="retired")throw new ConflictError("conflict","A retired key cannot be reactivated. Register a new key.");}
  if(facility){const base=head(db,ctx,value.catalogKey,"organization");if(!base || base.version_id!==value.baseVersionId)throw new ConflictError("conflict","Select the current organization-default version as the override base.");const b=version(db,ctx,base.version_id);if(b.kind!==value.kind || b.release_id!==concept.releaseId || b.concept_id!==pin.id || b.order_category!==category)throw new ValidationError("code","Overrides must retain the default's coded identity and kind.");}else if(value.baseVersionId)throw new ValidationError();
  const id=`cat_${randomUUID()}`,revision=(old?.revision??0)+1,now=new Date().toISOString();
  run(db,`INSERT INTO facility_catalog_versions(id,organization_id,facility_id,scope_key,catalog_key,revision,base_version_id,release_id,concept_id,kind,order_category,display,unit_code,unit_pack_version,status,active_from,active_to,source_url,source_note,manifest_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,ctx.organizationId,facility,scope,value.catalogKey,revision,value.baseVersionId,concept.releaseId,pin.id,value.kind,category,value.display,value.unitCode,value.unitPackVersion,value.status,value.activeFrom,value.activeTo,value.sourceUrl,value.sourceNote,hash(value),ctx.userId,now);
  if(old){const changed=run(db,"UPDATE facility_catalog_heads SET version_id=?,revision=? WHERE organization_id=? AND scope_key=? AND catalog_key=? AND revision=?",id,revision,ctx.organizationId,scope,value.catalogKey,input.expectedRevision);if(changed.changes!==1)throw new ConflictError("conflict","The catalog changed during registration.");}else run(db,"INSERT INTO facility_catalog_heads VALUES(?,?,?,?,?)",ctx.organizationId,scope,value.catalogKey,id,revision);
  const result={id,revision,replayed:false};run(db,"INSERT INTO facility_catalog_commands VALUES(?,?,?,?,?)",ctx.organizationId,input.idempotencyKey,requestHash,id,JSON.stringify(result));run(db,"INSERT INTO outbox(id,organization_id,event_type,payload_json,created_at) VALUES(?,?,'terminology.catalog.registered.v1',?,?)",randomUUID(),ctx.organizationId,JSON.stringify({contractVersion:1,entryVersionId:id,catalogKey:value.catalogKey,revision,scope,status:value.status}),now);writeAudit(db,ctx,{action:"terminology.catalog.register",resourceType:"FacilityCatalog",resourceId:id,outcome:"success"});return result;
 });
}
export function catalogForOrder(db:AppDatabase,ctx:SessionContext,id:string){
 assertTerminologyAccess(db,ctx,"terminology.read");const item=version(db,ctx,id),current=resolve(db,ctx,item.catalog_key);
 if(!current.available || current.item?.id!==id)throw new ConflictError("conflict",current.reason??"This picker selection is stale. Reload the current catalog version.");
 if(item.kind==="drug" || !item.order_category)throw new ValidationError("code","Drug formulary metadata cannot create a department request or prescription.");
 return {item,snapshot:{entryVersionId:item.id,catalogKey:item.catalog_key,revision:item.revision,scope:item.scope_key,baseVersionId:item.base_version_id,releaseId:item.release_id,system:item.system,codeSystemVersion:item.code_system_version,code:item.code,display:item.display,kind:item.kind,orderCategory:item.order_category,unitCode:item.unit_code,unitPackVersion:item.unit_pack_version,manifestSha256:item.manifest_sha256} satisfies OrderCatalogSnapshot};
}
