/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { facilitiesFor, loadWorkforce, memberOrDeny } from "@/lib/workforce";

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await loadWorkforce();
  const member = memberOrDeny(ctx, id);
  const facilities = facilitiesFor(ctx);
  const names = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const current = member.memberships.find((membership) => membership.status === "active");
  return (
    <Shell ctx={ctx} current="workforce" title="Transfer staff">
      <header className="chart-head">
        <div>
          <PageHeader section="Workforce" href="/workforce" icon="users" eyebrow={<>Transfer</>} description={<>A transfer revokes the source facility and opens the destination. Other facility memberships stay as they are.</>}><h1 className="page-title">Move {member.name}</h1></PageHeader>
        </div>
      </header>
      <form className="panel card form-grid" method="post" action={`/api/workforce/${member.id}`}>
        <input type="hidden" name="action" value="transfer" />
        <label className="field">From
          <select aria-label="From" name="fromFacilityId" required defaultValue={current?.facilityId ?? ""}>
            {member.memberships.filter((membership) => membership.status === "active").map((membership) => (
              <option key={membership.facilityId} value={membership.facilityId}>{names.get(membership.facilityId) ?? membership.facilityId}</option>
            ))}
          </select>
        </label>
        <label className="field">To
          <select aria-label="To" name="facilityId" required defaultValue="">
            <option value="" disabled>Choose a destination</option>
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
          </select>
        </label>
        <input type="hidden" name="version" value={current?.version ?? 0} />
        <label className="field">Reason<input name="reason" required /></label>
        <button type="submit">Confirm transfer</button>
      </form>
      <form className="panel card form-grid" method="post" action={`/api/workforce/${member.id}`}>
        <input type="hidden" name="action" value="add-facility" />
        <SectionHeading icon="users"><h2>Add a facility without removing the current one</h2></SectionHeading>
        <label className="field">Facility
          <select aria-label="Facility" name="facilityId" required defaultValue="">
            <option value="" disabled>Choose a facility</option>
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
          </select>
        </label>
        <input type="hidden" name="roleId" value={current?.role ?? "nurse"} />
        <label className="field">Reason<input name="reason" required /></label>
        <button type="submit">Add facility</button>
      </form>
    </Shell>
  );
}
