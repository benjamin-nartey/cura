import { randomUUID } from "node:crypto";
import { Shell } from "@/components/shell";
import { facilitiesFor, loadWorkforce } from "@/lib/workforce";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { ctx } = await loadWorkforce();
  const facilities = facilitiesFor(ctx);
  const key = `inv-${randomUUID().slice(0, 12)}`;
  return (
    <Shell ctx={ctx} current="workforce" title="Invite staff">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Invitation</p>
          <h1 className="page-title">Invite staff</h1>
          <p className="lede">An invitation does not grant access. The person must sign in with the identity provider and accept it. No administrator role is selected.</p>
        </div>
      </header>
      {query.error ? <p role="alert">The invitation was not created. Check the facility and try again.</p> : null}
      <form className="panel card form-grid" method="post" action="/api/workforce/invitations">
        <input type="hidden" name="idempotencyKey" value={key} />
        <label className="field">Email<input name="email" type="email" required autoComplete="off" /></label>
        <label className="field">Facility
          <select name="facilityId" required defaultValue="">
            <option value="" disabled>Choose a facility</option>
            {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
          </select>
        </label>
        <label className="field">Initial role
          <select name="roleId" required defaultValue="nurse">
            <option value="nurse">Nurse</option>
            <option value="doctor">Doctor</option>
            <option value="receptionist">Receptionist</option>
            <option value="laboratory-scientist">Laboratory scientist</option>
            <option value="billing-officer">Billing officer</option>
          </select>
        </label>
        <label className="field">Reason<input name="reason" required defaultValue="staffing" /></label>
        <p className="lede">Preview: the selected role applies only at the selected facility after acceptance. Privileged administrator roles are not offered here.</p>
        <button type="submit">Send invitation</button>
      </form>
    </Shell>
  );
}
