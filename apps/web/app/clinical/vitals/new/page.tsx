import { effectivePermissions, getDb, listSourceCatalog, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewVitalsPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.observation.record")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.status === "completed") redirect(`/clinical?patient=${query.patient ?? ""}&encounter=${query.encounter ?? ""}&error=source-closed`);
  const catalog = listSourceCatalog();
  return (
    <Shell ctx={ctx} current="clinical">
      <h1 className="page-title">Record vital signs</h1>
      <p className="lede">Units come from the local synthetic catalog. A saved value is not a diagnosis.</p>
      <form className="form-grid" action="/api/clinical/observations" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <input type="hidden" name="practitionerId" value={encounter.practitioner_id} />
        <label className="field">Measurement
          <select name="code" required>
            {catalog.quantities.map((item) => <option key={item.code} value={item.code}>{item.display} ({item.unit})</option>)}
            <option value={catalog.pressure.code}>{catalog.pressure.display} (mm[Hg])</option>
          </select>
        </label>
        <label className="field">Value
          <input name="valueQuantity" type="number" step="0.1" />
        </label>
        <label className="field">Systolic, for blood pressure
          <input name="systolic" type="number" step="1" />
        </label>
        <label className="field">Diastolic, for blood pressure
          <input name="diastolic" type="number" step="1" />
        </label>
        <label className="field">Effective time
          <input name="effectiveAt" type="datetime-local" required />
        </label>
        <button className="btn-dark" type="submit">Save vital sign</button>
      </form>
    </Shell>
  );
}
