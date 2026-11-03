import { effectivePermissions, getDb, privacyOverview } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.request.read") && !access.permissions.includes("privacy.audit.read")) {
    return <Shell ctx={ctx} current="requests"><h1 className="page-title">Privacy requests are limited to authorized staff.</h1></Shell>;
  }
  const overview = privacyOverview(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="requests">
      <p className="eyebrow">Experimental privacy requests</p>
      <h1 className="page-title">Privacy requests</h1>
      <p className="lede">Synthetic DSAR and bulk export only. A request is not approval, and approval is not a download. Formal Phase 03 is not authorized.</p>
      {query.error === "forbidden" ? <p>That action is not available for this account.</p> : null}
      {query.error === "conflict" ? <p>The request changed or is not in the required state.</p> : null}
      {query.notice === "submitted" ? <p>The request is recorded and is waiting for verification.</p> : null}
      <div className="list">
        <p>Total {overview.total}</p>
        <p>Pending verification {overview.pendingVerification}</p>
        <p>Under review {overview.review}</p>
        <p>Approved {overview.approved}</p>
        <p>Processing {overview.processing}</p>
        <p>Ready or fulfilled {overview.fulfilled}</p>
        <p>Denied {overview.denied}</p>
        <p>Overdue under the simulation policy {overview.overdue}</p>
      </div>
      {overview.total === 0 ? <p>No privacy requests are stored for this organization.</p> : null}
      <p><a href="/privacy/requests/directory">Request directory</a></p>
      <p><a href="/privacy/requests/new">Submit a request</a></p>
      <p><a href="/privacy/exports">Export center</a></p>
      {access.permissions.includes("privacy.audit.read") ? <p><a href="/privacy/exports/monitor">Bulk monitoring</a></p> : null}
      {access.permissions.includes("privacy.audit.read") ? <p><a href="/privacy/requests/activity">Activity</a></p> : null}
    </Shell>
  );
}
