import { effectivePermissions, facilityClock, getDb, listMasterPatients, listPractitioners, readVisitEncounter } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function EncounterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("encounter.read")) redirect("/access/denied");
  let failed = false;
  let encounter: ReturnType<typeof readVisitEncounter> | null = null;
  try {
    encounter = readVisitEncounter(getDb(), masterActor(ctx), id);
  } catch {
    failed = true;
  }
  const row = encounter;
  const timeZone = facilityClock(getDb(), masterActor(ctx))?.timezone ?? "UTC";
  const patient = row ? listMasterPatients(getDb(), masterActor(ctx)).find((item) => item.id === row.patient_id) : undefined;
  const practitioner = row ? listPractitioners(getDb(), masterActor(ctx)).find((item) => item.id === row.practitioner_id) : undefined;
  return (
    <Shell ctx={ctx} current="appointments">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Encounter</h1>
      <p className="lede">This workspace records the visit lifecycle. It does not record diagnoses, observations, or orders.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {failed || !row ? <p role="alert">That encounter is not available.</p> : null}
      {row ? (
        <div className="card">
          <p><strong>{patient ? `${patient.given_name} ${patient.family_name}` : "Patient"}</strong></p>
          <p>{practitioner?.display_name ?? "Practitioner"}</p>
          <p>Status: <strong>{row.status}</strong></p>
          <p>Facility: {ctx.facilityName}</p>
          <p><a href={`/appointments/${row.appointment_id}`}>Linked appointment</a></p>
          {access.permissions.includes("patient.read") || access.permissions.includes("clinical.read") ? <p><a href={`/patients/${row.patient_id}/chart?encounter=${row.id}`}>Unified patient chart</a></p> : null}
          {access.permissions.includes("clinical.condition.read") || access.permissions.includes("clinical.observation.read") ? <p><a href={`/clinical?patient=${row.patient_id}&encounter=${row.id}`}>Clinical source entries</a></p> : null}
          {access.permissions.includes("work.order.read") || access.permissions.includes("work.pending.read") ? <p><a href={`/work?patient=${row.patient_id}&encounter=${row.id}`}>Orders and referrals</a></p> : null}
          {access.permissions.includes("patient.read") ? <p><a href={`/patients/${row.patient_id}/chart?encounter=${row.id}`}>Unified patient chart</a></p> : null}
          {access.permissions.includes("billing.charge.create") ? <p><a href={`/billing/charges/new?patient=${row.patient_id}&encounter=${row.id}`}>Create synthetic charge</a></p> : null}
          <p>{row.started_at ? `Started ${clockLabel(row.started_at, timeZone)}` : "Not started"}</p>
          <p>{row.ended_at ? `Ended ${clockLabel(row.ended_at, timeZone)}` : "Not ended"}</p>
          {access.permissions.includes("encounter.close") && row.status === "in-progress" ? <a href={`/encounters/${row.id}/close`}>Close encounter</a> : null}
          <h2>History</h2>
          {row.events.length === 0 ? <p>Encounter history is not available for this role.</p> : (
            <ol>
              {row.events.map((event) => (
                <li key={`${event.version}-${event.created_at}`}>{event.from_status} to {event.to_status} · {event.reason} · {event.actor_id} · {clockLabel(event.created_at, timeZone)}</li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </Shell>
  );
}
