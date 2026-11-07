/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, facilityClock, getDb, listSlots, readAppointment } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReschedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("appointment.reschedule")) redirect("/access/denied");
  const actor = masterActor(ctx);
  const appointment = readAppointment(getDb(), actor, id);
  const timeZone = facilityClock(getDb(), actor)?.timezone ?? "UTC";
  const date = query.date ?? appointment.starts_at.slice(0, 10);
  const slots = appointment.practitioner_id && appointment.category ? listSlots(getDb(), actor, appointment.practitioner_id, date, appointment.category).filter((slot) => slot.startsAt !== appointment.starts_at) : [];
  return (
    <Shell ctx={ctx} current="appointments">
      <PageHeader section="Appointments" href="/appointments" icon="calendar" eyebrow={<>{ctx.facilityName}</>} description={<>The current time stays reserved until the replacement time is saved.</>}><h1 className="page-title">Reschedule</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <p>Current time: {clockLabel(appointment.starts_at, timeZone)}. Status: {appointment.status}. Version {appointment.version}.</p>
      <form action={`/appointments/${id}/reschedule`} method="get">
        <label className="field">
          Date
          <input name="date" type="date" defaultValue={date} required />
        </label>
        <button className="btn-dark" type="submit">Show replacement times</button>
      </form>
      {slots.length === 0 ? <p>No replacement time is open for this practitioner.</p> : null}
      {slots.length > 0 ? (
        <form className="form-grid" action={`/api/appointments/${id}/reschedule`} method="post">
          <input type="hidden" name="version" value={appointment.version} />
          <input type="hidden" name="date" value={date} />
          <fieldset>
            <legend>Replacement times</legend>
            {slots.map((slot) => (
              <label key={slot.startsAt}>
                <input type="radio" name="startsAt" value={slot.startsAt} required /> {clockLabel(slot.startsAt, timeZone)}
              </label>
            ))}
          </fieldset>
          <button className="btn-dark" type="submit">Save new time</button>
        </form>
      ) : null}
    </Shell>
  );
}
