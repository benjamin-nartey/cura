/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, listWorkCatalog, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.plan.record")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.status === "completed") redirect(`/work?patient=${query.patient ?? ""}&encounter=${query.encounter ?? ""}&error=source-closed`);
  const catalog = listWorkCatalog();
  return (
    <Shell ctx={ctx} current="work">
      <PageHeader section="Care coordination" href="/work" icon="checklist" description={<>The owner and due date are explicit. This screen does not generate a treatment plan.</>}><h1 className="page-title">Care plan</h1></PageHeader>
      <section className="page-form card"><form className="form-grid" action="/api/work/plans" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <input type="hidden" name="practitionerId" value={encounter.practitioner_id} />
        <label className="field">Plan
          <select aria-label="Plan" name="code" required>{catalog.plans.map((item) => <option key={item.code} value={item.code}>{item.display}</option>)}</select>
        </label>
        <label className="field">Owner user
          <input name="ownerUserId" required defaultValue={ctx.userId} />
        </label>
        <label className="field">Due date
          <input name="dueOn" type="date" required defaultValue="2026-10-29" />
        </label>
        <button className="btn-dark" type="submit">Save care plan</button>
      </form></section>
    </Shell>
  );
}
