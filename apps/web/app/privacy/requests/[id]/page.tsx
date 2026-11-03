import { effectivePermissions, getDb, readPrivacyRequest } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function PrivacyRequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string; exportId?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.request.read")) {
    return <Shell ctx={ctx} current="requests"><h1 className="page-title">Privacy requests are limited to authorized staff.</h1></Shell>;
  }
  try {
    const row = readPrivacyRequest(getDb(), privacyActor(ctx), id);
    const canApprove = access.permissions.includes("privacy.request.approve") && row.status === "verified";
    const canElevate = access.permissions.includes("privacy.bulk.approve") && row.status === "elevated_review";
    const canExport = access.permissions.includes("privacy.export.run") && (row.status === "approved" || row.status === "partially_approved" || row.status === "processing" || row.status === "ready");
    return (
      <Shell ctx={ctx} current="requests">
        <p className="eyebrow">{row.status}</p>
        <h1 className="page-title">{row.request_type}</h1>
        {query.error === "forbidden" && row.status === "verification_pending" ? <p>Verification did not succeed. Protected data was not released.</p> : null}
        {query.error === "forbidden" && row.status !== "verification_pending" ? <p>That action is not available for this account.</p> : null}
        {query.error === "conflict" ? <p>The request changed, expired, or is blocked. Refresh and use the current state.</p> : null}
        {query.notice === "verified" ? <p>Verification succeeded. Disclosure still needs a separate approval.</p> : null}
        {query.notice === "elevated" ? <p>This bulk request needs a second reviewer before an export can start.</p> : null}
        {query.notice === "approved" ? <p>The scoped request is approved. Nothing has been exported yet.</p> : null}
        {query.notice === "partial" ? <p>Partial approval. Restricted categories stay out of the approved scope.</p> : null}
        {query.notice === "denied" ? <p>The request is denied. No export can be generated.</p> : null}
        {query.notice === "authority-revoked" ? <p>The representative authority is revoked. Later downloads that depend on it are denied.</p> : null}
        {query.notice === "corrected" ? <p>The source record was updated. The previous value remains in its history.</p> : null}
        {query.notice === "erasure-partial" ? <p>Erasure was partial. Held or protected records were not deleted. Backups outside this database were not verified.</p> : null}
        {query.notice === "erasure-fulfilled" ? <p>Eligible records were disposed. Copies outside this workflow are not covered by this action.</p> : null}
        <p>Subject {row.subject_id}. Requester {row.requester_id}. Relationship {row.relationship}. Authority {row.authority_id ?? "none"}.</p>
        <p>Policy {row.policy_id ?? "missing"} version {row.policy_version ?? "none"}. Jurisdiction {row.jurisdiction}. Due {row.due_at ?? "not set"}.</p>
        <p>Verification {row.verification_state}. Decision {row.decision_state}. Categories {row.categories}. Approved {row.approved_categories ?? "none"}.</p>
        {row.request_type === "correction" ? <p>Proposed correction {row.correction_field}: {row.correction_value}</p> : null}
        {access.permissions.includes("privacy.request.verify") && row.status === "verification_pending" ? (
          <form action={`/api/privacy/requests/${row.id}/verify`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <input type="hidden" name="method" value="synthetic-authority" />
            <input type="hidden" name="authorityId" value={row.authority_id ?? ""} />
            <button type="submit">Verify authority</button>
          </form>
        ) : null}
        {canApprove || canElevate ? (
          <form action={`/api/privacy/requests/${row.id}/approve`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <input type="hidden" name="mode" value="full" />
            <button type="submit">{canElevate ? "Give the second approval" : "Approve scoped request"}</button>
          </form>
        ) : null}
        {canApprove ? (
          <form action={`/api/privacy/requests/${row.id}/approve`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <input type="hidden" name="mode" value="partial" />
            <button type="submit">Approve without third-party notes</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.request.approve") && ["verified", "elevated_review", "verification_pending"].includes(row.status) ? (
          <form action={`/api/privacy/requests/${row.id}/deny`} method="post">
            <input type="hidden" name="expectedVersion" value={row.version} />
            <input type="hidden" name="reasonCode" value="out-of-scope" />
            <button type="submit">Deny request</button>
          </form>
        ) : null}
        {canExport && row.request_type !== "erasure" && row.request_type !== "correction" ? (
          <form action="/api/privacy/exports" method="post">
            <input type="hidden" name="requestId" value={row.id} />
            <input type="hidden" name="idempotencyKey" value={`exp${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
            <button type="submit">Generate the approved export</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.request.approve") && row.request_type === "correction" && ["approved", "partially_approved"].includes(row.status) ? (
          <form action={`/api/privacy/requests/${row.id}/correct`} method="post">
            <button type="submit">Apply the correction</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.export.run") && row.request_type === "erasure" && ["approved", "partially_approved"].includes(row.status) && row.decision_state !== "partial" ? (
          <form action={`/api/privacy/requests/${row.id}/erase`} method="post">
            <button type="submit">Preview and execute eligible erasure</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.request.approve") && row.authority_id ? (
          <form action={`/api/privacy/requests/${row.id}/revoke-authority`} method="post">
            <input type="hidden" name="authorityId" value={row.authority_id} />
            <button type="submit">Revoke the representative authority</button>
          </form>
        ) : null}
        {query.exportId ? <p><a href={`/privacy/exports/${query.exportId}`}>Open the export</a></p> : null}
      </Shell>
    );
  } catch (error) {
    if (error instanceof NotFoundError) return <Shell ctx={ctx} current="requests"><h1 className="page-title">That privacy request is not available.</h1></Shell>;
    throw error;
  }
}
