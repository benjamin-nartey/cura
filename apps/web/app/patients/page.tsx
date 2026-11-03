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
      <p className="lede">Find and manage patient records registered at your current facility.</p>
      <form className="search" action="/patients" method="get">
        <label className="field">
          Search the patient directory
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
        <div className="data-table-region" role="region" aria-label="Patient directory" tabIndex={0}>
          <table>
            <caption className="sr">Patients registered at your current facility</caption>
            <thead><tr><th scope="col">Patient</th><th scope="col">Medical record</th><th scope="col">Date of birth</th><th scope="col">Sex</th><th scope="col">Registration</th><th scope="col">Action</th></tr></thead>
            <tbody>{patients.map(patient => <tr key={patient.id}>
              <th scope="row"><span className="table-person">{patient.given_name} {patient.family_name}{patient.open_candidates > 0 ? <small>Duplicate review required</small> : null}</span></th>
              <td className="table-id">{patient.mrn}</td><td>{patient.birth_date}</td><td>{sexLabel(patient.sex as Sex)}</td>
              <td><span className="record-status">{patient.registration_status}</span></td>
              <td><a href={`/patients/${patient.id}/chart`}>Open chart<span className="sr"> for {patient.given_name} {patient.family_name}, {patient.mrn}</span></a></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {patients.length === 50 ? <p className="muted">Showing the first 50 matches.</p> : null}
      {canRegisterPatient(ctx) && access.permissions.includes("patient.register") ? (
        <section className="card" style={{ marginTop: 36, maxWidth: 520 }}>
          <h2 style={{ marginTop: 0 }}>Register a patient</h2>
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
