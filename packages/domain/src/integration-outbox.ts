import { createHash,randomUUID } from "node:crypto";
import type { AppDatabase } from "./db";
import { all,get,run } from "./db";
import { sourceFhirId,sourceSystemUri } from "./fhir-source-map";

// Called inside the source command's transaction, after source history/coding pins.
// This small module intentionally does not import the clinical command services.
export function queueIntegrationObservation(db:AppDatabase,sourceId:string,subscriptionId:string|null=null){
 if(!get(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='integration_outbox'"))return;
 const row=get<{id:string;organization_id:string;facility_id:string;patient_id:string;encounter_id:string;code:string;code_system:string;code_system_version:string;value_type:string;value_quantity:number;unit_code:string;unit_system:string;status:string;effective_at:string;version:number}>(db,"SELECT * FROM source_observations WHERE id=?",sourceId);
 if(!row)return;
 const subscriptions=all<{id:string}>(db,"SELECT s.id FROM integration_subscriptions s JOIN integration_connections c ON c.id=s.connection_id WHERE s.organization_id=? AND s.facility_id=? AND s.patient_id=? AND s.status='active' AND c.status='active' AND (? IS NULL OR s.id=?)",row.organization_id,row.facility_id,row.patient_id,subscriptionId,subscriptionId);
 if(!subscriptions.length)return;
 const parts=all<{code:string;display:string;value_quantity:number;unit_code:string}>(db,"SELECT code,display,value_quantity,unit_code FROM source_observation_components WHERE observation_id=? ORDER BY code",sourceId);
 const resource={resourceType:"Observation",id:sourceFhirId(row.organization_id,"Observation",row.id),meta:{versionId:String(row.version)},status:row.status,code:{coding:[{system:sourceSystemUri(row.code_system),version:row.code_system_version,code:row.code}]},subject:{reference:`Patient/${sourceFhirId(row.organization_id,"Patient",row.patient_id)}`},encounter:{reference:`Encounter/${sourceFhirId(row.organization_id,"Encounter",row.encounter_id)}`},effectiveDateTime:row.effective_at,
 ...(row.value_type==="quantity"?{valueQuantity:{value:row.value_quantity,system:sourceSystemUri(row.unit_system),code:row.unit_code,unit:row.unit_code}}:{component:parts.map(part=>({code:{coding:[{system:sourceSystemUri(row.code_system),version:row.code_system_version,code:part.code}]},valueQuantity:{value:part.value_quantity,system:sourceSystemUri(row.unit_system),code:part.unit_code,unit:part.unit_code}}))})};
 const payload=JSON.stringify({contractVersion:1,sourceVersion:row.version,resource}),hash=createHash("sha256").update(payload).digest("hex"),now=Date.now();
 for(const sub of subscriptions)run(db,"INSERT OR IGNORE INTO integration_outbox(id,subscription_id,source_id,source_version,payload,body_hash,status,attempts,due_at,diagnostic,created_at) VALUES(?,?,?,?,?,?,'queued',0,?,'queued',?)",`ido_${randomUUID()}`,sub.id,row.id,row.version,payload,hash,now,now);
}
