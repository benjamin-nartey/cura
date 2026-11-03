import { effectivePermissions, getDb, listConsentDispatches, readConsent } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { consentActor } from "@/lib/consent";
import { requireSession } from "@/lib/session";

export default async function ConsentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.read")) {
    return <Shell ctx={ctx} current="consent"><h1 className="page-title">Consent records are limited to authorized staff.</h1></Shell>;
  }
  try {
    const row = readConsent(getDb(), consentActor(ctx), id);
    return (
      <Shell ctx={ctx} current="consent">
        <p className="eyebrow">{row.status}</p>
        <h1 className="page-title">Consent {row.subject_id}</h1>
        {query.error === "conflict" ? <p>That record changed. Refresh and try again.</p> : null}
        {query.error === "forbidden" ? <p>The authority or account cannot do that.</p> : null}
        {query.error === "invalid" ? <p>The submitted values were not accepted.</p> : null}
        {query.notice === "withdrawn" ? <p>Withdrawal is recorded. Earlier processing that already completed is not erased.</p> : null}
        {query.notice === "queued" ? <p>The reminder is queued. It will be checked again before dispatch.</p> : null}
        {query.notice === "blocked" ? <p>Dispatch was blocked. The current consent does not allow this processing.</p> : null}
        {query.notice === "dispatched" ? <p>The local sink accepted the reminder.</p> : null}
        <p>Purpose {row.purpose}. Scope {row.resource_category}. Recipient {row.recipient}.</p>
        <p>Policy synthetic-development version 1. Authority {row.verification_status}. Version {row.version}.</p>
        <p>Effective {row.effective_at ?? "not set"}. Expires {row.expires_at ?? "not set"}.</p>
        <p><a href={`/consent/${row.id}/history`}>Version history</a></p>
        {access.permissions.includes("consent.verify") && row.status === "pending_verification" ? (
          <form action={`/api/consents/${row.id}/verify`} method="post">
            <input type="hidden" name="authorityId" value={row.authority_id} />
            <input type="hidden" name="evidenceRef" value={row.authority_id === "auth_akua_guardian" ? "evidence_guardian_order" : "evidence_self_ack"} />
            <button type="submit">Verify authority</button>
          </form>
        ) : null}
        {access.permissions.includes("consent.manage") && row.status === "pending_verification" ? (
          <form action={`/api/consents/${row.id}/activate`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <button type="submit">Activate</button>
          </form>
        ) : null}
        {access.permissions.includes("consent.communication.dispatch") && row.status === "active" && row.action === "consent.communication.dispatch" ? (
          <form action={`/api/consents/${row.id}/queue`} method="post">
            <input type="hidden" name="idempotencyKey" value={`queue${crypto.randomUUID().replaceAll("-", "")}`} />
            <button type="submit">Queue reminder</button>
          </form>
        ) : null}
        {access.permissions.includes("consent.withdraw") && row.status === "active" ? <p><a href={`/consent/${row.id}/withdraw`}>Withdraw consent</a></p> : null}
        <h2>Queued processing</h2>
        {listConsentDispatches(getDb(), consentActor(ctx), row.subject_id).filter((job) => job.action === row.action).map((job) => (
          <p key={job.id}>
            {job.status}{job.reason_code ? ` · ${job.reason_code}` : ""}
            {access.permissions.includes("consent.manage") && job.status === "queued" ? (
              <form action="/api/consents/dispatch" method="post">
                <input type="hidden" name="dispatchId" value={job.id} />
                <input type="hidden" name="consentId" value={row.id} />
                <button type="submit">Dispatch now</button>
              </form>
            ) : null}
          </p>
        ))}
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return <Shell ctx={ctx} current="consent"><h1 className="page-title">That consent record is not available.</h1></Shell>;
  }
}
