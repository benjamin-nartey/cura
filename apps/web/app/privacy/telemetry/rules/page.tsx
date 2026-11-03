import { effectivePermissions, getDb, listTelemetryRules } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function TelemetryRulesPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.rule.read")) {
    return <Shell ctx={ctx} current="telemetry"><h1 className="page-title">Detection rules are limited to authorized reviewers.</h1></Shell>;
  }
  const rules = listTelemetryRules(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="telemetry">
      <h1 className="page-title">Detection rules</h1>
      <p>Thresholds are synthetic engineering values with approval state pending_policy_approval. This screen cannot disable scrubbing.</p>
      {rules.length === 0 ? <p>No detection rules are stored.</p> : null}
      <div className="list">
        {rules.map((rule) => <p key={rule.id}>{rule.id} {rule.category} threshold {rule.threshold} {rule.severity} version {rule.version} {rule.status}</p>)}
      </div>
      {access.permissions.includes("privacy.rule.manage") ? <p>Rule changes are available to the privacy engineer role.</p> : <p>This account cannot change thresholds.</p>}
    </Shell>
  );
}
