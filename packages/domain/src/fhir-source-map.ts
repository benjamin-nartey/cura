import { createHash } from "node:crypto";
import { ValidationError } from "./errors";

export const SOURCE_MAPPING_VERSION = "1.0.1";
export const SOURCE_PROFILE_ROOT = "https://curasphere.local/fhir/StructureDefinition/";
export const SOURCE_CONTEXT_URL = `${SOURCE_PROFILE_ROOT}source-context`;
export const SOURCE_TYPES = ["Patient", "Encounter", "Condition", "AllergyIntolerance", "Observation", "ServiceRequest", "MedicationRequest"] as const;
export type SourceType = typeof SOURCE_TYPES[number];
export type SourceFacts = Record<string, unknown> & { id: string; organization_id: string; version: number };
type Obj = Record<string, unknown>;
export function assertSourceJson(value:unknown) {
  const pending:Array<{value:unknown;depth:number}>=[{value,depth:0}];let count=0;
  while(pending.length){const item=pending.pop()!;if(++count>5000 || item.depth>20)bad("JSON complexity limit");
    if(item.value && typeof item.value==="object")for(const [key,child] of Object.entries(item.value)){
      if(["__proto__","constructor","prototype"].includes(key))bad("JSON property");pending.push({value:child,depth:item.depth+1});
    }
  }
}
function bad(path: string): never { throw new ValidationError("invalid", `Unsupported or inconsistent R4 source mapping at ${path}.`); }
function object(value: unknown, path: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad(path);
  return value as Obj;
}
function string(value: unknown, path: string): string { if (typeof value !== "string" || !value.length) bad(path); return value; }
function number(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isFinite(value)) bad(path); return value; }
function one(value: unknown, path: string): Obj { if (!Array.isArray(value) || value.length !== 1) bad(path); return object(value[0], path); }
export function sourceCanonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(sourceCanonical).join(",")}]`;
  const row = object(value, "JSON");
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${sourceCanonical(row[key])}`).join(",")}}`;
}
export const sourceFingerprint = (value: unknown) => createHash("sha256").update(sourceCanonical(value)).digest("hex");
export const sourceFhirId = (organization: string, type: SourceType, id: string) => sourceFingerprint([organization,type,id]);
export function sourceType(value: unknown): SourceType { if (!SOURCE_TYPES.includes(value as SourceType)) bad("resourceType"); return value as SourceType; }
function uri(value: unknown): string {
  const text=string(value,"coding.system");
  return /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `urn:curasphere:source-system:${encodeURIComponent(text)}`;
}
function coding(f: Obj) { return { coding: [{ system: uri(f.code_system), version: string(f.code_system_version,"coding.version"), code: string(f.code,"coding.code"), display: string(f.display,"coding.display") }] }; }
function state(value: unknown, allowed: string[], path: string) { const text=string(value,path); if(!allowed.includes(text))bad(path); return text; }
function codedState(system: string, code: string) { return { coding: [{system:`http://terminology.hl7.org/CodeSystem/${system}`,code}] }; }
function quantity(value: unknown, unit: unknown, system: unknown) { return { value: number(value,"quantity.value"), unit:string(unit,"quantity.unit"), system:uri(system), code:string(unit,"quantity.code") }; }
function date(value:unknown,path:string) { const text=string(value,path);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(text))||new Date(`${text}T00:00:00Z`).toISOString().slice(0,10)!==text)bad(path);return text; }
function instant(value:unknown,path:string){const text=string(value,path);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(text)||Number.isNaN(Date.parse(text)))bad(path);date(text.slice(0,10),path);return text;}
function reference(f: SourceFacts, type: SourceType, id: unknown) { return {reference:`${type}/${sourceFhirId(f.organization_id,type,string(id,"reference"))}`}; }

