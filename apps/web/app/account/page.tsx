import { Shell } from "@/components/shell";
import { purposeLabel, roleLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AccountPage() {
  const ctx = await requireSession();
  return (
    <Shell ctx={ctx} current="account">
      <section className="card account-card">
        <p className="metric-label">Directory identity</p>
        <h2>{ctx.displayName}</h2>
        <p className="lede">Name, role, facility, and purpose of use come from the directory. This page does not change them.</p>
        <dl className="account-facts">
          <div>
            <dt>Role</dt>
            <dd>{roleLabel(ctx.role)}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{ctx.organizationName}</dd>
          </div>
          <div>
            <dt>Facility</dt>
            <dd>{ctx.facilityName ?? "None on this directory entry"}</dd>
          </div>
          <div>
            <dt>Purpose of use</dt>
            <dd>{purposeLabel(ctx.purposeOfUse)}</dd>
          </div>
        </dl>
        <form action="/api/session/end" method="post">
          <button className="btn-dark" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </Shell>
  );
}
