/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { emergencyContext, syntheticEligibility } from "@/lib/emergency";

export default async function EmergencyJustifyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await emergencyContext();
  const eligibility = syntheticEligibility(ctx);
  if (!eligibility.eligible) redirect("/emergency");
  const query = await searchParams;
  const key = `erg-${randomUUID().slice(0, 12)}`;
  return (
    <Shell ctx={ctx} current="emergency" title="Emergency access">
      <header className="chart-head">
        <div>
          <PageHeader section="Emergency access" href="/emergency" icon="shieldCheck" eyebrow={<>Emergency access</>} description={<>Scope: one restricted simulation record at {ctx.facilityName}. Allowed operation: read only. This activity is recorded and reviewed.</>}><h1 className="page-title">Emergency access</h1></PageHeader>
        </div>
      </header>
      {query.error ? <p role="alert">The request was not accepted. Add the reason and try again.</p> : null}
      <form className="panel card form-grid" method="post" action="/api/emergency-access/requests">
        <input type="hidden" name="idempotencyKey" value={key} />
        <label className="field">Reason category
          <select aria-label="Reason category" name="reasonCategory" required defaultValue="emergency-treatment">
            <option value="emergency-treatment">Emergency treatment</option>
          </select>
        </label>
        <label className="field">Justification
          <textarea name="justification" required minLength={8} rows={4} />
        </label>
        <label className="field">Requested duration in seconds
          <input name="durationSeconds" type="number" min={30} max={900} defaultValue={600} required />
        </label>
        <label className="field"><input name="acknowledge" type="checkbox" value="yes" required /> I understand this access is recorded and reviewed.</label>
        <button type="submit">Continue</button>
        <a href="/emergency">Cancel</a>
      </form>
    </Shell>
  );
}
