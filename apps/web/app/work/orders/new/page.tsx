import { ClinicalCodePicker } from "@/components/clinical-code-picker";
import { effectivePermissions, getDb, listWorkCatalog, getClinicalCodeChoices, getWorkCatalogCodeChoices, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.order.submit")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.patient_id !== query.patient) redirect("/work");
  if (encounter.status === "completed") redirect(`/work?patient=${query.patient}&encounter=${query.encounter}&error=source-closed`);
  const catalog = listWorkCatalog();
  const choices=getClinicalCodeChoices(getDb(),ctx,"work-order"),catalogChoices=getWorkCatalogCodeChoices(getDb(),ctx);
  return (
    <Shell ctx={ctx} current="work">
      <h1 className="page-title">Department request</h1>
      <p className="lede"><strong>Not a transmitted order.</strong> Save a department request for internal coordination. It does not produce a result or a prescription.</p>
      <form className="form-grid" action="/api/work/orders" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <input type="hidden" name="practitionerId" value={encounter.practitioner_id} />
        <ClinicalCodePicker label="Request" choices={choices} catalogChoices={catalogChoices}/>
        <label className="field">Department
          <select name="departmentId" defaultValue="dep_gh_madina_lab" required>{catalog.departments.map((item) => <option key={item.id} value={item.id}>{item.display}</option>)}</select>
        </label>
        <label className="field">Priority
          <select name="priority" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option></select>
        </label>
        <label className="field">Due date
          <input name="dueOn" type="date" required defaultValue="2026-10-23" />
        </label>
        <button className="btn-dark" type="submit">Save request</button>
      </form>
    </Shell>
  );
}
