import { effectivePermissions, getDb, listBillingCatalog, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

export default async function NewChargePage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("billing.charge.create")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.patient_id !== query.patient) redirect("/billing");
  const catalog = listBillingCatalog(getDb(), masterActor(ctx));
  return (
    <Shell ctx={ctx} current="billing">
      <h1 className="page-title">Create charge</h1>
      <p className="lede"><strong>Not an invoice.</strong> Record a charge against the encounter. No payment is due from this screen.</p>
      <form className="form-grid" action="/api/billing/charges" method="post">
        <input type="hidden" name="submissionKey" value={randomUUID()} />
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <label className="field">Catalog item
          <select name="catalogId" required>
            {catalog.items.map((item) => <option key={item.id} value={item.id}>{item.display} · {item.currency} {(item.unit_price_minor / 100).toFixed(item.minor_units)}</option>)}
          </select>
        </label>
        <label className="field">Quantity
          <input name="quantity" type="number" min={1} max={100} defaultValue={1} required />
        </label>
        <button className="btn-dark" type="submit">Save charge</button>
      </form>
    </Shell>
  );
}
