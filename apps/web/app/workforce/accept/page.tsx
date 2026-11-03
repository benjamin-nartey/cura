import { getDb, seedDemoTenants } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const ctx = await requireSession();
  seedDemoTenants(getDb());
  return (
    <Shell ctx={ctx} current="workforce" title="Accept invitation">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Invitation</p>
          <h1 className="page-title">Accept an invitation</h1>
          <p className="lede">Acceptance uses this signed-in identity. A matching email address does not link an account.</p>
        </div>
      </header>
      {query.error ? <p role="alert">The invitation could not be accepted.</p> : null}
      <form className="panel card" method="post" action="/api/workforce/invitations/accept">
        <label>Invitation token<input name="token" required autoComplete="off" /></label>
        <button type="submit">Accept</button>
      </form>
    </Shell>
  );
}
