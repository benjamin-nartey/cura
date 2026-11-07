/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, facilityClock, getDb, listAppointments, listMasterPatients } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("appointment.arrive")) redirect("/access/denied");
  const actor = masterActor(ctx);
  const timeZone = facilityClock(getDb(), actor)?.timezone ?? "UTC";
  const patients = new Map(listMasterPatients(getDb(), actor).map((patient) => [patient.id, `${patient.given_name} ${patient.family_name}`]));
  const needle = (query.q ?? "").trim().toLowerCase();
  const rows = listAppointments(getDb(), actor, "confirmed").filter((row) => {
    const name = patients.get(row.patient_id) ?? "";
    return !needle || name.toLowerCase().includes(needle) || row.id.includes(needle);
  });
  return (
    <Shell ctx={ctx} current="appointments">
      <PageHeader section="Appointments" href="/appointments" icon="calendar" eyebrow={<>{ctx.facilityName}</>} description={<>Recording arrival does not start the clinical encounter.</>}><h1 className="page-title">Check in</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form className="search" action="/appointments/check-in" method="get">
        <label className="field">
          Find a confirmed appointment
          <input name="q" type="search" defaultValue={query.q ?? ""} />
        </label>
        <button className="btn-dark" type="submit">Search</button>
      </form>
      {rows.length === 0 ? <p>No confirmed appointment is waiting.</p> : null}
      <div className="list">
        {rows.map((row) => (
          <form className="row" key={row.id} action={`/api/appointments/${row.id}`} method="post">
            <input type="hidden" name="action" value="arrive" />
            <input type="hidden" name="version" value={row.version} />
            <input type="hidden" name="return" value="check-in" />
            <span className="person">{patients.get(row.patient_id) ?? "Patient"}</span>
            <span className="muted">{clockLabel(row.starts_at, timeZone)}</span>
            <button className="btn-dark" type="submit">Record arrival</button>
          </form>
        ))}
      </div>
    </Shell>
  );
}
