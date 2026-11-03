import { Shell } from "@/components/shell";
import { facilitiesFor, historyFor, loadWorkforce, memberOrDeny } from "@/lib/workforce";

export default async function StaffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const { ctx } = await loadWorkforce();
  const member = memberOrDeny(ctx, id);
  const facilities = facilitiesFor(ctx);
  const names = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const history = historyFor(ctx, id) as Array<{ action: string; reason: string; createdAt: string }>;
  return (
    <Shell ctx={ctx} current="workforce" title={member.name}>
      <header className="chart-head">
        <div>
          <p className="eyebrow">Staff</p>
          <h1 className="page-title">{member.name}</h1>
          <p className="lede">Account {member.accountStatus}. Identity provider {member.identityLinked ? "linked" : "not linked"}. Organization membership {member.organization?.status ?? "none"}.</p>
        </div>
      </header>
      {query.notice ? <p role="status">The change was saved.</p> : null}
      {query.error === "conflict" ? <p role="alert">This record changed. Refresh and review it again.</p> : null}
      {query.error && query.error !== "conflict" ? <p role="alert">The change was not saved.</p> : null}
      <section className="panel card">
        <h2>Memberships</h2>
        <ul>
          {member.memberships.map((membership) => (
            <li key={membership.id}>{names.get(membership.facilityId) ?? "Facility"} · {membership.role} · {membership.status}</li>
          ))}
        </ul>
        <h2>Roles</h2>
        <ul>
          {member.roles.map((role) => <li key={role.id}>{role.roleId} · {role.status}</li>)}
        </ul>
        <p><a href={`/workforce/${member.id}/access`}>Edit access</a> · <a href={`/workforce/${member.id}/transfer`}>Transfer</a> · <a href={`/workforce/${member.id}/status`}>Suspend or reactivate</a> · <a href={`/workforce/${member.id}/offboard`}>Offboard</a></p>
      </section>
      <section className="panel card">
        <h2>Activity</h2>
        {history.length === 0 ? <p>No workforce changes for this person.</p> : (
          <ul>{history.map((row, index) => <li key={`${row.createdAt}-${index}`}>{row.createdAt} · {row.action} · {row.reason}</li>)}</ul>
        )}
      </section>
    </Shell>
  );
}
