import { effectivePermissions, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function ExportCenterPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.request.read")) {
    return <Shell ctx={ctx} current="requests"><h1 className="page-title">Exports are limited to authorized staff.</h1></Shell>;
  }
  const rows = getDb().prepare(`SELECT id, status, monitoring, record_count, subject_id FROM privacy_exports WHERE organization_id = ? ORDER BY created_at`).all(ctx.organizationId) as Array<{ id: string; status: string; monitoring: string; record_count: number; subject_id: string }>;
  return (
    <Shell ctx={ctx} current="requests">
      <h1 className="page-title">Export center</h1>
      {query.error ? <p>The export action did not complete.</p> : null}
      {query.notice === "ready" ? <p>The export artifact is ready. It is not a public file.</p> : null}
      {rows.length === 0 ? <p>No exports are stored for this organization.</p> : null}
      <div className="list">
        {rows.map((row) => <p key={row.id}><a href={`/privacy/exports/${row.id}`}>{row.status}</a> {row.monitoring} {row.subject_id} records {row.record_count}</p>)}
      </div>
    </Shell>
  );
}
