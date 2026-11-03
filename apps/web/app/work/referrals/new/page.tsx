import { effectivePermissions, getDb, listWorkCatalog, readVisitEncounter } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function NewReferralPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.referral.submit")) redirect("/access/denied");
  const encounter = query.encounter ? readVisitEncounter(getDb(), masterActor(ctx), query.encounter) : null;
  if (!query.patient || !encounter || encounter.status === "completed") redirect(`/work?patient=${query.patient ?? ""}&encounter=${query.encounter ?? ""}&error=source-closed`);
  const catalog = listWorkCatalog();
  return (
    <Shell ctx={ctx} current="work">
      <h1 className="page-title">Referral</h1>
      <p className="lede">The destination facility must accept or decline the referral. Nothing is sent to an external service.</p>
      <form className="form-grid" action="/api/work/referrals" method="post">
        <input type="hidden" name="patientId" value={query.patient} />
        <input type="hidden" name="encounterId" value={query.encounter} />
        <input type="hidden" name="practitionerId" value={encounter.practitioner_id} />
        <label className="field">Referral
          <select name="code" required>{catalog.referrals.map((item) => <option key={item.code} value={item.code}>{item.display}</option>)}</select>
        </label>
        <label className="field">Destination facility
          <select name="toFacilityId" required>
            <option value="fac_gh_madina">Madina Diagnostic Centre</option>
            <option value="fac_gh_east_legon">East Legon Family Clinic</option>
          </select>
        </label>
        <label className="field">Due date
          <input name="dueOn" type="date" required defaultValue="2026-10-28" />
        </label>
        <button className="btn-dark" type="submit">Save referral</button>
      </form>
    </Shell>
  );
}
