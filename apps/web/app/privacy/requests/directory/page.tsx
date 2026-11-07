/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, listPrivacyRequests } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyDirectoryPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.request.read")) {
    return <Shell ctx={ctx} current="requests"><PageHeader section="Privacy requests" href="/privacy/requests" icon="shieldCheck"><h1 className="page-title">The request directory is limited to authorized staff.</h1></PageHeader></Shell>;
  }
  const rows = listPrivacyRequests(getDb(), privacyActor(ctx));
  return (
    <Shell ctx={ctx} current="requests">
      <PageHeader section="Privacy requests" href="/privacy/requests" icon="shieldCheck"><h1 className="page-title">Request directory</h1></PageHeader>
      {rows.length === 0 ? <p>No matching requests.</p> : null}
      <div className="list">
        {rows.map((row) => <p key={row.id}><a href={`/privacy/requests/${row.id}`}>{row.request_type}</a> {row.subject_id} {row.status} {row.requester_id}</p>)}
      </div>
    </Shell>
  );
}
