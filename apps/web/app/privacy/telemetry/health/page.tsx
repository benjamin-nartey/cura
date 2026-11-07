/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, telemetryOverview } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function TelemetryHealthPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.telemetry.read")) {
    return <Shell ctx={ctx} current="telemetry"><PageHeader section="Privacy telemetry" href="/privacy/telemetry" icon="shieldCheck"><h1 className="page-title">Pipeline health is limited to authorized reviewers.</h1></PageHeader></Shell>;
  }
  const overview = telemetryOverview(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="telemetry">
      <PageHeader section="Privacy telemetry" href="/privacy/telemetry" icon="shieldCheck"><h1 className="page-title">Telemetry pipeline health</h1></PageHeader>
      {query.notice === "collector-disconnected" ? <p>The collector is marked disconnected. New sensitive events stay in the sanitizer and are not sent to an external exporter.</p> : null}
      {query.notice === "collector-ready" ? <p>The collector is marked ready for the local debug destination.</p> : null}
      <p>Application sanitizer {overview.health.sanitizer}. Collector {overview.health.collector}. Destination {overview.health.destination}.</p>
      <p>Sanitizer failures {overview.sanitizerFailures}. This destination is the local debug collector, not an approved external exporter.</p>
      {access.permissions.includes("privacy.alert.investigate") ? (
        <>
          <form action="/api/privacy/telemetry/collector" method="post">
            <input type="hidden" name="collector" value="disconnected" />
            <button type="submit">Mark collector disconnected</button>
          </form>
          <form action="/api/privacy/telemetry/collector" method="post">
            <input type="hidden" name="collector" value="ready" />
            <button type="submit">Mark collector ready</button>
          </form>
        </>
      ) : null}
    </Shell>
  );
}
