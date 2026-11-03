import { effectivePermissions, getDb, listPractitioners, listSourceCatalog, readVisitEncounter } from "@curasphere/domain";
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
  const catalog = listSourceCatalog();
  return (
    <Shell ctx={ctx} current="clinical">
      <h1 className="page-title">Record a condition</h1>
      <p className="lede">Choose a catalog term. This screen does not infer a diagnosis from vital signs.</p>
      <form className="form-grid" action="/api/clinical/conditions" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <label className="field">Term
          <select name="code" required>{catalog.conditions.map((item) => <option key={item.code} value={item.code}>{item.display}</option>)}</select>
        </label>
        <label className="field">Clinical status
          <select name="clinicalStatus" defaultValue="active"><option value="active">Active problem</option><option value="historical">Historical problem</option></select>
        </label>
        <label className="field">Verification
          <select name="verificationStatus" defaultValue="unconfirmed"><option value="unconfirmed">Unconfirmed</option><option value="confirmed">Confirmed by the author</option></select>
        </label>
        <label className="field">Practitioner
          <select name="practitionerId" defaultValue={encounter.practitioner_id} required>{practitioners.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}</select>
        </label>
        <label className="field">Onset date
          <input name="onsetDate" type="date" />
        </label>
        <button className="btn-dark" type="submit">Save condition</button>
      </form>
    </Shell>
  );
}
