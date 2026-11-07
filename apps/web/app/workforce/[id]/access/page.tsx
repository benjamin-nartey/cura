/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { facilitiesFor, loadWorkforce, memberOrDeny } from "@/lib/workforce";

const ROLES = ["nurse", "doctor", "receptionist", "laboratory-scientist", "billing-officer", "auditor", "facility-administrator"];

export default async function AccessEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await loadWorkforce();
  const member = memberOrDeny(ctx, id);
  const facilities = facilitiesFor(ctx);
  const names = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const current = member.memberships.find((membership) => membership.status === "active");
  return (
    <Shell ctx={ctx} current="workforce" title="Edit access">
      <header className="chart-head">
        <div>
          <PageHeader section="Workforce" href="/workforce" icon="users" eyebrow={<>Access</>} description={<>The server checks this change again. A preview on this page is not permission to grant it. No administrator role is selected.</>}><h1 className="page-title">Edit access for {member.name}</h1></PageHeader>
        </div>
      </header>
      <form className="panel card form-grid" method="post" action={`/api/workforce/${member.id}`}>
        <input type="hidden" name="action" value="role" />
        <input type="hidden" name="assurance" value="mfa" />
        <label className="field">Facility
          <select aria-label="Facility" name="facilityId" required defaultValue={current?.facilityId ?? ""}>
            {member.memberships.filter((membership) => membership.status === "active").map((membership) => (
              <option key={membership.facilityId} value={membership.facilityId}>{names.get(membership.facilityId) ?? membership.facilityId}</option>
            ))}
          </select>
        </label>
        <label className="field">Role
          <select aria-label="Role" name="roleId" required defaultValue="">
            <option value="" disabled>Choose a role</option>
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        <input type="hidden" name="version" value={current?.version ?? 0} />
        <label className="field">Reason<input name="reason" required /></label>
        <p className="lede">Before: {current ? `${current.role} at ${names.get(current.facilityId) ?? "the facility"}` : "no active membership"}. After: the role you select, only if the server commits it.</p>
        <button type="submit">Confirm role change</button>
      </form>
      <section className="panel card">
        <SectionHeading icon="users"><h2>Remove a role</h2></SectionHeading>
        {member.roles.filter((role) => role.status === "active").map((role) => (
          <form key={role.id} method="post" action={`/api/workforce/${member.id}`}>
            <input type="hidden" name="action" value="revoke-role" />
            <input type="hidden" name="assignmentId" value={role.id} />
            <input type="hidden" name="version" value={role.version} />
            <input type="hidden" name="assurance" value="mfa" />
            <button type="submit">Remove {role.roleId}</button>
          </form>
        ))}
      </section>
    </Shell>
  );
}
