import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { authorize, effectivePermissions } from "./authorization";
import { all, get, type AppDatabase } from "./db";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { readMasterPatient } from "./master-records";
import { readVisitEncounter } from "./scheduling";
import { readAllergy, readCondition, readMedicationOrder, readObservation } from "./clinical-source";
import { readOrder } from "./work";
import { mapSourceR4, sourceContext, sourceFingerprint, sourceFhirId, sourceType, unmapSourceR4, SOURCE_MAPPING_VERSION, type SourceFacts, type SourceType } from "./fhir-source-map";

const bindings = {
  Patient:{table:"patients",permission:"patient.read",read:readMasterPatient},
  Encounter:{table:"visit_encounters",permission:"encounter.read",read:readVisitEncounter},
  Condition:{table:"source_conditions",permission:"clinical.condition.read",read:readCondition},
  AllergyIntolerance:{table:"source_allergies",permission:"clinical.allergy.read",read:readAllergy},
  Observation:{table:"source_observations",permission:"clinical.observation.read",read:readObservation},
  ServiceRequest:{table:"work_orders",permission:"work.order.read",read:readOrder},
  MedicationRequest:{table:"source_medication_orders",permission:"clinical.medication-order.read",read:readMedicationOrder},
} as const;

function gate(db:AppDatabase,ctx:SessionContext,type:SourceType) {
  assertLocalHealthcareSandbox();
  const user=get<{account_status:string;organization_id:string}>(db,"SELECT account_status,organization_id FROM users WHERE id=?",ctx.userId);
  if(!ctx.sessionId || !ctx.facilityId || user?.account_status!=="active" || user.organization_id!==ctx.organizationId)throw new ForbiddenError();
  const permission=bindings[type].permission;
  const decision=authorize(db,{principalId:ctx.userId,accountActive:true},permission,
    {type:"FhirSourcePreview",organizationId:ctx.organizationId,facilityId:ctx.facilityId,sensitivity:"clinical"},
    {purpose:ctx.purposeOfUse,assurance:"directory",sessionActive:true,activeFacilityId:ctx.facilityId,correlationId:ctx.sessionId.replace(/[^A-Za-z0-9_-]/g,"").slice(0,80)});
  if(!decision.allow)throw new ForbiddenError();
}
export function assertSourcePreviewAccess(db:AppDatabase,ctx:SessionContext){gate(db,ctx,"Patient");}
function facts(db:AppDatabase,ctx:SessionContext,type:SourceType,id:string):SourceFacts {
  gate(db,ctx,type);
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new ValidationError("invalid","Select a source record.");
  const authorized=bindings[type].read(db,ctx,id);
  // SELECT only after the authoritative bounded context has authorized this exact record.
  const row=get<SourceFacts>(db,`SELECT * FROM ${bindings[type].table} WHERE id=? AND organization_id=?`,id,ctx.organizationId);
  if(!row)throw new NotFoundError();
  const patientId=type==="Patient"?row.id:String(row.patient_id);
  const patient=get<{facility_id:string;organization_id:string}>(db,"SELECT facility_id,organization_id FROM patients WHERE id=?",patientId);
  if(!patient || patient.organization_id!==ctx.organizationId || (patient.facility_id!==ctx.facilityId && !get(db,"SELECT id FROM patient_facility_registrations WHERE patient_id=? AND facility_id=? AND status='active'",patientId,ctx.facilityId)))throw new NotFoundError();
  const result={...row};
  // Historical transport correlations can contain session identifiers; they are not clinical facts.
  delete result.correlation_id;
  if("coding" in authorized)result.coding=authorized.coding;
  if(type==="ServiceRequest" && "catalogSnapshot" in authorized)result.catalogSnapshot=authorized.catalogSnapshot;
  if(type==="Observation" && "components" in authorized)result.components=authorized.components;
  return result;
}
export function sourceReadPermission(type:SourceType){return bindings[type].permission;}
export function readSourceR4ForPatient(db:AppDatabase,ctx:SessionContext,type:SourceType,patientId:string,fhirId:string){
  gate(db,ctx,type);
  if(!/^[a-f0-9]{64}$/.test(fhirId))throw new NotFoundError();
  if(type==="Patient") {if(sourceFhirId(ctx.organizationId,type,patientId)!==fhirId)throw new NotFoundError();return previewSourceR4(db,ctx,type,patientId).resource;}
  const ids=all<{id:string}>(db,`SELECT id FROM ${bindings[type].table} WHERE organization_id=? AND facility_id=? AND patient_id=? LIMIT 5001`,ctx.organizationId,ctx.facilityId,patientId);
  if(ids.length>5000)throw new AppError("unavailable","This local read resolver exceeds its bounded patient context.");
  const match=ids.find(row=>sourceFhirId(ctx.organizationId,type,row.id)===fhirId);if(!match)throw new NotFoundError();
  return previewSourceR4(db,ctx,type,match.id).resource;
}
function audit(db:AppDatabase,ctx:SessionContext,type:SourceType,id:string,action:string,outcome:"success"|"denied") {
  writeAudit(db,ctx,{action,resourceType:type,resourceId:id,outcome});
}
export function previewSourceR4(db:AppDatabase,ctx:SessionContext,resourceType:string,id:string) {
  const type=sourceType(resourceType);
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new ValidationError("invalid","Select a source record.");
  try {const source=facts(db,ctx,type,id),resource=mapSourceR4(type,source);
    audit(db,ctx,type,id,"fhir.source.preview","success");
    return {contractVersion:1,mappingVersion:SOURCE_MAPPING_VERSION,sourceFingerprint:sourceFingerprint(source),resource,mode:"local-synthetic-preview",validation:"Bounded mapping checks; official profile validation is executed separately by the local validator suite."};
  } catch(error) {audit(db,ctx,type,id,"fhir.source.preview","denied");throw error;}
}
export function reverseSourceR4(db:AppDatabase,ctx:SessionContext,resource:unknown) {
  // Bound size before parsing the embedded source envelope or recursively comparing JSON.
  let serialized:string;try{serialized=JSON.stringify(resource);}catch{throw new ValidationError();}
  if(!serialized || serialized.length>100000)throw new ValidationError("invalid","The R4 preview exceeds 100 KB.");
  const {type,facts:baseline}=sourceContext(resource);
  try {
    const current=facts(db,ctx,type,baseline.id);
    if(sourceFingerprint(current)!==sourceFingerprint(baseline))throw new ConflictError("conflict","The source context changed. Reload the preview before comparing.");
    const decoded=unmapSourceR4(resource);
    const changedFields=Object.keys(decoded.facts).filter(key=>sourceFingerprint(decoded.facts[key])!==sourceFingerprint(current[key]));
    audit(db,ctx,type,baseline.id,"fhir.source.reverse-preview","success");
    return {contractVersion:1,mappingVersion:SOURCE_MAPPING_VERSION,type,sourceId:baseline.id,sourceVersion:current.version,
      sourceFingerprint:sourceFingerprint(current),changedFields,roundTripExact:changedFields.length===0,proposedSource:decoded.facts,applied:false,externalDelivery:false};
  }catch(error){audit(db,ctx,type,baseline.id,"fhir.source.reverse-preview","denied");throw error;}
}
export function listSourceR4(db:AppDatabase,ctx:SessionContext,patientId:string) {
  const patient=previewSourceR4(db,ctx,"Patient",patientId);
  const rows:Array<{type:SourceType;id:string;label:string;version:number}>= [{type:"Patient",id:patientId,label:"Patient identity",version:Number((patient.resource.meta as {versionId:string}).versionId)}];
  const permissions=effectivePermissions(db,ctx.userId,ctx.organizationId,ctx.facilityId).permissions;
  for(const [kind,binding] of Object.entries(bindings)) {
    const type=sourceType(kind);if(type==="Patient"||!permissions.includes(binding.permission))continue;
    const candidates=all<{id:string}>(db,`SELECT id FROM ${binding.table} WHERE organization_id=? AND facility_id=? AND patient_id=? ORDER BY id LIMIT 30`,ctx.organizationId,ctx.facilityId,patientId);
    for(const candidate of candidates) {
      try{const row=facts(db,ctx,type,candidate.id);rows.push({type,id:row.id,label:String(row.display??row.status??type),version:row.version});}
      catch(error){if(!(error instanceof AppError) || !["forbidden","notfound"].includes(error.code))throw error;}
    }
  }
  return {contractVersion:1,mappingVersion:SOURCE_MAPPING_VERSION,rows,limitPerType:30};
}
