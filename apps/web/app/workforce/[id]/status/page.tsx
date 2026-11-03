import { Shell } from "@/components/shell";
import { facilitiesFor, loadWorkforce, memberOrDeny } from "@/lib/workforce";

export default async function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await loadWorkforce();
  const member = memberOrDeny(ctx, id);
  const facilities = facilitiesFor(ctx);
  const names = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const current = member.memberships.find((membership) => membership.status === "active") ?? member.memberships[0];
  return (
    <Shell ctx={ctx} current="workforce" title="Membership status">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Status</p>
          <h1 className="page-title">Suspend or reactivate {member.name}</h1>
          <p className="lede">Facility suspension does not disable the account or another organization. Organization suspension is separate and needs organization authority.</p>
        </div>
      </header>
      <form className="panel card form-grid" method="post" action={`/api/workforce/${member.id}`}>
        <label className="field">Scope
          <select name="scope" defaultValue="facility">
            <option value="facility">This facility membership</option>
            <option value="organization">This organization membership</option>
          </select>
        </label>
        <label className="field">Facility
          <select name="facilityId" defaultValue={current?.facilityId ?? ""}>
            {member.memberships.map((membership) => (
              <option key={membership.facilityId} value={membership.facilityId}>{names.get(membership.facilityId) ?? membership.facilityId} · {membership.status}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="version" value={current?.version ?? member.organization?.version ?? 0} />
        <label className="field">Reason<input name="reason" required /></label>
        <button name="action" value="suspend" type="submit">Suspend</button>
        <button name="action" value="reactivate" type="submit">Reactivate</button>
      </form>
    </Shell>
  );
}
