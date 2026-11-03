import { canRegisterPatient, effectivePermissions, getDb, listMasterPatients } from "@curasphere/domain";
import type { Sex } from "@curasphere/contracts";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { sexLabel } from "@/lib/format";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("patient.read")) redirect("/access/denied");
  const q = (query.q ?? "").slice(0, 80);
  let patients: ReturnType<typeof listMasterPatients> = [];
  let failed = false;
  try {
    patients = listMasterPatients(getDb(), masterActor(ctx), q);
  } catch {
    failed = true;
  }
  return (
    <Shell ctx={ctx} current="patients">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Patients</h1>
      <p className="lede">This directory reads the chart master record for the facility on this session.</p>
      <form className="search" action="/patients" method="get">
        <label className="field">
          Find on this facility record
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name or MRN" />
        </label>
        <button className="btn-dark" type="submit">
          Search
        </button>
      </form>
      <p>
        <a href="/patients/duplicates">Duplicate review queue</a>
      </p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {failed ? (
        <p>The patient directory is unavailable.</p>
      ) : patients.length === 0 ? (
        <p>{q ? "No patient on this facility matches." : "No patient is registered at this facility."}</p>
      ) : (
        <div className="list">
          {patients.map((patient) => (
            <a className="row" key={patient.id} href={`/patients/${patient.id}/chart`}>
              <span className="mono">{patient.mrn}</span>
              <span className="person">
                {patient.given_name} {patient.family_name}
              </span>
              <span className="muted">
                {patient.birth_date} · {sexLabel(patient.sex as Sex)} · {patient.registration_status}
                {patient.open_candidates > 0 ? " · duplicate candidate" : ""}
              </span>
            </a>
          ))}
        </div>
      )}
      {patients.length === 50 ? <p className="muted">Showing the first 50 matches.</p> : null}
      {canRegisterPatient(ctx) && access.permissions.includes("patient.register") ? (
        <section className="card" style={{ marginTop: 36, maxWidth: 520 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Register a patient</h2>
          <p className="muted">The server assigns the MRN and the facility. A possible duplicate is shown before the record is saved.</p>
          <form className="form-grid" action="/api/patients" method="post">
            <label className="field">
              Given name
              <input name="givenName" type="text" required maxLength={80} />
            </label>
            <label className="field">
              Family name
              <input name="familyName" type="text" required maxLength={80} />
            </label>
            <label className="field">
              Preferred name
              <input name="preferredName" type="text" maxLength={80} />
            </label>
            <label className="field">
              Date of birth
              <input name="birthDate" type="date" required />
            </label>
            <label className="field">
              Sex
              <select name="sex" defaultValue="unknown">
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="field">
              Contact
              <input name="contact" type="text" maxLength={80} />
            </label>
            <button className="btn-dark" type="submit">
              Check and continue
            </button>
          </form>
        </section>
      ) : null}
    </Shell>
  );
}
