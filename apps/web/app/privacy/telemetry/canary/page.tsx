import { effectivePermissions, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

const SCENARIOS = ["P03-F05-S01", "P03-F05-S02", "P03-F05-S04", "P03-F05-S09", "P03-F05-S10"];

export default async function CanaryConsolePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; scenario?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging" || !access.permissions.includes("privacy.telemetry.test")) {
    return <Shell ctx={ctx} current="telemetry"><h1 className="page-title">The canary console is limited to the local privacy test role.</h1></Shell>;
  }
  return (
    <Shell ctx={ctx} current="telemetry">
      <h1 className="page-title">Synthetic canary console</h1>
      <p>The console runs a stored fixture. It does not echo the fixture value.</p>
      {query.notice === "pass" ? <p>Scenario {query.scenario} passed. The stored event does not contain the marker.</p> : null}
      {query.notice === "fail" ? <p>Scenario {query.scenario} failed closed. The raw value was not stored.</p> : null}
      {query.error ? <p>The canary check did not run.</p> : null}
      <form action="/api/privacy/telemetry/canary" method="post">
        <label>Scenario
          <select name="scenarioId" defaultValue="P03-F05-S04">
            {SCENARIOS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <button type="submit">Run stored canary</button>
      </form>
    </Shell>
  );
}
