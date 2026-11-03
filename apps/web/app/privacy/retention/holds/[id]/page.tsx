import { effectivePermissions, getDb, readLegalHold } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { retentionActor } from "@/lib/retention";
import { requireSession } from "@/lib/session";

export default async function LegalHoldDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("legal-hold.read")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Legal holds are limited to authorized staff.</h1></Shell>;
  }
  try {
    const hold = readLegalHold(getDb(), retentionActor(ctx), id);
    return (
      <Shell ctx={ctx} current="retention">
        <p className="eyebrow">{hold.status}</p>
        <h1 className="page-title">{hold.matter_ref}</h1>
        {query.error === "forbidden" ? <p>You cannot release a hold you issued, or this account cannot release holds.</p> : null}
        {query.error === "conflict" ? <p>The hold changed. Refresh and try again.</p> : null}
        {query.notice === "active" ? <p>The hold is active. Destructive retention must stop for this scope.</p> : null}
        {query.notice === "released" ? <p>The hold history remains. Disposal still requires a new preview.</p> : null}
        <p>Scope {hold.scope_kind} {hold.scope_ref}. Authority {hold.authority_ref}. Reason {hold.reason_code}.</p>
        <p>Issued by {hold.issuing_actor}. Version {hold.version}.</p>
        {hold.status === "released" ? <p>Released by {hold.released_by}. Reason {hold.release_reason}.</p> : null}
        {access.permissions.includes("legal-hold.activate") && hold.status === "draft" ? (
          <form action={`/api/privacy/legal-holds/${hold.id}/activate`} method="post">
            <input type="hidden" name="expectedVersion" value={hold.version} />
            <button type="submit">Activate hold</button>
          </form>
        ) : null}
        {access.permissions.includes("legal-hold.release") && hold.status === "active" ? (
          <form action={`/api/privacy/legal-holds/${hold.id}/release`} method="post">
            <input type="hidden" name="expectedVersion" value={hold.version} />
            <input type="hidden" name="reasonCode" value="investigation-closed" />
            <button type="submit">Release hold</button>
          </form>
        ) : null}
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">That legal hold is not available.</h1></Shell>;
  }
}
