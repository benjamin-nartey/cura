import { effectivePermissions, getDb, readDryRun } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionDryRunPage({ searchParams }: { searchParams: Promise<{ id?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.dry-run") && !access.permissions.includes("retention.job.read")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Retention previews are limited to authorized staff.</h1></Shell>;
  }
  let plan: ReturnType<typeof readDryRun> | null = null;
  if (query.id && access.permissions.includes("retention.dry-run")) {
    try {
      plan = readDryRun(getDb(), retentionActor(ctx), query.id);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  const dry = plan?.dry as { id?: string; eligible_count?: number; held_count?: number; review_count?: number; missing_count?: number; status?: string } | undefined;
  return (
    <Shell ctx={ctx} current="retention">
      <h1 className="page-title">Retention preview</h1>
      <p className="lede">This is a preview. It does not delete or archive anything until a separate execute step is authorized.</p>
      {query.error === "conflict" ? <p>That preview is stale, changed, or blocked by a newer hold or policy. Create another preview.</p> : null}
      {query.error === "forbidden" ? <p>This account cannot execute retention.</p> : null}
      {query.notice === "preview" ? <p>Preview completed. Counts below are from the stored plan.</p> : null}
      {query.notice === "blocked" ? <p>Execution stopped. No newly protected record was disposed.</p> : null}
      {query.notice === "unchanged" ? <p>This preview was run again. No additional record was archived or disposed.</p> : null}
      {query.notice === "disposed" ? <p>Disposal completed for records that were still eligible.</p> : null}
      {query.notice === "archived" ? <p>Archive completed for records that were still eligible.</p> : null}
      {!query.id ? <p>No preview is selected.</p> : null}
      {query.id && !plan ? <p>That preview is not available.</p> : null}
      {dry ? (
        <div className="list">
          <p>Eligible {dry.eligible_count}</p>
          <p>Blocked by holds {dry.held_count}</p>
          <p>Needs review {dry.review_count}</p>
          <p>Missing policy {dry.missing_count}</p>
          <p>Status {dry.status}</p>
          {(plan?.items as Array<{ resource_id: string; decision: string }> | undefined)?.map((item) => <p key={item.resource_id}>{item.resource_id} {item.decision}</p>)}
        </div>
      ) : null}
      {access.permissions.includes("retention.dry-run") ? (
        <form action="/api/privacy/retention/dry-runs" method="post">
          <input type="hidden" name="idempotencyKey" value={`dry${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`} />
          <button type="submit">Create preview</button>
        </form>
      ) : null}
      {access.permissions.includes("retention.execute") && dry?.id ? (
        <form action="/api/privacy/retention/jobs" method="post">
          <input type="hidden" name="dryRunId" value={dry.id} />
          <input type="hidden" name="mode" value="dispose" />
          <input type="hidden" name="idempotencyKey" value={`exe${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`} />
          <button type="submit">Execute eligible disposals</button>
        </form>
      ) : null}
    </Shell>
  );
}
