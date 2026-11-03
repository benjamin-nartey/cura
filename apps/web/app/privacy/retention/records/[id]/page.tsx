import { effectivePermissions, evaluateRetention, getDb, readRetentionRecord } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.evaluate")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Retention records are limited to authorized staff.</h1></Shell>;
  }
  try {
    const row = readRetentionRecord(getDb(), retentionActor(ctx), id);
    const decision = evaluateRetention(getDb(), retentionActor(ctx), { resourceType: row.category, resourceId: row.id });
    return (
      <Shell ctx={ctx} current="retention">
        <p className="eyebrow">{row.lifecycle_status}</p>
        <h1 className="page-title">{row.id}</h1>
        <p>Category {row.category}. Started {row.retention_start}. Version {row.version}.</p>
        <p>Policy {decision.policyId ?? "none"} v{decision.policyVersion ?? "none"}. Jurisdiction {decision.jurisdiction ?? "unknown"}.</p>
        <p>Expiry {decision.expiryAt ?? "not calculated"}. Decision {decision.decision}. Reason {decision.reason}.</p>
        <p>Hold {decision.holdId ?? "none"}.</p>
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">That retention record is not available.</h1></Shell>;
  }
}
