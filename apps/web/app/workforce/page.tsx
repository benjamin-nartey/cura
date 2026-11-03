import { getDb, listWorkforce, workforceActor } from "@curasphere/domain";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { facilitiesFor, loadWorkforce } from "@/lib/workforce";

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<{ q?: string; facilityId?: string; role?: string; status?: string; notice?: string; error?: string }> }) {
  const query = await searchParams;
  const { ctx, directory } = await loadWorkforce();
  const facilities = facilitiesFor(ctx);
  const names = new Map(facilities.map((facility) => [facility.id, facility.name]));
  const q = query.q ?? "";
  const facilityId = query.facilityId ?? "";
  const role = query.role ?? "";
  const status = query.status ?? "";
  let filtered = directory.staff;
  try {
    filtered = listWorkforce(getDb(), workforceActor(ctx), { q, facilityId, role, status }).staff;
  } catch {
    notFound();
  }
  return (
    <Shell ctx={ctx} current="workforce" title="Workforce">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Workforce</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">Staff you are allowed to administer. Counts and rows come from the server for this organization and facility scope.</p>
        </div>
        <p><a href="/workforce/invite">Invite staff</a></p>
      </header>
      {query.notice ? <p className="lede" role="status">The change was saved.</p> : null}
      {query.error ? <p className="lede" role="alert">The change was not saved. Refresh the record and try again.</p> : null}
      <section className="panel card" aria-label="Workforce summary">
        <p>{directory.active} active memberships</p>
        <p>{directory.suspended} suspended memberships</p>
        <p>{directory.pendingInvitations} pending invitations</p>
        <p><a href="/workforce/invitations">Invitations</a> · <a href="/workforce/activity">Activity</a></p>
      </section>
      <form className="panel card form-grid" method="get">
        <label className="field">Search<label className="sr">Staff name</label><input name="q" defaultValue={q} /></label>
        <label className="field">Facility
          <select name="facilityId" defaultValue={facilityId}>
            <option value="">All permitted facilities</option>
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
          </select>
        </label>
        <label className="field">Role
          <select name="role" defaultValue={role}>
            <option value="">Any role</option>
            <option value="nurse">Nurse</option>
            <option value="doctor">Doctor</option>
            <option value="receptionist">Receptionist</option>
            <option value="facility-administrator">Facility administrator</option>
            <option value="organization-administrator">Organization administrator</option>
          </select>
        </label>
        <label className="field">Status
          <select name="status" defaultValue={status}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <section className="panel card">
        {filtered.length === 0 ? <p>No staff match this view.</p> : (
          <ul>
            {filtered.map((person) => (
              <li key={`${person.id}-${person.facilityId}`}>
                <a href={`/workforce/${person.id}`}>{person.name}</a>
                {" · "}{person.role}{" · "}{names.get(person.facilityId) ?? "Facility"}{" · "}{person.status}
                {person.accountStatus !== "active" ? " · account disabled" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
