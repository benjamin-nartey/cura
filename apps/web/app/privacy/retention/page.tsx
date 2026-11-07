/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { effectivePermissions, getDb, retentionOverview } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionOverviewPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.policy.read") && !access.permissions.includes("legal-hold.read")) {
    return <Shell ctx={ctx} current="retention"><PageHeader section="Retention" href="/privacy/retention" icon="shieldCheck"><h1 className="page-title">Retention records are limited to authorized staff.</h1></PageHeader></Shell>;
  }
  const overview = access.permissions.includes("retention.policy.read")
    ? retentionOverview(getDb(), retentionActor(ctx))
    : { active: 0, archived: 0, disposed: 0, eligible: 0, held: 0, activeHolds: 0, failedJobs: 0 };
  return (
    <Shell ctx={ctx} current="retention">
      <PageHeader section="Retention" href="/privacy/retention" icon="shieldCheck" eyebrow={<>Experimental retention</>} description={<>Synthetic development policies only. A preview is not a deletion. Formal Phase 03 is not authorized.</>}><h1 className="page-title">Data retention</h1></PageHeader>
      {query.error === "forbidden" ? <p>That action is not available for this account.</p> : null}
      {query.error === "conflict" ? <p>The preview is stale or a hold changed. Generate a new preview.</p> : null}
      {query.error === "invalid" ? <p>The submitted values were not accepted.</p> : null}
      {query.notice === "held" ? <p>The legal hold is active. Disposal of the covered record is blocked.</p> : null}
      {query.notice === "released" ? <p>The hold is released. Records are not deleted until a new preview is executed.</p> : null}
      {query.notice === "disposed" ? <p>The approved disposal is complete. The operational record is no longer active.</p> : null}
      <div className="list">
        <p>Active {overview.active}</p>
        <p>Archived {overview.archived}</p>
        <p>Disposed {overview.disposed}</p>
        <p>Eligible {overview.eligible}</p>
        <p>Blocked by holds {overview.held}</p>
        <p>Active holds {overview.activeHolds}</p>
        <p>Jobs with failures {overview.failedJobs}</p>
      </div>
      {overview.active === 0 && overview.disposed === 0 ? <p>No retention records are available for this organization.</p> : null}
      <PageActions><a href="/privacy/retention/policies">Policy matrix</a></PageActions>
      <PageActions><a href="/privacy/retention/holds">Legal holds</a></PageActions>
      <PageActions><a href="/privacy/retention/dry-run">Retention preview</a></PageActions>
      <PageActions><a href="/privacy/retention/jobs">Jobs</a></PageActions>
      {access.permissions.includes("retention.audit.read") ? <p><a href="/privacy/retention/activity">Activity</a></p> : null}
      {access.permissions.includes("retention.evaluate") ? (
        <form action="/api/privacy/retention/records" method="post">
          <input type="hidden" name="idempotencyKey" value={`rec${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`} />
          <input type="hidden" name="category" value="temporary-admin" />
          <input type="hidden" name="retentionStart" value="2026-10-01T00:00:00.000Z" />
          <button type="submit">Create a retention test record</button>
        </form>
      ) : null}
    </Shell>
  );
}
