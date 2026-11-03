import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { seed } from "../src/seed.ts";
import { seedDemoTenants, DEMO_GH, DEMO_EU } from "../src/tenancy.ts";
import { openSession, readSession } from "../src/session.ts";
import { requestAppointment, confirmAppointment, arriveAppointment, startVisitEncounter } from "../src/scheduling.ts";
import { recordCondition, recordAllergy, recordObservation, recordMedicationDraft } from "../src/clinical-source.ts";
import { submitOrder } from "../src/work.ts";
import type { SourceType } from "../src/fhir-source-map.ts";

export function sourceScenario(file=":memory:") {
  process.env.CURASPHERE_ENV="local";process.env.CURASPHERE_DEV_DIRECTORY="local-test";process.env.CURASPHERE_DATA_CLASS="synthetic";process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="true";
  const db=createDatabase(file);seed(db);seedDemoTenants(db);
  const login=(id:string)=>{const ctx=readSession(db,openSession(db,id).sessionId);if(!ctx)throw new Error("Missing fixture session");return ctx;};
  const doctor=login(DEMO_GH.users.doctor),nurse=login(DEMO_GH.users.nurse),foreign=login(DEMO_EU.users.doctor),admin=login(DEMO_GH.users.admin);
  const appointment=requestAppointment(db,nurse,{patientId:"pat_gh_kofi_a",practitionerId:"pr_gh_kwame",category:"follow-up",startsAt:"2026-10-21T09:00:00.000Z",endsAt:"2026-10-21T09:20:00.000Z",resourceId:"room_fac_gh_accra",idempotencyKey:"fhir-source-visit-01"});
  confirmAppointment(db,nurse,appointment.id,1);arriveAppointment(db,nurse,appointment.id,2);
  const encounter=startVisitEncounter(db,doctor,appointment.id,3,"fhir-source-start-01");
  const common={patientId:"pat_gh_kofi_a",encounterId:encounter.id,practitionerId:"pr_gh_kwame"};
  const condition=recordCondition(db,doctor,{...common,code:"syn-follow-up",clinicalStatus:"active",verificationStatus:"unconfirmed",idempotencyKey:"fhir-source-condition-01"});
  const allergy=recordAllergy(db,doctor,{...common,code:"syn-unknown",verificationStatus:"unconfirmed",idempotencyKey:"fhir-source-allergy-01"});
  const observation=recordObservation(db,doctor,{...common,code:"syn-temp",valueQuantity:37.1,unit:"Cel",status:"final",effectiveAt:"2026-10-21T09:05:00.000Z",idempotencyKey:"fhir-source-quantity-01"});
  const pressure=recordObservation(db,doctor,{...common,code:"syn-bp",components:[{code:"syn-sbp",value:120},{code:"syn-dbp",value:80}],status:"preliminary",effectiveAt:"2026-10-21T09:06:00.000Z",idempotencyKey:"fhir-source-component-01"});
  const medication=recordMedicationDraft(db,doctor,{...common,code:"syn-paracetamol",dose:250,idempotencyKey:"fhir-source-medication-01"});
  const order=submitOrder(db,doctor,{...common,code:"syn-cbc",departmentId:"dep_gh_madina_lab",priority:"routine",dueOn:"2026-10-22",idempotencyKey:"fhir-source-service-01"});
  const records:Array<{type:SourceType;id:string}>=[{type:"Patient",id:common.patientId},{type:"Encounter",id:encounter.id},{type:"Condition",id:condition.id},{type:"AllergyIntolerance",id:allergy.id},{type:"Observation",id:observation.id},{type:"Observation",id:pressure.id},{type:"ServiceRequest",id:order.id},{type:"MedicationRequest",id:medication.id}];
  return {db,doctor,nurse,foreign,admin,records,encounter,common};
}
