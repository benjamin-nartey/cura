/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { effectivePermissions, getDb, telemetryOverview } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyTelemetryPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.telemetry.read")) {
    return <Shell ctx={ctx} current="telemetry"><PageHeader section="Privacy telemetry" href="/privacy/telemetry" icon="shieldCheck"><h1 className="page-title">Privacy telemetry is limited to authorized reviewers.</h1></PageHeader></Shell>;
  }
  const overview = telemetryOverview(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="telemetry">
      <PageHeader section="Privacy telemetry" href="/privacy/telemetry" icon="shieldCheck" eyebrow={<>Privacy telemetry</>} description={<>Review potential privacy incidents and collection health. Detection thresholds support review and do not determine statutory breach obligations.</>}><h1 className="page-title">Privacy and security overview</h1></PageHeader>
      {query.notice === "canary-pass" ? <p>The canary check passed. The stored telemetry does not contain the submitted marker.</p> : null}
      {query.error ? <p>That telemetry action was not completed.</p> : null}
      <div className="list">
        <p>Alerts {overview.alerts}</p>
        <p>Unresolved {overview.open}</p>
        <p>Export signals {overview.exports}</p>
        <p>Sanitized events {overview.sink}</p>
        <p>Sanitizer failures {overview.sanitizerFailures}</p>
        <p>Collector {overview.health.collector}</p>
        <p>Destination {overview.health.destination}</p>
      </div>
      {overview.alerts === 0 ? <p>No privacy alerts have been recorded for this organization.</p> : null}
      <PageActions><a href="/privacy/alerts">Privacy alerts</a></PageActions>
      <PageActions><a href="/privacy/telemetry/health">Pipeline health</a></PageActions>
      <PageActions><a href="/privacy/telemetry/rules">Detection rules</a></PageActions>
      <PageActions><a href="/privacy/telemetry/policy">Scrubbing policy</a></PageActions>
      {access.permissions.includes("privacy.telemetry.test") ? <p><a href="/privacy/telemetry/canary">Telemetry validation console</a></p> : null}
    </Shell>
  );
}
