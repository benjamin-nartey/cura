import { effectivePermissions, getDb, listConsents } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { consentActor } from "@/lib/consent";
import { requireSession } from "@/lib/session";

export default async function ConsentDirectoryPage({ searchParams }: { searchParams: Promise<{ status?: string; purpose?: string; q?: string; error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.read")) {
    return (
      <Shell ctx={ctx} current="consent">
        <h1 className="page-title">Consent records are limited to authorized staff.</h1>
      </Shell>
    );
  }
  const rows = listConsents(getDb(), consentActor(ctx), {
    status: query.status || undefined,
    purpose: query.purpose || undefined,
    subjectId: query.q || undefined,
  });
  return (
    <Shell ctx={ctx} current="consent">
      <p className="eyebrow">{ctx.organizationName}</p>
      <h1 className="page-title">Consent directory</h1>
      {query.error === "forbidden" ? <p>That action is not available for this account.</p> : null}
      {query.error === "missing" ? <p>No matching consent record was found.</p> : null}
      <form method="get">
        <label>Subject reference <input name="q" defaultValue={query.q ?? ""} /></label>
        <label>Status <input name="status" defaultValue={query.status ?? ""} /></label>
        <label>Purpose <input name="purpose" defaultValue={query.purpose ?? ""} /></label>
        <button type="submit">Filter</button>
      </form>
      {rows.length === 0 ? <p>No consent directives match this filter.</p> : null}
      <div className="list">
        {rows.map((row) => (
          <article className="row" key={row.id}>
            <a href={`/consent/${row.id}`}>{row.subject_id}</a>
            <span>{row.purpose}</span>
            <span>{row.status}</span>
            <span>v{row.version}</span>
            <span>{row.effective_at ?? "No effective date"}</span>
          </article>
        ))}
      </div>
    </Shell>
  );
}
