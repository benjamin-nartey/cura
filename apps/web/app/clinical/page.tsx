import { effectivePermissions, getDb, listAllergies, listConditions, listMasterPatients, listMedicationOrders, listObservations, listPatientEncounters, readVisitEncounter } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ClinicalPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.condition.read") && !access.permissions.includes("clinical.observation.read")) redirect("/access/denied");
  const actor = masterActor(ctx);
  let patients: ReturnType<typeof listMasterPatients> = [];
  try {
    if (access.permissions.includes("patient.read")) patients = listMasterPatients(getDb(), actor).filter((patient) => patient.registration_status === "active");
  } catch {
    patients = [];
  }
  let failed = false;
  let encounter: ReturnType<typeof readVisitEncounter> | null = null;
  let conditions: ReturnType<typeof listConditions> = [];
  let allergies: ReturnType<typeof listAllergies> = [];
  let observations: ReturnType<typeof listObservations> = [];
  let orders: ReturnType<typeof listMedicationOrders> = [];
  let encounters: ReturnType<typeof listPatientEncounters> = [];
  if (query.patient) {
    try {
      encounters = listPatientEncounters(getDb(), actor, query.patient);
      if (query.encounter) {
        encounter = readVisitEncounter(getDb(), actor, query.encounter);
        conditions = listConditions(getDb(), actor, query.patient, query.encounter);
        allergies = listAllergies(getDb(), actor, query.patient, query.encounter);
        observations = listObservations(getDb(), actor, query.patient, query.encounter);
        orders = listMedicationOrders(getDb(), actor, query.patient, query.encounter);
      }
    } catch {
      failed = true;
    }
  }
  const closed = encounter?.status === "completed";
  const canRecord = access.permissions.includes("clinical.condition.record") && !closed;
  const base = `patient=${query.patient ?? ""}&encounter=${query.encounter ?? ""}`;
  return (
    <Shell ctx={ctx} current="clinical">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Clinical entries</h1>
      <p className="lede">These are source entries recorded by a person. The system does not diagnose or recommend treatment.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form className="search" action="/clinical" method="get">
        <label className="field">Patient
          <select name="patient" defaultValue={query.patient ?? ""} required>
            <option value="">Select a patient</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.given_name} {patient.family_name}</option>)}
          </select>
        </label>
        <button className="btn-dark" type="submit">Show encounters</button>
      </form>
      {failed ? <p role="alert">Those clinical entries are not available.</p> : null}
      {!query.patient ? <p>No patient is selected.</p> : null}
      {query.patient && encounters.length === 0 && !failed ? <p>No encounter is available for this patient.</p> : null}
      {encounters.length > 0 ? (
        <ul>
          {encounters.map((item) => <li key={item.id}><a href={`/clinical?patient=${query.patient}&encounter=${item.id}`}>{item.status}</a></li>)}
        </ul>
      ) : null}
      {query.encounter && !failed ? (
        <>
          <p>Encounter status: <strong>{encounter?.status ?? "unknown"}</strong>. {closed ? "Ordinary recording is closed. A permitted correction still keeps the earlier version." : "Arrival is not a clinical entry."}</p>
          {canRecord ? (
            <p>
              <a href={`/clinical/conditions/new?${base}`}>Add condition</a>
              {" · "}
              <a href={`/clinical/allergies/new?${base}`}>Add allergy information</a>
              {" · "}
              <a href={`/clinical/vitals/new?${base}`}>Record vital signs</a>
              {" · "}
              <a href={`/clinical/medications/new?${base}`}>Draft medication</a>
            </p>
          ) : null}
          <h2>Conditions</h2>
          {conditions.length === 0 ? <p>No condition entry.</p> : <ul>{conditions.map((row) => <li key={row.id}>{row.display} · {row.clinical_status} · {row.verification_status} · version {row.version} · <a href={`/clinical/history?kind=condition&id=${row.id}`}>History</a></li>)}</ul>}
          <h2>Allergies</h2>
          {allergies.length === 0 ? <p>No allergy information is recorded. Unknown status is not the same as no known allergies.</p> : <ul>{allergies.map((row) => <li key={row.id}>{row.display} · {row.finding} · {row.verification_status} · version {row.version} · <a href={`/clinical/history?kind=allergy&id=${row.id}`}>History</a></li>)}</ul>}
          <h2>Vital signs and observations</h2>
          {observations.length === 0 ? <p>No observation is recorded.</p> : <ul>{observations.map((row) => <li key={row.id}><a href={`/clinical/observations/${row.id}`}>{row.display}</a> · {row.status} · version {row.version}</li>)}</ul>}
          <h2>Medication drafts</h2>
          <p><strong>Synthetic draft — not a valid prescription</strong></p>
          {orders.length === 0 ? <p>No medication draft.</p> : <ul>{orders.map((row) => <li key={row.id}><a href={`/clinical/medications/${row.id}`}>{row.display}</a> · {row.dose_quantity} {row.dose_unit} · {row.status}</li>)}</ul>}
        </>
      ) : null}
    </Shell>
  );
}
