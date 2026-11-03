import { effectivePermissions, getDb, readTelemetryPolicy } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function TelemetryPolicyPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.rule.read")) {
    return <Shell ctx={ctx} current="telemetry"><h1 className="page-title">Scrubbing policy is limited to authorized reviewers.</h1></Shell>;
  }
  try {
    const policy = readTelemetryPolicy(getDb(), privacyActor(ctx));
    return (
      <Shell ctx={ctx} current="telemetry">
        <h1 className="page-title">Scrubbing policy</h1>
        <p>Policy {policy.id} version {policy.version} is {policy.status}. Approval state {policy.approval_state}.</p>
        <p>Destination {policy.destination}. Excluded classes {policy.excluded_classes}.</p>
        <p>Allowed fields are an allowlist. Mandatory secret filtering cannot be turned off from this screen.</p>
        <p>Field count {policy.allowed_fields.split(",").filter(Boolean).length}.</p>
      </Shell>
    );
  } catch (error) {
    if (error instanceof NotFoundError) return <Shell ctx={ctx} current="telemetry"><h1 className="page-title">No scrubbing policy is stored for this organization.</h1></Shell>;
    throw error;
  }
}
