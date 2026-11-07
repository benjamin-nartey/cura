/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, listPrivacyAlerts } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyMonitorPage({ searchParams }: { searchParams: Promise<{ notice?: string; count?: string; error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.audit.read")) {
    return <Shell ctx={ctx} current="requests"><PageHeader section="Data exports" href="/privacy/exports" icon="shieldCheck"><h1 className="page-title">Bulk export monitoring is limited to authorized reviewers.</h1></PageHeader></Shell>;
  }
  const alerts = listPrivacyAlerts(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="requests">
      <PageHeader section="Data exports" href="/privacy/exports" icon="shieldCheck"><h1 className="page-title">Bulk export monitoring</h1></PageHeader>
      <p>Exports of 1,000 or more records are flagged for review. This workspace threshold is not a legal reporting threshold.</p>
      {query.notice === "cleaned" ? <p>Cleanup recorded for {query.count} expired artifacts. Archive and backup copies were not verified.</p> : null}
      {query.error ? <p>Cleanup did not run.</p> : null}
      {access.permissions.includes("privacy.export.revoke") ? (
        <form action="/api/privacy/exports/cleanup" method="post">
          <button type="submit">Clean expired artifacts</button>
        </form>
      ) : null}
      {alerts.length === 0 ? <p>No monitoring alerts are stored.</p> : null}
      <div className="list">
        {alerts.map((alert) => <p key={alert.id}>{alert.kind} {alert.export_id ?? "request"} count {alert.record_count}</p>)}
      </div>
    </Shell>
  );
}
