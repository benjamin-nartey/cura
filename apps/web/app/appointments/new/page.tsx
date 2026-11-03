import { effectivePermissions, facilityClock, getDb, listMasterPatients, listPractitioners, listSlots, localToUtc } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { clockLabel } from "@/lib/schedule";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function BookAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; practitioner?: string; category?: string; date?: string; error?: string; notice?: string; offered?: string }>;
}) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("appointment.create")) redirect("/access/denied");
  const actor = masterActor(ctx);
  const patients = listMasterPatients(getDb(), actor).filter((patient) => patient.registration_status === "active");
  const practitioners = listPractitioners(getDb(), actor).filter((practitioner) => practitioner.status === "active");
  const category = query.category === "new-visit" ? "new-visit" : "follow-up";
  const timeZone = facilityClock(getDb(), actor)?.timezone ?? "UTC";
  let slots: ReturnType<typeof listSlots> = [];
  let slotError = false;
  if (query.practitioner && query.date) {
    try {
      slots = listSlots(getDb(), actor, query.practitioner, query.date, category);
    } catch {
      slotError = true;
    }
  }
  const offered = query.offered && slots.some((slot) => slot.startsAt === query.offered) ? query.offered : "";
  return (
    <Shell ctx={ctx} current="appointments">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Book an appointment</h1>
      <p className="lede">The saved time is the time the server commits. A conflict keeps the same practitioner.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form className="form-grid" action="/appointments/new" method="get">
        <label className="field">
          Patient
          <select name="patient" defaultValue={query.patient ?? ""} required>
            <option value="">Select a patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.given_name} {patient.family_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category
          <select name="category" defaultValue={category}>
            <option value="follow-up">Follow-up, 20 minutes</option>
            <option value="new-visit">New visit, 30 minutes</option>
          </select>
        </label>
        <label className="field">
          Practitioner
          <select name="practitioner" defaultValue={query.practitioner ?? ""} required>
            <option value="">Select a practitioner</option>
            {practitioners.map((practitioner) => (
              <option key={practitioner.id} value={practitioner.id}>
                {practitioner.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Date
          <input name="date" type="date" required defaultValue={query.date ?? ""} />
        </label>
        <button className="btn-dark" type="submit">
          Show available times
        </button>
      </form>
      {slotError ? <p role="alert">Available times could not be loaded.</p> : null}
      {query.date && query.practitioner && !slotError && slots.length === 0 ? <p>No open time remains for that practitioner on that day.</p> : null}
      {offered ? <p role="status">The previous time was taken. {clockLabel(offered, timeZone)} is still open for this practitioner.</p> : null}
      {slots.length > 0 && query.patient ? (
        <form className="form-grid" action="/api/appointments" method="post">
          <input type="hidden" name="patientId" value={query.patient} />
          <input type="hidden" name="practitionerId" value={query.practitioner} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="date" value={query.date} />
          <fieldset>
            <legend>Available times</legend>
            {slots.map((slot) => (
              <label key={slot.startsAt}>
                <input type="radio" name="startsAt" value={slot.startsAt} required defaultChecked={slot.startsAt === offered} /> {clockLabel(slot.startsAt, timeZone)}
              </label>
            ))}
          </fieldset>
          <button className="btn-dark" type="submit">
            Request appointment
          </button>
        </form>
      ) : null}
      <p className="muted">Facility clock: {timeZone}. A sample local conversion for 09:00 is stored as {query.date ? localToUtc(query.date, "09:00", timeZone) : "the selected date"}.</p>
    </Shell>
  );
}
