import { effectivePermissions, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function NewLegalHoldPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("legal-hold.create")) {
    return <Shell ctx={ctx} current="retention"><h1 className="page-title">Creating a legal hold is limited to the hold workflow.</h1></Shell>;
  }
  return (
    <Shell ctx={ctx} current="retention">
      <h1 className="page-title">Create a legal hold</h1>
      <p>This records a synthetic preservation request for this organization. It does not claim a real legal order.</p>
      {query.error ? <p>The hold could not be recorded. Check the matter reference and the record id.</p> : null}
      <form action="/api/privacy/legal-holds" method="post">
        <input type="hidden" name="idempotencyKey" value={`hold${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
        <label>Matter <input name="matterRef" required defaultValue="SYN-RETENTION-CASE-001" /></label>
        <label>Record id <input name="scopeRef" required placeholder="ret_..." /></label>
        <input type="hidden" name="scopeKind" value="resource" />
        <input type="hidden" name="reasonCode" value="investigation" />
        <input type="hidden" name="authorityRef" value="synthetic-development-authority" />
        <p>Scope: the record id above, in this organization and facility only.</p>
        <button type="submit">Confirm hold request</button>
      </form>
    </Shell>
  );
}