/** The context extension is source-only provenance, never an instruction to execute an order. */
export function mapSourceR4(type: SourceType, facts: SourceFacts, context: SourceFacts = facts): Obj {
  string(facts.id,"source.id"); string(facts.organization_id,"source.organization");
  if (!Number.isSafeInteger(facts.version) || facts.version < 1) bad("source.version");
  const result: Obj = {resourceType:type,id:sourceFhirId(facts.organization_id,type,facts.id),
    meta:{versionId:String(facts.version),profile:[`${SOURCE_PROFILE_ROOT}source-${type}|1.0.0`]},
    extension:[{url:SOURCE_CONTEXT_URL,valueString:sourceCanonical({mappingVersion:SOURCE_MAPPING_VERSION,type,facts:context})}]};
  if (type === "Patient") {
    const registration=state(facts.registration_status,["active","merged","inactive"],"Patient.registration_status");
    result.active=registration==="active";
    if(registration==="merged")result.link=[{other:reference(facts,"Patient",facts.merged_into_id),type:"replaced-by"}];
    result.identifier=[{system:`urn:curasphere:mrn:${encodeURIComponent(facts.organization_id)}`,value:string(facts.mrn,"Patient.identifier")}];
    result.name=[{use:"official",family:string(facts.family_name,"Patient.name.family"),given:[string(facts.given_name,"Patient.name.given")]}];
    result.birthDate=date(facts.birth_date,"Patient.birthDate");
    return result; // Recorded sex is retained in context, not guessed as administrative gender.
  }
  const patient=reference(facts,"Patient",facts.patient_id);
  if(type === "Encounter") {
    const status=state(facts.status,["in-progress","completed","cancelled","reopened"],"Encounter.status");
    result.status=status==="completed"?"finished":status==="cancelled"?"cancelled":"in-progress";
    result.class={system:"http://terminology.hl7.org/CodeSystem/v3-ActCode",code:"AMB"};
    result.subject=patient;
    if(facts.started_at || facts.ended_at)result.period={...(facts.started_at?{start:instant(facts.started_at,"Encounter.period.start")}:{}),...(facts.ended_at?{end:instant(facts.ended_at,"Encounter.period.end")}:{} )};
    return result;
  }
  result[type === "AllergyIntolerance"?"patient":"subject"]=patient;
  result.encounter=reference(facts,"Encounter",facts.encounter_id);
  if(type === "Condition") {
    result.code=coding(facts);
    const clinical=state(facts.clinical_status,["active","resolved","historical"],"Condition.clinicalStatus");
    if(facts.verification_status!=="entered-in-error")result.clinicalStatus=codedState("condition-clinical",clinical==="historical"?"inactive":clinical);
    result.verificationStatus=codedState("condition-ver-status",state(facts.verification_status,["unconfirmed","confirmed","entered-in-error"],"Condition.verificationStatus"));
    result.recordedDate=instant(facts.recorded_at,"Condition.recordedDate");
    if(facts.onset_date)result.onsetDateTime=date(facts.onset_date,"Condition.onsetDateTime");
    // R4 con-5 forbids clinicalStatus on entered-in-error; con-4 then forbids abatement.
    // Preserve the invalidated record's original resolution date only in source provenance.
    if(facts.resolution_date && facts.verification_status!=="entered-in-error"){
      if(clinical!=="resolved" && clinical!=="historical")bad("Condition.abatement requires resolved or historical source state");
      result.abatementDateTime=date(facts.resolution_date,"Condition.abatementDateTime");
    }
  } else if(type === "AllergyIntolerance") {
    result.code=coding(facts);result.recordedDate=instant(facts.recorded_at,"Allergy.recordedDate");
    if(facts.verification_status!=="entered-in-error")result.clinicalStatus=codedState("allergyintolerance-clinical",state(facts.clinical_status,["active","inactive"],"Allergy.clinicalStatus"));
    result.verificationStatus=codedState("allergyintolerance-verification",state(facts.verification_status,["unconfirmed","confirmed","refuted","entered-in-error"],"Allergy.verificationStatus"));
    if(facts.criticality)result.criticality=facts.criticality;
  } else if(type === "Observation") {
    result.code=coding(facts);result.status=state(facts.status,["preliminary","final","corrected","entered-in-error"],"Observation.status");
    result.effectiveDateTime=instant(facts.effective_at,"Observation.effectiveDateTime");result.issued=instant(facts.recorded_at,"Observation.issued");
    if(facts.value_type==="quantity") result.valueQuantity=quantity(facts.value_quantity,facts.unit_code,facts.unit_system);
    else if(facts.value_type==="component" && Array.isArray(facts.components) && facts.components.length) {
      result.component=facts.components.map(value=>{const part=object(value,"Observation.component");return {code:coding({...part,code_system:facts.code_system,code_system_version:facts.code_system_version}),valueQuantity:quantity(part.value_quantity,part.unit_code,facts.unit_system)};});
    } else bad("Observation.value[x]");
  } else if(type === "ServiceRequest") {
    if(facts.fulfillment!=="not-transmitted")bad("ServiceRequest.fulfillment");
    const status=state(facts.status,["submitted","routed","cancelled"],"ServiceRequest.status");
    result.status=status==="cancelled"?"revoked":"draft";result.intent="proposal";result.code=coding(facts);
    result.priority=state(facts.priority,["routine","urgent"],"ServiceRequest.priority");
    result.occurrenceDateTime=date(facts.due_on,"ServiceRequest.occurrenceDateTime");result.authoredOn=instant(facts.recorded_at,"ServiceRequest.authoredOn");
  } else {
    if(facts.intent!=="proposal" || facts.executable!==0 || facts.transmission!=="disabled")bad("MedicationRequest.execution");
    result.status=state(facts.status,["draft","cancelled"],"MedicationRequest.status");result.intent="proposal";
    result.medicationCodeableConcept=coding(facts);result.authoredOn=instant(facts.recorded_at,"MedicationRequest.authoredOn");
    result.dosageInstruction=[{text:string(facts.frequency,"MedicationRequest.frequency"),route:{text:string(facts.route,"MedicationRequest.route")},doseAndRate:[{doseQuantity:quantity(facts.dose_quantity,facts.dose_unit,"urn:curasphere:synthetic:dose-unit")}]}];
  }
  return result;
}

