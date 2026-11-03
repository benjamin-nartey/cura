import { effectivePermissions, getDb, listPrivacySecurityAlerts } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyAlertsPage({ searchParams }: { searchParams: Promise<{ severity?: string; status?: string; category?: string; q?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.alert.read")) {
    return <Shell ctx={ctx} current="telemetry"><h1 className="page-title">Privacy alerts are limited to authorized reviewers.</h1></Shell>;
  }
  const needle = (query.q ?? "").trim().toLowerCase();
  const rows = listPrivacySecurityAlerts(getDb(), privacyActor(ctx)).filter((row) => {
    if (query.severity && row.severity !== query.severity) return false;
    if (query.status && row.status !== query.status) return false;
    if (query.category && row.category !== query.category) return false;
    if (needle && !`${row.rule_id} ${row.source_ref} ${row.category}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  return (
    <Shell ctx={ctx} current="telemetry">
      <h1 className="page-title">Privacy alerts</h1>
      <form method="get">
        <label>Search <input name="q" defaultValue={query.q ?? ""} /></label>
        <label>Severity
          <select name="severity" defaultValue={query.severity ?? ""}>
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Any</option>
            <option value="delivered">Delivered</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="investigating">Investigating</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False positive</option>
            <option value="delivery_failed">Delivery failed</option>
          </select>
        </label>
        <label>Category
          <select name="category" defaultValue={query.category ?? ""}>
            <option value="">Any</option>
            <option value="export">Export</option>
            <option value="emergency">Emergency</option>
            <option value="consent">Consent</option>
            <option value="retention">Retention</option>
            <option value="telemetry">Telemetry</option>
            <option value="cross-tenant">Cross-tenant</option>
            <option value="session">Session</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      {rows.length === 0 ? <p>No alerts match this organization.</p> : null}
      <div className="list">
        {rows.map((row) => <p key={row.id}><a href={`/privacy/alerts/${row.id}`}>{row.severity}</a> {row.category} {row.status} {row.rule_id}</p>)}
      </div>
    </Shell>
  );
}
