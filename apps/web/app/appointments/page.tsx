import { effectivePermissions, facilityClock, getDb, listAppointments, listMasterPatients, listPractitioners } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

const GROUPS = ["requested", "confirmed", "arrived", "in-progress", "closed", "cancelled", "no-show"] as const;

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("appointment.read")) redirect("/access/denied");
  const actor = masterActor(ctx);
  let failed = false;
  let rows: ReturnType<typeof listAppointments> = [];
  let timeZone = "UTC";
  const patients = new Map<string, string>();
  const practitioners = new Map<string, string>();
  try {
    rows = listAppointments(getDb(), actor);
    timeZone = facilityClock(getDb(), actor)?.timezone ?? "UTC";
    for (const patient of listMasterPatients(getDb(), actor)) patients.set(patient.id, `${patient.given_name} ${patient.family_name}`);
    for (const practitioner of listPractitioners(getDb(), actor)) practitioners.set(practitioner.id, practitioner.display_name);
  } catch {
    failed = true;
  }
  const needle = (query.q ?? "").trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (query.status && row.status !== query.status) return false;
    if (!needle) return true;
    const patient = patients.get(row.patient_id) ?? row.patient_id;
    const practitioner = practitioners.get(row.practitioner_id ?? "") ?? "";
    return `${patient} ${practitioner} ${row.category ?? ""} ${row.status}`.toLowerCase().includes(needle);
  });
  return (
    <Shell ctx={ctx} current="appointments">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Appointments</h1>
      <p className="lede">Today’s schedule uses the facility clock. Arrival is not the start of an encounter.</p>
      <p>
        <a href="/appointments/calendar">Calendar</a>
        {" · "}
        <a href="/appointments/new">Book</a>
        {" · "}
        <a href="/appointments/check-in">Check in</a>
      </p>
      <form className="search" action="/appointments" method="get">
        <label className="field">
          Find an appointment
          <input name="q" type="search" defaultValue={query.q ?? ""} />
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">All statuses</option>
            {GROUPS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-dark" type="submit">
          Filter
        </button>
      </form>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {failed ? <p role="alert">The schedule is unavailable.</p> : null}
      {!failed ? (
        <div className="split">
          {GROUPS.map((status) => (
            <a key={status} href={`/appointments?status=${status}`}>
              {status}: {rows.filter((row) => row.status === status).length}
            </a>
          ))}
        </div>
      ) : null}
      {!failed && visible.length === 0 ? <p>No appointment matches this facility view.</p> : null}
      <div className="list">
        {visible.map((row) => (
          <a className="row" key={row.id} href={`/appointments/${row.id}`}>
            <span className="person">{patients.get(row.patient_id) ?? "Patient"}</span>
            <span className="muted">
              {clockLabel(row.starts_at, timeZone)} · {practitioners.get(row.practitioner_id ?? "") ?? "Practitioner"} · {row.category} · {row.status}
            </span>
          </a>
        ))}
      </div>
    </Shell>
  );
}
