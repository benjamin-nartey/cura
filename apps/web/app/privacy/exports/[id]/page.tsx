/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readExport, readPrivacyRequest } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { privacyActor } from "@/lib/privacy";
import { requireSession } from "@/lib/session";

export default async function ExportDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string; count?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.request.read")) {
    return <Shell ctx={ctx} current="requests"><PageHeader section="Data exports" href="/privacy/exports" icon="shieldCheck"><h1 className="page-title">Exports are limited to authorized staff.</h1></PageHeader></Shell>;
  }
  try {
    const row = readExport(getDb(), privacyActor(ctx), id);
    const request = readPrivacyRequest(getDb(), privacyActor(ctx), row.request_id);
    const authority = request.authority_id
      ? (getDb().prepare(`SELECT status, expires_at FROM privacy_authorities WHERE id = ?`).get(request.authority_id) as { status: string; expires_at: string | null } | undefined)
      : undefined;
    const authorityActive = !request.authority_id || (authority?.status === "active" && ((authority.expires_at === null || authority.expires_at === undefined) || Date.parse(authority.expires_at) > Date.now()));
    const manifest = row.manifest ? JSON.parse(row.manifest) as { included?: number; checksum?: string; excluded?: unknown } : null;
    return (
      <Shell ctx={ctx} current="requests">
        <PageHeader section="Data exports" href="/privacy/exports" icon="shieldCheck" eyebrow={<>{row.status}</>}><h1 className="page-title">Export</h1></PageHeader>
        {query.error === "forbidden" ? <p>This account cannot download the export.</p> : null}
        {query.error === "conflict" ? <p>The export is expired, revoked, or no longer matches its checksum.</p> : null}
        {query.notice === "downloaded" ? <p>Download authorized for {query.count} records. The file stayed in private storage.</p> : null}
        <p>Subject {row.subject_id}. Monitoring {row.monitoring}. Records {row.record_count}. Expires {row.expires_at ?? "not set"}.</p>
        <p>Authorized downloader {row.downloader_id}. Format json.</p>
        {authorityActive ? null : <p>The representative authority is no longer active, so download is closed.</p>}
        {manifest ? <p>Manifest included {manifest.included}. Checksum {manifest.checksum}</p> : <p>No manifest is stored yet.</p>}
        {access.permissions.includes("privacy.export.download") && ctx.userId === row.downloader_id && authorityActive && row.status !== "revoked" && row.status !== "expired" && row.status !== "blocked" ? (
          <form action={`/api/privacy/exports/${row.id}/download`} method="post">
            <button type="submit">Download the authorized export</button>
          </form>
        ) : null}
        {access.permissions.includes("privacy.export.revoke") && row.status !== "revoked" && row.status !== "expired" ? (
          <form action={`/api/privacy/exports/${row.id}/revoke`} method="post">
            <button type="submit">Revoke download</button>
          </form>
        ) : null}
      </Shell>
    );
  } catch (error) {
    if (error instanceof NotFoundError) return <Shell ctx={ctx} current="requests"><PageHeader section="Data exports" href="/privacy/exports" icon="shieldCheck"><h1 className="page-title">That export is not available.</h1></PageHeader></Shell>;
    throw error;
  }
}