export function sourceContext(resource: unknown) {
  assertSourceJson(resource);
  const r=object(resource,"resource"),type=sourceType(r.resourceType),ext=one(r.extension,"extension");
  if(ext.url!==SOURCE_CONTEXT_URL)bad("extension.url");
  let parsed:unknown;try{parsed=JSON.parse(string(ext.valueString,"extension.valueString"));}catch{bad("extension.valueString");}
  const context=object(parsed,"source-context");
  assertSourceJson(context);
  if(context.mappingVersion!==SOURCE_MAPPING_VERSION || context.type!==type || Object.keys(context).sort().join(",")!=="facts,mappingVersion,type")bad("mappingVersion");
  const facts=object(context.facts,"facts") as SourceFacts;
  string(facts.id,"facts.id");string(facts.organization_id,"facts.organization_id");
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(facts.id)||!/^[A-Za-z0-9_-]{1,80}$/.test(facts.organization_id))bad("source identity");
  return {type,facts};
}

/** Exact profile inverse. Unknown fields fail the re-projection check rather than disappearing. */
export function unmapSourceR4(resource: unknown): {type:SourceType;facts:SourceFacts;baseline:SourceFacts} {
  const r=object(resource,"resource"),{type,facts:baseline}=sourceContext(r),facts=structuredClone(baseline);
  const tuple=(value:unknown)=>{const c=one(object(value,"code").coding,"code.coding");
    if(c.system!==uri(baseline.code_system) || c.version!==baseline.code_system_version || c.code!==baseline.code || c.display!==baseline.display)bad("immutable coding tuple");
    facts.code=string(c.code,"coding.code");facts.display=string(c.display,"coding.display");};
  const status=(value:unknown)=>string(one(object(value,"status").coding,"status.coding").code,"status.code");
  if(type==="Patient") {
    facts.mrn=string(one(r.identifier,"Patient.identifier").value,"Patient.identifier.value");
    const name=one(r.name,"Patient.name");facts.family_name=string(name.family,"Patient.name.family");
    if(!Array.isArray(name.given)||name.given.length!==1)bad("Patient.name.given");facts.given_name=string(name.given[0],"Patient.name.given");facts.birth_date=string(r.birthDate,"Patient.birthDate");
  } else if(type==="Encounter") {
    const original=mapSourceR4(type,baseline).status;
    if(r.status!==original)bad("Encounter.status transition");
    const period=r.period===undefined?{}:object(r.period,"Encounter.period");facts.started_at=period.start??null;facts.ended_at=period.end??null;
  } else if(type==="Condition") {
    tuple(r.code);facts.verification_status=status(r.verificationStatus);
    const clinical=r.clinicalStatus===undefined?baseline.clinical_status:status(r.clinicalStatus);
    facts.clinical_status=clinical==="inactive"?"historical":clinical;
    facts.recorded_at=string(r.recordedDate,"Condition.recordedDate");facts.onset_date=r.onsetDateTime??null;facts.resolution_date=facts.verification_status==="entered-in-error"?baseline.resolution_date:r.abatementDateTime??null;
  } else if(type==="AllergyIntolerance") {
    tuple(r.code);facts.verification_status=status(r.verificationStatus);
    facts.clinical_status=r.clinicalStatus===undefined?baseline.clinical_status:status(r.clinicalStatus);
    facts.criticality=r.criticality??null;facts.recorded_at=string(r.recordedDate,"Allergy.recordedDate");
  } else if(type==="Observation") {
    tuple(r.code);facts.status=string(r.status,"Observation.status");facts.effective_at=string(r.effectiveDateTime,"Observation.effectiveDateTime");facts.recorded_at=string(r.issued,"Observation.issued");
    if(baseline.value_type==="quantity") {const q=object(r.valueQuantity,"Observation.valueQuantity");if(q.code!==baseline.unit_code)bad("immutable quantity unit");facts.value_quantity=number(q.value,"Observation.valueQuantity.value");facts.unit_code=string(q.code,"Observation.valueQuantity.code");}
    else {if(!Array.isArray(r.component)||!Array.isArray(baseline.components)||r.component.length!==baseline.components.length)bad("Observation.component");
      facts.components=r.component.map((value,i)=>{const part=object(value,"component"),old=object((baseline.components as unknown[])[i],"component.context"),c=one(object(part.code,"component.code").coding,"component.coding"),q=object(part.valueQuantity,"component.quantity");if(c.code!==old.code || c.display!==old.display || q.code!==old.unit_code)bad("immutable component binding");return {...old,code:string(c.code,"component.code"),display:string(c.display,"component.display"),value_quantity:number(q.value,"component.value"),unit_code:string(q.code,"component.unit")};});}
  } else if(type==="ServiceRequest") {
    tuple(r.code);if(r.status!==mapSourceR4(type,baseline).status)bad("ServiceRequest.status transition");
    facts.priority=string(r.priority,"ServiceRequest.priority");facts.due_on=string(r.occurrenceDateTime,"ServiceRequest.occurrenceDateTime");facts.recorded_at=string(r.authoredOn,"ServiceRequest.authoredOn");
  } else {
    tuple(r.medicationCodeableConcept);if(r.status!==baseline.status)bad("MedicationRequest.status transition");
    const dose=one(r.dosageInstruction,"MedicationRequest.dosage"),q=object(one(dose.doseAndRate,"doseAndRate").doseQuantity,"doseQuantity");
    if(q.code!==baseline.dose_unit || object(dose.route,"route").text!==baseline.route || dose.text!==baseline.frequency)bad("immutable medication binding");
    facts.dose_quantity=number(q.value,"doseQuantity.value");facts.dose_unit=string(q.code,"doseQuantity.code");facts.route=string(object(dose.route,"route").text,"route.text");facts.frequency=string(dose.text,"dosage.text");facts.recorded_at=string(r.authoredOn,"MedicationRequest.authoredOn");
  }
  if(sourceCanonical(mapSourceR4(type,facts,baseline))!==sourceCanonical(r))bad("unmapped fields, references, profile or immutable workflow state");
  return {type,facts,baseline};
}
