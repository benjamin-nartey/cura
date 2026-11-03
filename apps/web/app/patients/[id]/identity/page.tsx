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
  return (
    <Shell ctx={ctx} current="patients">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">
        {patient.given_name} {patient.family_name}
      </h1>
      <p className="lede">
        {patient.registration_status} · version {patient.version} · source {patient.registration_source}
        {patient.merged_into_id ? ` · superseded by ${patient.merged_into_id}` : ""}
      </p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Demographics</h2>
        <p>Preferred name: {patient.preferred_name ?? "Not recorded"}</p>
        <p>Birth date: {patient.birth_date}</p>
        <p>Sex: {patient.sex}</p>
        <p className="mono">MRN {patient.mrn}</p>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Identifiers</h2>
        {patient.identifiers.length === 0 ? <p>No identifier is stored.</p> : null}
        <ul>
          {patient.identifiers.map((identifier) => (
            <li key={`${identifier.system}-${identifier.value}`}>
              {identifier.system} · {identifier.value} · {identifier.status}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Contacts</h2>
        {patient.contacts.length === 0 ? <p>No contact is stored.</p> : null}
        <ul>
          {patient.contacts.map((contact) => (
            <li key={`${contact.system}-${contact.value}`}>
              {contact.use} {contact.system}: {contact.value}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Facilities</h2>
        <ul>
          {patient.registrations.map((registration) => (
            <li key={registration.facility_id}>
              {registration.facility_id} · {registration.status}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>History</h2>
        {patient.history.length === 0 ? <p>No version note is stored yet.</p> : null}
        <ul>
          {patient.history.map((entry) => (
            <li key={`${entry.version}-${entry.reason}`}>
              Version {entry.version} · {entry.reason} · {entry.author_id}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Privacy</h2>
        {patient.subjects.length === 0 ? (
          <p>No verified privacy-subject link is stored. Creating this record did not set a consent basis.</p>
        ) : (
          <ul>
            {patient.subjects.map((subject) => (
              <li key={subject.subject_kind}>
                {subject.subject_kind} · {subject.status}
              </li>
            ))}
          </ul>
        )}
      </section>
      {canReadChart(ctx) && patient.registration_status !== "merged" ? (
        <p>
          <a href={`/patients/${patient.id}`}>Open the clinical chart</a>
        </p>
      ) : null}
      <p>
        <a href="/patients">Back to the directory</a>
      </p>
    </Shell>
  );
}
