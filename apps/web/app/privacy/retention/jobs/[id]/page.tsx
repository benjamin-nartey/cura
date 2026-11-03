import { effectivePermissions, getDb, readRetentionJob } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionJobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.job.read")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Retention jobs are limited to authorized staff.</h1></Shell>;
  }
  try {
    const result = readRetentionJob(getDb(), retentionActor(ctx), id);
    const job = result.job;
    const items = result.items;
    return (
      <Shell ctx={ctx} current="retention">
        <p className="eyebrow">{job.status}</p>
        <h1 className="page-title">{job.job_type}</h1>
        <p>Success {job.success_count}. Skipped {job.skip_count}. Failed {job.failure_count}. Retries {job.retry_count}.</p>
        {items.length === 0 ? <p>No item outcomes are stored yet.</p> : null}
        <div className="list">
          {items.map((item) => <p key={item.resource_id}>{item.resource_id} {item.outcome} {item.failure_reason ?? ""}</p>)}
        </div>
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">That retention job is not available.</h1></Shell>;
  }
}
