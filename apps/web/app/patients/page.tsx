import { authorize, canReadChart, canRegisterPatient, getDb, noteDenial } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { listFoundationPatients } from "@/lib/foundation";
import { sexLabel } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const decision = authorize(
    getDb(),
    { principalId: ctx.userId, accountActive: true },
    "clinical.read",
    { type: "Patient", organizationId: ctx.organizationId, facilityId: ctx.facilityId, sensitivity: "standard" },
    { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: true, activeFacilityId: ctx.facilityId },
  );
  if (!decision.allow) redirect("/access/denied");
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "patient.list", "Patient", null);
    return (
      <Shell ctx={ctx} current="patients">
        <p className="eyebrow">Patients</p>
        <h1 className="page-title">The chart is closed for this role.</h1>
        <p className="lede">Audit review does not open patient records.</p>
      </Shell>
    );
  }
  const q = query.q ?? "";
  const listed = await listFoundationPatients(ctx.sessionId, q);
  const patients = listed ?? [];
  return (
    <Shell ctx={ctx} current="patients">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Patients</h1>
      <p className="lede">This list is limited to the facility on your directory entry and is read from the foundation service.</p>
      <form className="search" action="/patients" method="get">
        <label className="field">
          Find on this facility record
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name or MRN" />
        </label>
        <button className="btn-dark" type="submit">
          Search
        </button>
      </form>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {listed === null ? (
        <p>The foundation service is not running.</p>
      ) : patients.length === 0 ? (
        <p>No patient on this facility matches.</p>
      ) : (
        <div className="list">
          {patients.map((patient) => (
            <a className="row" key={patient.id} href={`/patients/${patient.id}`}>
              <span className="mono">{patient.mrn}</span>
              <span className="person">
                {patient.givenName} {patient.familyName}
              </span>
              <span className="muted">
                {patient.ageYears} years · {sexLabel(patient.sex)}
              </span>
            </a>
          ))}
        </div>
      )}
      {canRegisterPatient(ctx) ? (
        <section className="card" style={{ marginTop: 36, maxWidth: 520 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>
            Register a patient
          </h2>
          <p className="muted">The server assigns the MRN and the facility. Both stay on this record.</p>
          <form className="form-grid" action="/api/patients" method="post">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Given name
              <input name="givenName" type="text" required maxLength={80} />
            </label>
            <label className="field">
              Family name
              <input name="familyName" type="text" required maxLength={80} />
            </label>
            <label className="field">
              Date of birth
              <input name="birthDate" type="date" required />
            </label>
            <label className="field">
              Sex
              <select name="sex" defaultValue="female">
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <button className="btn-dark" type="submit">
              Register
            </button>
          </form>
        </section>
      ) : null}
    </Shell>
  );
}
