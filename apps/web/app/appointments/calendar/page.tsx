/* Individual page workspace */
import {PageHeader,PageActions,SectionHeading} from "@/components/page-workspace";
import { effectivePermissions, facilityClock, getDb, listAppointments, listPractitioners, listSlots } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

function weekDates(anchor: string) {
  const day = new Date(`${anchor}T12:00:00.000Z`).getUTCDay();
  const monday = new Date(Date.parse(`${anchor}T12:00:00.000Z`) - ((day + 6) % 7) * 86400000);
  return Array.from({ length: 5 }, (_, index) => new Date(monday.getTime() + index * 86400000).toISOString().slice(0, 10));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; practitioner?: string; view?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("appointment.read")) redirect("/access/denied");
  const actor = masterActor(ctx);
  const practitioners = listPractitioners(getDb(), actor).filter((row) => row.status === "active");
  const practitioner = query.practitioner || practitioners[0]?.id || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : new Date().toISOString().slice(0, 10);
  const timeZone = facilityClock(getDb(), actor)?.timezone ?? "UTC";
  const view = query.view === "week" ? "week" : "day";
  const days = view === "week" ? weekDates(date) : [date];
  const appointments = listAppointments(getDb(), actor);
  return (
    <Shell ctx={ctx} current="appointments">
      <PageHeader section="Appointments" href="/appointments" icon="calendar" eyebrow={<>{ctx.facilityName}</>} description={<>Open times are checked when this page loads. They are not a guarantee until the booking is saved.</>}><h1 className="page-title">Calendar</h1></PageHeader>
      <PageActions>
        <a href={`/appointments/calendar?date=${date}&practitioner=${practitioner}&view=day`}>Day</a>
        {" · "}
        <a href={`/appointments/calendar?date=${date}&practitioner=${practitioner}&view=week`}>Week</a>
      </PageActions>
      <form className="search" action="/appointments/calendar" method="get">
        <input type="hidden" name="view" value={view} />
        <label className="field">
          Date
          <input name="date" type="date" defaultValue={date} required />
        </label>
        <label className="field">
          Practitioner
          <select aria-label="Practitioner" name="practitioner" defaultValue={practitioner}>
            {practitioners.map((row) => (
              <option key={row.id} value={row.id}>{row.display_name}</option>
            ))}
          </select>
        </label>
        <button className="btn-dark" type="submit">Show</button>
      </form>
      <div className="split">
        {days.map((day) => {
          const slots = practitioner ? listSlots(getDb(), actor, practitioner, day, "follow-up") : [];
          const booked = appointments.filter((row) => row.practitioner_id === practitioner && row.starts_at.slice(0, 10) === day);
          return (
            <section className="card" key={day}>
              <SectionHeading icon="calendar"><h2>{day}</h2></SectionHeading>
              {booked.length === 0 ? <p>No saved appointment.</p> : null}
              <ul>
                {booked.map((row) => (
                  <li key={row.id}>
                    <a href={`/appointments/${row.id}`}>{clockLabel(row.starts_at, timeZone)} · {row.status}</a>
                  </li>
                ))}
              </ul>
              {slots.length === 0 ? <p>No open follow-up time.</p> : <p>{slots.length} open follow-up times.</p>}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
