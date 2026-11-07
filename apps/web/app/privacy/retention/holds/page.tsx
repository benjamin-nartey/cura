/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, listLegalHolds } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function LegalHoldsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("legal-hold.read")) {
    return <Shell ctx={ctx} current="retention"><PageHeader section="Retention" href="/privacy/retention" icon="shieldCheck"><h1 className="page-title">Legal holds are limited to authorized staff.</h1></PageHeader></Shell>;
  }
  const holds = listLegalHolds(getDb(), retentionActor(ctx));
  return (
    <Shell ctx={ctx} current="retention">
      <PageHeader section="Retention" href="/privacy/retention" icon="shieldCheck"><h1 className="page-title">Legal holds</h1></PageHeader>
      <p>Review preservation holds and their supporting authority. Releasing a hold does not delete records.</p>
      {query.error ? <p>The hold action was not accepted.</p> : null}
      {holds.length === 0 ? <p>No legal holds are stored for this organization.</p> : null}
      <div className="list">
        {holds.map((hold) => (
          <p key={hold.id}><a href={`/privacy/retention/holds/${hold.id}`}>{hold.matter_ref}</a> {hold.status} {hold.scope_kind} {hold.scope_ref}</p>
        ))}
      </div>
      {access.permissions.includes("legal-hold.create") ? <p><a href="/privacy/retention/holds/new">Create a hold</a></p> : null}
    </Shell>
  );
}
