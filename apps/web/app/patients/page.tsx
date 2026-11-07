import {PageHeader,PageActions,PageEmpty,SectionHeading} from "@/components/page-workspace";
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
  return <Shell ctx={ctx} current="patients">
    <PageHeader section="Patient directory" href="/patients" icon="users" eyebrow={ctx.facilityName} description="Find and manage patient records registered at your current facility."><h1 className="page-title">Patients</h1></PageHeader>
    <PageActions>{canRegisterPatient(ctx)&&access.permissions.includes("patient.register")&&<a className="btn-dark" href="#register-patient">Register a patient</a>}<a href="/patients/duplicates">Duplicate review queue</a></PageActions>
    <Feedback error={feedback.error} notice={feedback.notice}/>
    {!failed&&<div className="page-summary" aria-label="Current patient search results"><div><strong>{patients.length}</strong><span>Records in these results</span></div><div><strong>{patients.filter(patient=>patient.registration_status==='active').length}</strong><span>Active registrations shown</span></div><div><strong>{patients.filter(patient=>patient.open_candidates>0).length}</strong><span>Records flagged for review</span></div></div>}
    <div className="directory-layout"><div className="directory-main">
    <form className="search" action="/patients" method="get"><label className="field">Search the patient directory<input id="q" name="q" type="search" defaultValue={q} placeholder="Name or MRN"/></label><button className="btn-dark" type="submit">Search</button></form>
    <section className="card directory-results"><header className="directory-results-heading"><h2>Patient directory</h2><span>{q?`Search: ${q}`:`${patients.length} records shown`}</span></header>
    {failed?<p role="alert">The patient directory is unavailable.</p>:patients.length===0?<PageEmpty title={q?"No patient on this facility matches.":"No patient is registered at this facility."} icon="users">Refine the name or medical record number to continue.</PageEmpty>:<div className="data-table-region" role="region" aria-label="Patient directory" tabIndex={0}><table><caption className="sr">Patients registered at your current facility</caption><thead><tr><th scope="col">Patient</th><th scope="col">Medical record</th><th scope="col">Date of birth</th><th scope="col">Sex</th><th scope="col">Registration</th><th scope="col">Action</th></tr></thead><tbody>{patients.map(patient=><tr key={patient.id}><th scope="row"><span className="directory-person"><span className="directory-avatar" aria-hidden="true">{patient.given_name[0]}{patient.family_name[0]}</span><span className="table-person">{patient.given_name} {patient.family_name}{patient.open_candidates>0&&<small>Duplicate review required</small>}</span></span></th><td className="table-id">{patient.mrn}</td><td>{patient.birth_date}</td><td>{sexLabel(patient.sex as Sex)}</td><td><span className="record-status">{patient.registration_status}</span></td><td><div className="directory-row-actions"><a href={`/patients/${patient.id}/chart`}>Open chart<span className="sr"> for {patient.given_name} {patient.family_name}, {patient.mrn}</span></a><a href={`/patients/${patient.id}/identity`}>Identity record<span className="sr"> for {patient.given_name} {patient.family_name}, {patient.mrn}</span></a></div></td></tr>)}</tbody></table></div>}
    </section>{patients.length===50&&<p className="muted">Showing the first 50 matches.</p>}
    </div><div>      {canRegisterPatient(ctx) && access.permissions.includes("patient.register") ? (
        <section className="card directory-registration" id="register-patient">
          <SectionHeading icon="users"><h2>Register a patient</h2></SectionHeading>
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
              <select aria-label="Sex" name="sex" defaultValue="unknown">
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
</div></div>
  </Shell>;
}
