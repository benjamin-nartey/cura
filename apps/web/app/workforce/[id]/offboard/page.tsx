/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { facilitiesFor, loadWorkforce, memberOrDeny } from "@/lib/workforce";

export default async function OffboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await loadWorkforce();
  const member = memberOrDeny(ctx, id);
  const facilities = facilitiesFor(ctx);
  const names = new Map(facilities.map((facility) => [facility.id, facility.name]));
  return (
    <Shell ctx={ctx} current="workforce" title="Offboard staff">
      <header className="chart-head">
        <div>
          <PageHeader section="Workforce" href="/workforce" icon="users" eyebrow={<>Offboarding</>} description={<>This revokes organization and facility memberships in {ctx.organizationName}. History stays. Another organization is not changed. The last organization administrator cannot be removed here.</>}><h1 className="page-title">End access for {member.name}</h1></PageHeader>
        </div>
      </header>
      <section className="panel card">
        <ul>
          {member.memberships.map((membership) => <li key={membership.id}>{names.get(membership.facilityId) ?? "Facility"} · {membership.status}</li>)}
        </ul>
      </section>
      <form className="panel card" method="post" action={`/api/workforce/${member.id}`}>
        <input type="hidden" name="action" value="revoke" />
        <input type="hidden" name="version" value={member.organization?.version ?? 0} />
        <label>Reason<input name="reason" required /></label>
        <button type="submit">Confirm offboarding</button>
      </form>
    </Shell>
  );
}
