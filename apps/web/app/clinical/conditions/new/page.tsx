/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { ClinicalCodePicker } from "@/components/clinical-code-picker";
import { effectivePermissions, getDb, listPractitioners, getClinicalCodeChoices, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewConditionPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string; error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.condition.record")) redirect("/access/denied");
  const actor = masterActor(ctx);
  const encounter = query.encounter ? readVisitEncounter(getDb(), actor, query.encounter) : null;
  if (!query.patient || !encounter || encounter.patient_id !== query.patient) redirect("/clinical");
  if (encounter.status === "completed") redirect(`/clinical?patient=${query.patient}&encounter=${query.encounter}&error=source-closed`);
  const practitioners = listPractitioners(getDb(), actor).filter((row) => row.status === "active");
  const choices = getClinicalCodeChoices(getDb(),ctx,"condition");
  return (
    <Shell ctx={ctx} current="clinical">
      <PageHeader section="Clinical records" href="/clinical" icon="stethoscope" description={<>Choose a catalog term. This screen does not infer a diagnosis from vital signs.</>}><h1 className="page-title">Record a condition</h1></PageHeader>
      <section className="page-form card"><form className="form-grid" action="/api/clinical/conditions" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <ClinicalCodePicker label="Term" choices={choices}/>
        <label className="field">Clinical status
          <select aria-label="Clinical status" name="clinicalStatus" defaultValue="active"><option value="active">Active problem</option><option value="historical">Historical problem</option></select>
        </label>
        <label className="field">Verification
          <select aria-label="Verification" name="verificationStatus" defaultValue="unconfirmed"><option value="unconfirmed">Unconfirmed</option><option value="confirmed">Confirmed by the author</option></select>
        </label>
        <label className="field">Practitioner
          <select aria-label="Practitioner" name="practitionerId" defaultValue={encounter.practitioner_id} required>{practitioners.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}</select>
        </label>
        <label className="field">Onset date
          <input name="onsetDate" type="date" />
        </label>
        <button className="btn-dark" type="submit">Save condition</button>
      </form></section>
    </Shell>
  );
}
