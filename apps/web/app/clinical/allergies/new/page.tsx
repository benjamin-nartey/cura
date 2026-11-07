/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { ClinicalCodePicker } from "@/components/clinical-code-picker";
import { effectivePermissions, getDb, getClinicalCodeChoices, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewAllergyPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.allergy.record")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.status === "completed") redirect(`/clinical?patient=${query.patient ?? ""}&encounter=${query.encounter ?? ""}&error=source-closed`);
  const choices = getClinicalCodeChoices(getDb(),ctx,"allergy");
  return (
    <Shell ctx={ctx} current="clinical">
      <PageHeader section="Clinical records" href="/clinical" icon="stethoscope" description={<>Unknown allergy status is a separate entry from no known allergies. Severity is stored only when the author selects it.</>}><h1 className="page-title">Record allergy information</h1></PageHeader>
      <section className="page-form card"><form className="form-grid" action="/api/clinical/allergies" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <input type="hidden" name="practitionerId" value={encounter.practitioner_id} />
        <ClinicalCodePicker label="Information" choices={choices}/>
        <label className="field">Verification
          <select aria-label="Verification" name="verificationStatus" defaultValue="unconfirmed"><option value="unconfirmed">Unconfirmed</option><option value="confirmed">Confirmed by the author</option></select>
        </label>
        <label className="field">Criticality, only for a documented allergy
          <select aria-label="Criticality, only for a documented allergy" name="criticality" defaultValue=""><option value="">Not documented</option><option value="low">Low</option><option value="high">High</option><option value="unable-to-assess">Unable to assess</option></select>
        </label>
        <button className="btn-dark" type="submit">Save allergy information</button>
      </form></section>
    </Shell>
  );
}
