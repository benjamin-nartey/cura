/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, listRetentionActivity } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function RetentionActivityPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("retention.audit.read")) {
    return <Shell ctx={ctx} current="retention"><PageHeader section="Retention" href="/privacy/retention" icon="shieldCheck"><h1 className="page-title">Retention activity is limited to authorized reviewers.</h1></PageHeader></Shell>;
  }
  const events = listRetentionActivity(getDb(), retentionActor(ctx));
  return (
    <Shell ctx={ctx} current="retention">
      <PageHeader section="Retention" href="/privacy/retention" icon="shieldCheck"><h1 className="page-title">Retention activity</h1></PageHeader>
      <p>These entries come from the access ledger. They do not include record contents.</p>
      {events.length === 0 ? <p>No retention events are stored for this organization.</p> : null}
      <div className="list">
        {events.map((event, index) => <p key={`${event.action}-${index}`}>{event.action} {event.resource_id} {event.outcome} {event.actor_id}</p>)}
      </div>
    </Shell>
  );
}
