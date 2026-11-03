import { effectivePermissions, getDb, listRetentionPolicies } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionPoliciesPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.policy.read")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Retention policies are limited to authorized staff.</h1></Shell>;
  }
  const policies = listRetentionPolicies(getDb(), retentionActor(ctx));
  return (
    <Shell ctx={ctx} current="retention">
      <h1 className="page-title">Retention policy matrix</h1>
      <p className="lede">These are synthetic development rules. They are not approved production retention periods and they are not a statement of Ghanaian or European law.</p>
      {policies.length === 0 ? <p>No retention policies are stored for this organization.</p> : null}
      <div className="list">
        {policies.map((policy) => (
          <article className="row" key={policy.id}>
            <strong>{policy.category}</strong>
            <span>{policy.jurisdiction}</span>
            <span>{policy.trigger_event}</span>
            <span>{policy.duration ?? "none"} {policy.duration_unit ?? ""}</span>
            <span>{policy.expiry_action}</span>
            <span>v{policy.version}</span>
            <span>{policy.approval_state}</span>
            {access.permissions.includes("retention.policy.manage") && policy.expiry_action !== "retain" ? (
              <form action={`/api/privacy/retention/policies/${policy.id}`} method="post">
                <input type="hidden" name="expectedVersion" value={policy.version} />
                <label>Days <input name="duration" type="number" min={1} defaultValue={policy.duration ?? 1} required /></label>
                <input type="hidden" name="durationUnit" value="day" />
                <button type="submit">Save a new version</button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </Shell>
  );
}
