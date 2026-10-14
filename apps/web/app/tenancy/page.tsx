import { AppError, getDb, listTenancy, mirrorTenancySession, seedDemoTenants } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function TenancyPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const db = getDb();
  seedDemoTenants(db);
  let view = null;
  let loadError: string | null = null;
  try {
    mirrorTenancySession(db, ctx.sessionId, ctx.userId);
    view = listTenancy(db, ctx.sessionId, new Headers());
  } catch (error) {
    loadError = error instanceof AppError ? error.message : "The directory is temporarily unavailable.";
  }
  return (
    <Shell ctx={ctx} current="tenancy">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Organization</p>
          <h1 className="page-title">{view?.organizationName ?? "No active organization"}</h1>
          <p className="lede">The server chooses the organization and facility from this session. A header cannot change them.</p>
        </div>
      </header>
      <Feedback error={feedback.error ?? loadError} notice={feedback.notice} />
      {view ? (
        <>
          <p className="muted">
            Active facility {view.facilityName ?? "none"} · context version {view.version}
          </p>
          {view.facilities.length === 0 ? <p>No facility is assigned.</p> : null}
          <ul className="stack">
            {view.facilities.map((facility) => (
              <li key={facility.id}>
                <form action="/api/tenancy/facility" method="post" className="form-grid">
                  <input type="hidden" name="facilityId" value={facility.id} />
                  <input type="hidden" name="version" value={String(view.version)} />
                  <span>
                    {facility.name} · {facility.role}
                  </span>
                  <button className="btn-line" type="submit">
                    {facility.id === view.facilityId ? "Keep this facility" : "Use this facility"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <h2>Organizations on this session</h2>
          {view.organizations.length === 0 ? <p>No organization membership is active.</p> : null}
          <ul>
            {view.organizations.map((org) => (
              <li key={org.id}>{org.name}</li>
            ))}
          </ul>
          <h2>Service accounts</h2>
          {view.principals.length === 0 ? <p>No service account is active for this organization.</p> : null}
          <ul>
            {view.principals.map((principal) => (
              <li key={principal.id}>
                {principal.name} · {principal.scope}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h2>Check an organization identifier</h2>
      <form action="/api/tenancy/organization" method="post" className="form-grid">
        <label htmlFor="organization-id">Organization identifier</label>
        <input id="organization-id" name="organizationId" autoComplete="off" />
        <button className="btn-line" type="submit">
          Check
        </button>
      </form>
    </Shell>
  );
}
