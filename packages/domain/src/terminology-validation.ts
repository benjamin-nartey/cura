import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { writeAudit } from "./audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertTerminologyAccess, lookupControlledConcept } from "./code-system-registry";
import { convertRestrictedQuantity, type ConversionInput } from "./unit-conversion";

type CodeTuple = { system: string; version: string; code: string };
export type ValueSetInput = { name: string; version: string; members: CodeTuple[]; idempotencyKey: string };
export type MembershipInput = CodeTuple & { valueSetId: string };
export type ControlledValueSet = { id: string; name: string; version: string; manifest_sha256: string; created_at: string; member_count: number };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const select = "SELECT v.*, (SELECT COUNT(*) FROM terminology_value_set_members m WHERE m.value_set_id = v.id) member_count FROM terminology_value_sets v";

export function listControlledValueSets(db: AppDatabase, ctx: SessionContext) {
  assertTerminologyAccess(db,ctx,"terminology.read");
  writeAudit(db,ctx,{action:"terminology.valueset.list",resourceType:"TerminologyValueSet",resourceId:null,outcome:"success"});
  return all<ControlledValueSet>(db,`${select} WHERE v.organization_id = ? ORDER BY v.created_at DESC,v.id LIMIT 100`,ctx.organizationId);
}
export function registerControlledValueSet(db: AppDatabase, ctx: SessionContext, input: ValueSetInput) {
  assertTerminologyAccess(db,ctx,"terminology.manage");
  if (!input || typeof input.name !== "string" || input.name.trim().length < 2 || input.name.length > 120 || typeof input.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.version) || typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey) || !Array.isArray(input.members) || input.members.length < 1 || input.members.length > 100) throw new ValidationError("invalid","Enter a name, explicit version and 1–100 unique registered concept references.");
  const members = input.members.map(m => {
    if (!m || typeof m.system !== "string" || m.system.length > 300 || typeof m.version !== "string" || m.version.length > 100 || typeof m.code !== "string" || m.code.length > 80 || Object.keys(m).some(k=>!["system","version","code"].includes(k))) throw new ValidationError();
    return {system:m.system,version:m.version,code:m.code};
  }).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
  if (new Set(members.map(m=>JSON.stringify(m))).size !== members.length) throw new ValidationError("invalid","Remove duplicate concept references.");
  const manifest = { name:input.name.trim(),version:input.version,members };
  const requestHash = hash({actor:ctx.userId,...manifest});
  return transaction(db,()=>{
    const prior = get<{request_hash:string;value_set_id:string}>(db,"SELECT * FROM terminology_value_set_commands WHERE organization_id = ? AND command_key = ?",ctx.organizationId,input.idempotencyKey);
    if (prior) { if(prior.request_hash!==requestHash) throw new ConflictError("conflict","The submission key belongs to a different value set."); return {id:prior.value_set_id,replayed:true}; }
    if(get(db,"SELECT id FROM terminology_value_sets WHERE organization_id = ? AND name = ? AND version = ?",ctx.organizationId,manifest.name,manifest.version)) throw new ConflictError("conflict","This value-set version already exists. Use a new version for corrections.");
    const pins=members.map(m=>{
      const concept=lookupControlledConcept(db,ctx,m.system,m.version,m.code);
      const pin=get<{concept_id:string}>(db,"SELECT p.concept_id FROM terminology_release_concepts p JOIN concepts c ON c.id = p.concept_id WHERE p.release_id = ? AND c.code = ?",concept.releaseId,m.code)!;
      return {release:concept.releaseId,concept:pin.concept_id};
    });
    const id=`tvs_${randomUUID()}`;const now=new Date().toISOString();
    run(db,"INSERT INTO terminology_value_sets(id,organization_id,name,version,manifest_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?)",id,ctx.organizationId,manifest.name,manifest.version,hash(manifest),ctx.userId,now);
    for(const pin of pins) run(db,"INSERT INTO terminology_value_set_members(value_set_id,release_id,concept_id) VALUES(?,?,?)",id,pin.release,pin.concept);
    run(db,"INSERT INTO terminology_value_set_commands(organization_id,command_key,request_hash,value_set_id) VALUES(?,?,?,?)",ctx.organizationId,input.idempotencyKey,requestHash,id);
    run(db,"INSERT INTO outbox(id,organization_id,event_type,payload_json,created_at) VALUES(?,?,'terminology.valueset.registered.v1',?,?)",randomUUID(),ctx.organizationId,JSON.stringify({contractVersion:1,valueSetId:id,version:manifest.version,manifestSha256:hash(manifest)}),now);
    writeAudit(db,ctx,{action:"terminology.valueset.register",resourceType:"TerminologyValueSet",resourceId:id,outcome:"success"});
    return {id,replayed:false};
  });
}
export function readControlledValueSet(db: AppDatabase, ctx: SessionContext, id: string) {
  assertTerminologyAccess(db,ctx,"terminology.read");
  const set=get<ControlledValueSet>(db,`${select} WHERE v.organization_id = ? AND v.id = ?`,ctx.organizationId,id);
  if(!set) throw new NotFoundError("This value-set version is not available.");
  const members=all<CodeTuple & {display:string;releaseId:string}>(db,"SELECT s.uri system,s.version,c.code,c.display,r.id releaseId FROM terminology_value_set_members m JOIN terminology_releases r ON r.id = m.release_id JOIN code_systems s ON s.id = r.code_system_id JOIN concepts c ON c.id = m.concept_id WHERE m.value_set_id = ? ORDER BY s.uri,s.version,c.code",id);
  writeAudit(db,ctx,{action:"terminology.valueset.read",resourceType:"TerminologyValueSet",resourceId:id,outcome:"success"});
  return {...set,members};
}
export function validateControlledMembership(db: AppDatabase, ctx: SessionContext, input: MembershipInput) {
  assertTerminologyAccess(db,ctx,"terminology.read");
  try {
    if(!input || ![input.valueSetId,input.system,input.version,input.code].every(v=>typeof v==="string" && v.length>0 && v.length<=300)) throw new ValidationError();
    const set=readControlledValueSet(db,ctx,input.valueSetId);
    const concept=lookupControlledConcept(db,ctx,input.system,input.version,input.code);
    if(!set.members.some(m=>m.system===input.system && m.version===input.version && m.code===input.code)) throw new ValidationError("invalid","The code is not a member of this value-set version.");
    writeAudit(db,ctx,{action:"terminology.membership.validate",resourceType:"TerminologyValueSet",resourceId:set.id,outcome:"success"});
    return {valid:true,valueSet:{id:set.id,name:set.name,version:set.version,manifestSha256:set.manifest_sha256},concept};
  } catch(error) {
    writeAudit(db,ctx,{action:"terminology.membership.validate",resourceType:"TerminologyValueSet",resourceId:null,outcome:"denied"});throw error;
  }
}
export function inspectUnitConversion(db: AppDatabase, ctx: SessionContext, input: ConversionInput) {
  assertTerminologyAccess(db,ctx,"terminology.read");
  try {
    const result=convertRestrictedQuantity(input);
    writeAudit(db,ctx,{action:"terminology.units.convert",resourceType:"UnitPack",resourceId:result.packVersion,outcome:"success"});return result;
  } catch(error) {
    writeAudit(db,ctx,{action:"terminology.units.convert",resourceType:"UnitPack",resourceId:null,outcome:"denied"});throw error;
  }
}
