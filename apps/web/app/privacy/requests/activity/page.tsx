/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, listPrivacyActivity } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyActivityPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.audit.read")) {
    return <Shell ctx={ctx} current="requests"><PageHeader section="Privacy requests" href="/privacy/requests" icon="shieldCheck"><h1 className="page-title">Privacy activity is limited to authorized reviewers.</h1></PageHeader></Shell>;
  }
  const events = listPrivacyActivity(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="requests">
      <PageHeader section="Privacy requests" href="/privacy/requests" icon="shieldCheck"><h1 className="page-title">Privacy request activity</h1></PageHeader>
      <p>These entries come from the access ledger. They do not include export contents.</p>
      {events.length === 0 ? <p>No privacy events are stored for this organization.</p> : null}
      <div className="list">
        {events.map((event, index) => <p key={`${event.action}-${index}`}>{event.action} {event.resource_id} {event.outcome} {event.actor_id}</p>)}
      </div>
    </Shell>
  );
}
