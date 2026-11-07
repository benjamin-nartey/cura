/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readPrivacySecurityAlert } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyAlertDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.alert.read")) {
    return <Shell ctx={ctx} current="telemetry"><PageHeader section="Privacy alerts" href="/privacy/alerts" icon="shieldCheck"><h1 className="page-title">Privacy alerts are limited to authorized reviewers.</h1></PageHeader></Shell>;
  }
  try {
    const row = readPrivacySecurityAlert(getDb(), privacyActor(ctx), id);
    return (
      <Shell ctx={ctx} current="telemetry">
        <PageHeader section="Privacy alerts" href="/privacy/alerts" icon="shieldCheck" eyebrow={<>{row.severity}</>}><h1 className="page-title">{row.status}</h1></PageHeader>
        {query.error === "forbidden" ? <p>That action is not available for this account.</p> : null}
        {query.error === "conflict" ? <p>The alert changed or delivery is unavailable. Refresh and use the current state.</p> : null}
        {query.notice === "acknowledged" ? <p>The alert is acknowledged.</p> : null}
        {query.notice === "investigating" ? <p>The investigation note was stored after scrubbing.</p> : null}
        {query.notice === "resolved" ? <p>The disposition is recorded.</p> : null}
        {query.notice === "escalated" ? <p>The alert is escalated.</p> : null}
        <p>Rule {row.rule_id} version {row.rule_version}. Category {row.category}. Source {row.source_ref}.</p>
        <p>Actor {row.actor_id}. Facility {row.facility_id ?? "organization"}.</p>
        {row.events.length === 0 ? <p>No investigation history is stored.</p> : null}
        <div className="list">
          {row.events.map((event, index) => <p key={`${event.action}-${index}`}>{event.action} {event.result} {event.actor_id}</p>)}
        </div>
        {access.permissions.includes("privacy.alert.acknowledge") && ["delivered", "queued", "detected"].includes(row.status) ? (
          <form action={`/api/privacy/alerts/${row.id}/acknowledge`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <button type="submit">Acknowledge alert</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.alert.investigate") && ["acknowledged", "investigating", "escalated"].includes(row.status) ? (
          <form action={`/api/privacy/alerts/${row.id}/investigate`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <label>Investigation note <input name="note" defaultValue="Reviewed the safe export count." /></label>
            <button type="submit">Record investigation</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.alert.investigate") && ["acknowledged", "investigating", "escalated"].includes(row.status) ? (
          <>
            <form action={`/api/privacy/alerts/${row.id}/resolve`} method="post">
              <input type="hidden" name="expectedVersion" value={row.version} />
              <input type="hidden" name="disposition" value="confirmed" />
              <button type="submit">Resolve as confirmed</button>
            </form>
            <form action={`/api/privacy/alerts/${row.id}/resolve`} method="post">
              <input type="hidden" name="expectedVersion" value={row.version} />
              <input type="hidden" name="disposition" value="false_positive" />
              <button type="submit">Record false positive</button>
            </form>
            {row.status === "escalated" ? null : (
              <form action={`/api/privacy/alerts/${row.id}/escalate`} method="post">
                <input type="hidden" name="expectedVersion" value={row.version} />
                <button type="submit">Escalate alert</button>
              </form>
            )}
          </>
        ) : null}
        {access.permissions.includes("privacy.alert.investigate") && row.status === "delivery_failed" ? (
          <form action={`/api/privacy/alerts/${row.id}/retry`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <button type="submit">Retry notification</button>
          </form>
        ) : null}
      </Shell>
    );
  } catch (error) {
    if (error instanceof NotFoundError) return <Shell ctx={ctx} current="telemetry"><PageHeader section="Privacy alerts" href="/privacy/alerts" icon="shieldCheck"><h1 className="page-title">That privacy alert is not available.</h1></PageHeader></Shell>;
    throw error;
  }
}
