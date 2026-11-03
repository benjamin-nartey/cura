import { effectivePermissions, getDb, listSourceCatalog, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewMedicationPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.medication-order.draft")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.status === "completed") redirect(`/clinical?patient=${query.patient ?? ""}&encounter=${query.encounter ?? ""}&error=source-closed`);
  const catalog = listSourceCatalog();
  return (
    <Shell ctx={ctx} current="clinical">
      <h1 className="page-title">Medication draft</h1>
      <p className="lede"><strong>Synthetic draft — not a valid prescription.</strong> Nothing is signed, transmitted, or dispensed.</p>
      <form className="form-grid" action="/api/clinical/medication-orders" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <input type="hidden" name="practitionerId" value={encounter.practitioner_id} />
        <label className="field">Medication
          <select name="code" required>{catalog.medications.map((item) => <option key={item.code} value={item.code}>{item.display}</option>)}</select>
        </label>
        <label className="field">Dose in mg
          <input name="dose" type="number" min={1} max={4000} required />
        </label>
        <button className="btn-dark" type="submit">Save draft</button>
      </form>
    </Shell>
  );
}
