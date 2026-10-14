import { authorize, devDirectoryEnabled, getDb } from "@curasphere/domain";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

const PRINCIPALS = new Set([
  "usr_gh_admin",
  "usr_gh_doctor",
  "usr_gh_nurse",
  "usr_gh_reception",
  "usr_gh_lab",
  "usr_amira",
  "svc_gh_sync",
]);

export default async function DiagnosePage({
  searchParams,
}: {
  searchParams: Promise<{ principalId?: string; action?: string; resourceType?: string }>;
}) {
  if (!devDirectoryEnabled()) redirect("/access/denied");
  const ctx = await requireSession();
  const query = await searchParams;
  const principalId = PRINCIPALS.has(query.principalId ?? "") ? query.principalId ?? "" : ctx.userId;
  const action = /^[a-z]+(\.[a-z]+){1,3}$/.test(query.action ?? "") ? query.action ?? "organization.read" : "organization.read";
  const resourceType = /^[A-Za-z]{3,40}$/.test(query.resourceType ?? "") ? query.resourceType ?? "Organization" : "Organization";
  const decision = authorize(
    getDb(),
    { principalId, accountActive: true },
    action,
    { type: resourceType, organizationId: ctx.organizationId, facilityId: ctx.facilityId, sensitivity: action.startsWith("clinical.") ? "standard" : "administrative" },
    { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: true, activeFacilityId: ctx.facilityId },
  );
  return (
    <Shell ctx={ctx} current="access" title="Policy check">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Local test</p>
          <h1 className="page-title">Policy decision</h1>
          <p className="lede">This check uses the server policy for the current organization. It is unavailable outside the local test configuration.</p>
        </div>
      </header>
      <form className="panel card" method="get">
        <label htmlFor="principalId">Synthetic principal</label>
        <select id="principalId" name="principalId" defaultValue={principalId}>
          {[...PRINCIPALS].map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <label htmlFor="action">Action</label>
        <input id="action" name="action" defaultValue={action} />
        <label htmlFor="resourceType">Resource type</label>
        <input id="resourceType" name="resourceType" defaultValue={resourceType} />
        <button type="submit">Evaluate</button>
      </form>
      <section className="panel card">
        <p>{decision.allow ? "Allowed" : "Denied"}</p>
        <p>Reason: {decision.reason}</p>
        <p>Policy: {decision.policyId} version {decision.policyVersion}</p>
      </section>
    </Shell>
  );
}
