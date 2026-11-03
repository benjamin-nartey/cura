import { effectivePermissions, getDb, listRetentionJobs } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionJobsPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.job.read")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Retention jobs are limited to authorized staff.</h1></Shell>;
  }
  const jobs = listRetentionJobs(getDb(), retentionActor(ctx)) as Array<{ id: string; job_type: string; status: string; success_count: number; skip_count: number; failure_count: number }>;
  return (
    <Shell ctx={ctx} current="retention">
      <h1 className="page-title">Retention jobs</h1>
      {jobs.length === 0 ? <p>No retention jobs are stored for this organization.</p> : null}
      <div className="list">
        {jobs.map((job) => (
          <p key={job.id}><a href={`/privacy/retention/jobs/${job.id}`}>{job.job_type}</a> {job.status} success {job.success_count} skipped {job.skip_count} failed {job.failure_count}</p>
        ))}
      </div>
    </Shell>
  );
}
