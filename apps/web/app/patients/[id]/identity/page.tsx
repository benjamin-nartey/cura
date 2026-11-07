import {PageHeader,PageActions,SectionHeading,RecordFacts,DetailFact,PageEmpty} from "@/components/page-workspace";
import {Icon} from "@/components/icon";
import {formatWhen} from "@/lib/format";
import { canReadChart, getDb, readMasterPatient } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function PatientIdentityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  let patient: ReturnType<typeof readMasterPatient>;
  try {
    patient = readMasterPatient(getDb(), masterActor(ctx), id);
  } catch {
    redirect("/patients?error=notfound");
  }
  return <Shell ctx={ctx} current="patients">
    <PageHeader section="Patient identity" href="/patients" icon="users" eyebrow={ctx.facilityName} description="Demographics, identifiers, contacts, and the provenance of this patient record."><h1 className="page-title">{patient.given_name} {patient.family_name}</h1></PageHeader>
    <PageActions><a href="/patients">Back to the directory</a>{canReadChart(ctx)&&patient.registration_status!=="merged"&&<a href={`/patients/${patient.id}/chart`}>Open the clinical chart</a>}</PageActions>
    <Feedback error={feedback.error} notice={feedback.notice}/>
    <section className="record-profile" aria-label="Patient identity summary"><span className="record-profile-avatar" aria-hidden="true">{patient.given_name[0]}{patient.family_name[0]}</span><div className="record-profile-copy"><h2>Identity record</h2><p>Medical record number <strong>{patient.mrn}</strong></p><div className="record-badges"><span className="record-badge">Record status · {patient.registration_status}</span><span className="record-badge">Version {patient.version}</span><span className="record-badge">Source · {patient.registration_source}</span></div></div></section>
    {patient.merged_into_id&&<div className="page-note"><Icon name="alert" size={18}/><span>This record has been superseded by {patient.merged_into_id}. Its history is retained.</span></div>}
    <nav className="record-tabs" aria-label="Patient identity sections"><a href="#demographics">Demographics</a><a href="#identifiers">Identifiers</a><a href="#contacts">Contacts</a><a href="#facilities">Facilities</a><a href="#history">History</a><a href="#privacy">Privacy</a></nav>
    <div className="record-layout"><div className="record-column">
      <section className="card record-section" id="demographics"><SectionHeading icon="users"><h2>Demographics</h2></SectionHeading><RecordFacts><DetailFact label="Given name">{patient.given_name}</DetailFact><DetailFact label="Family name">{patient.family_name}</DetailFact><DetailFact label="Preferred name">{patient.preferred_name??"Not recorded"}</DetailFact><DetailFact label="Birth date">{patient.birth_date}</DetailFact><DetailFact label="Sex">{patient.sex}</DetailFact><DetailFact label="Medical record number"><span className="mono">{patient.mrn}</span></DetailFact></RecordFacts></section>
      <section className="card record-section" id="identifiers"><SectionHeading icon="card"><h2>Identifiers</h2></SectionHeading>{patient.identifiers.length===0?<PageEmpty title="No identifier is stored." icon="card"/>:patient.identifiers.map(identifier=><div className="record-entry" key={`${identifier.system}-${identifier.value}`}><span className="record-entry-label">{identifier.system}</span><span className="record-entry-value mono">{identifier.value}</span><span><span className="record-status">{identifier.status}</span></span></div>)}</section>
      <section className="card record-section" id="contacts"><SectionHeading icon="message"><h2>Contacts</h2></SectionHeading>{patient.contacts.length===0?<PageEmpty title="No contact is stored." icon="message"/>:patient.contacts.map(contact=><div className="record-entry" key={`${contact.system}-${contact.value}`}><span className="record-entry-label">{contact.use} · {contact.system}</span><span className="record-entry-value">{contact.value}</span></div>)}</section>
    </div><div className="record-column">
      <section className="card record-section" id="facilities"><SectionHeading icon="building"><h2>Facilities</h2></SectionHeading>{patient.registrations.length===0?<PageEmpty title="No facility registration is stored." icon="building"/>:patient.registrations.map(registration=><div className="record-entry" key={registration.facility_id}><span className="record-entry-label">Facility reference</span><span className="record-entry-value">{registration.facility_id}</span><span><span className="record-status">{registration.status}</span></span></div>)}</section>
      <section className="card record-section" id="privacy"><SectionHeading icon="shield"><h2>Privacy</h2></SectionHeading>{patient.subjects.length===0?<div className="page-note"><Icon name="shield" size={18}/><span>No verified privacy-subject link is stored. Creating this record did not set a consent basis.</span></div>:patient.subjects.map(subject=><div className="record-entry" key={subject.subject_kind}><span className="record-entry-label">{subject.subject_kind}</span><span className="record-entry-value">{subject.status}</span></div>)}</section>
      <section className="card record-section" id="history"><SectionHeading icon="fileSearch"><h2>History</h2></SectionHeading>{patient.history.length===0?<PageEmpty title="No version note is stored yet."/>:<ol className="record-history">{patient.history.map(entry=><li key={`${entry.version}-${entry.reason}`}><strong>Version {entry.version} · {entry.reason}</strong><p>Recorded by {entry.author_id}</p><time dateTime={entry.created_at}>{Number.isFinite(Date.parse(entry.created_at))?formatWhen(entry.created_at):"Recording time unavailable"}</time></li>)}</ol>}</section>
    </div></div>
  </Shell>;
}
