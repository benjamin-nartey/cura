import { effectivePermissions, facilityClock, getDb, listMasterPatients, listPractitioners, readAppointment } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AppointmentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("appointment.read")) redirect("/access/denied");
  let failed = false;
  let appointment: ReturnType<typeof readAppointment> | null = null;
  let timeZone = "UTC";
  try {
    appointment = readAppointment(getDb(), masterActor(ctx), id);
    timeZone = facilityClock(getDb(), masterActor(ctx))?.timezone ?? appointment.timezone ?? "UTC";
  } catch {
    failed = true;
  }
  if (!appointment && !failed) redirect("/access/denied");
  const patient = appointment ? listMasterPatients(getDb(), masterActor(ctx)).find((row) => row.id === appointment?.patient_id) : undefined;
  const practitioner = appointment ? listPractitioners(getDb(), masterActor(ctx)).find((row) => row.id === appointment?.practitioner_id) : undefined;
  const allowed = new Set(access.permissions);
  return (
    <Shell ctx={ctx} current="appointments">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Appointment</h1>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {failed || !appointment ? <p role="alert">That appointment is not available.</p> : null}
      {appointment ? (
        <>
          <div className="card">
            <p>
              <strong>{patient ? `${patient.given_name} ${patient.family_name}` : "Patient"}</strong>
            </p>
            <p>{practitioner?.display_name ?? "Practitioner"}</p>
            <p>{clockLabel(appointment.starts_at, timeZone)}</p>
            <p>Category: {appointment.category}</p>
            <p>
              Status: <strong>{appointment.status}</strong>
            </p>
            <p>{appointment.arrived_at ? `Arrived ${clockLabel(appointment.arrived_at, timeZone)}` : "Arrival has not been recorded."}</p>
            <p>{appointment.encounter ? <a href={`/encounters/${appointment.encounter.id}`}>Encounter {appointment.encounter.status}</a> : "No encounter is linked."}</p>
            <p className="muted">Version {appointment.version}</p>
          </div>
          <div className="split">
            {allowed.has("appointment.confirm") && appointment.status === "requested" ? (
              <form action={`/api/appointments/${appointment.id}`} method="post">
                <input type="hidden" name="action" value="confirm" />
                <input type="hidden" name="version" value={appointment.version} />
                <button className="btn-dark" type="submit">Confirm</button>
              </form>
            ) : null}
            {allowed.has("appointment.arrive") && appointment.status === "confirmed" ? (
              <form action={`/api/appointments/${appointment.id}`} method="post">
                <input type="hidden" name="action" value="arrive" />
                <input type="hidden" name="version" value={appointment.version} />
                <button className="btn-dark" type="submit">Record arrival</button>
              </form>
            ) : null}
            {allowed.has("appointment.reschedule") && (appointment.status === "requested" || appointment.status === "confirmed") ? (
              <a href={`/appointments/${appointment.id}/reschedule`}>Reschedule</a>
            ) : null}
            {allowed.has("encounter.start") && appointment.status === "arrived" && !appointment.encounter ? (
              <form action={`/api/appointments/${appointment.id}`} method="post">
                <input type="hidden" name="action" value="start" />
                <input type="hidden" name="version" value={appointment.version} />
                <button className="btn-dark" type="submit">Start encounter</button>
              </form>
            ) : null}
          </div>
          {allowed.has("appointment.cancel") && (appointment.status === "requested" || appointment.status === "confirmed") ? (
            <form className="form-grid" action={`/api/appointments/${appointment.id}`} method="post">
              <input type="hidden" name="action" value="cancel" />
              <input type="hidden" name="version" value={appointment.version} />
              <label className="field">
                Cancellation reason
                <select name="reason" required>
                  <option value="patient-request">Patient request</option>
                  <option value="clinic-request">Clinic request</option>
                  <option value="entered-in-error">Entered in error</option>
                </select>
              </label>
              <button className="btn-dark" type="submit">Cancel appointment</button>
            </form>
          ) : null}
          {allowed.has("appointment.no-show") && appointment.status === "confirmed" && !appointment.arrived_at ? (
            <form className="form-grid" action={`/api/appointments/${appointment.id}`} method="post">
              <input type="hidden" name="action" value="no-show" />
              <input type="hidden" name="version" value={appointment.version} />
              <input type="hidden" name="reason" value="window-passed" />
              <button className="btn-dark" type="submit">Record no-show</button>
            </form>
          ) : null}
          <h2>History</h2>
          <ol>
            {appointment.events.map((event) => (
              <li key={`${event.version}-${event.created_at}`}>
                {event.from_status} to {event.to_status} · {event.reason} · {event.actor_id} · {clockLabel(event.created_at, timeZone)} · version {event.version}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </Shell>
  );
}
