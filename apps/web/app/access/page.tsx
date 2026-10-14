import { devDirectoryEnabled, effectivePermissions, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function AccessPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  return (
    <Shell ctx={ctx} current="access" title="Access">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Authorization</p>
          <h1 className="page-title">Your access</h1>
          <p className="lede">
            These roles and permissions apply to {ctx.organizationName}
            {ctx.facilityName ? ` at ${ctx.facilityName}` : ""}. They are evaluated on the server for this session.
          </p>
        </div>
      </header>
      <section className="panel card">
        <h2>Roles</h2>
        <ul>
          {access.roles.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
        <h2>Permissions</h2>
        <ul>
          {access.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
        <p className="lede">{access.review}</p>
        <p className="lede">Sensitive role changes require a fresh MFA session. Emergency elevation is not available.</p>
        {devDirectoryEnabled() ? <p><a href="/access/diagnose">Local policy check</a></p> : null}
      </section>
    </Shell>
  );
}
