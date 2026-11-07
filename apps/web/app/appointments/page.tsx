import {PageHeader,PageActions,PageEmpty} from "@/components/page-workspace";
import {Icon} from "@/components/icon";
import { effectivePermissions, facilityClock, getDb, listAppointments, listMasterPatients, listPractitioners } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
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
  const dateLabel=new Intl.DateTimeFormat("en-GB",{timeZone,weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const timeLabel=new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const agenda=new Map<string,typeof visible>();
  for(const row of visible){const day=dateLabel.format(new Date(row.starts_at));const records=agenda.get(day)??[];records.push(row);agenda.set(day,records);}
  const canBook=access.permissions.includes("appointment.create");
  return <Shell ctx={ctx} current="appointments">
    <PageHeader section="Scheduling" href="/appointments" icon="calendar" eyebrow={ctx.facilityName} description="Appointments, arrivals, and visit status in your facility’s clock. Arrival is not the start of an encounter."><h1 className="page-title">Appointments</h1></PageHeader>
    <PageActions><a href="/appointments/calendar">Calendar</a>{canBook&&<a className="btn-dark" href="/appointments/new">Book</a>}<a href="/appointments/check-in">Check in</a></PageActions>
    <Feedback error={feedback.error} notice={feedback.notice}/>
    {!failed&&<div className="page-summary" aria-label="Loaded appointment records"><div><strong>{rows.filter(row=>row.status==='requested').length}</strong><span>Awaiting confirmation</span></div><div><strong>{rows.filter(row=>row.status==='confirmed').length}</strong><span>Confirmed appointments</span></div><div><strong>{rows.filter(row=>row.status==='arrived'||row.status==='in-progress').length}</strong><span>Arrived or in progress</span></div></div>}
    <form className="search" action="/appointments" method="get"><label className="field">Find an appointment<input name="q" type="search" defaultValue={query.q??""}/></label><label className="field">Status<select name="status" aria-label="Status" defaultValue={query.status??""}><option value="">All statuses</option>{GROUPS.map(status=><option key={status} value={status}>{status}</option>)}</select></label><button className="btn-dark" type="submit">Filter</button></form>
    {!failed&&<nav className="schedule-tabs" aria-label="Appointment status"><a href="/appointments" aria-current={!query.status?'page':undefined}>All <strong>{rows.length}</strong></a>{GROUPS.map(status=><a key={status} href={`/appointments?status=${status}`} aria-current={query.status===status?'page':undefined}>{status.replaceAll('-',' ')} <strong>{rows.filter(row=>row.status===status).length}</strong></a>)}</nav>}
    <div className="page-note"><Icon name="clock" size={17}/><span>Facility clock: {timeZone}. Status counts describe the loaded records; use the calendar to inspect a particular day.</span></div>
    {failed?<p role="alert">The schedule is unavailable.</p>:visible.length===0?<section className="card"><PageEmpty title="No appointment matches this facility view." icon="calendar">Try another patient name, practitioner, or appointment status.</PageEmpty></section>:<div className="agenda">{[...agenda.entries()].map(([day,appointments])=><section className="agenda-day" key={day}><header><h2>{day}</h2><span>{appointments.length} {appointments.length===1?'appointment':'appointments'}</span></header>{appointments.map(row=><a className="row agenda-appointment" key={row.id} href={`/appointments/${row.id}`}><div className="agenda-time"><strong>{timeLabel.format(new Date(row.starts_at))}</strong><small>{timeZone}</small></div><div className="agenda-person"><span className="directory-avatar" aria-hidden="true"><Icon name="users" size={17}/></span><div><strong className="person">{patients.get(row.patient_id)??'Patient'}</strong><small>{practitioners.get(row.practitioner_id??'')??'Practitioner'} · {row.category}</small></div></div><div className="agenda-status"><span className="record-status">{row.status}</span><span aria-hidden="true">↗</span></div></a>)}</section>)}</div>}
  </Shell>;
}
