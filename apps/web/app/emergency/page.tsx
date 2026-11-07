/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { emergencyContext, syntheticEligibility } from "@/lib/emergency";

export default async function EmergencyRestrictedPage() {
  const ctx = await emergencyContext();
  const eligibility = syntheticEligibility(ctx);
  return (
    <Shell ctx={ctx} current="emergency" title="Restricted access">
      <header className="chart-head">
        <div>
          <PageHeader section="Emergency access" href="/emergency" icon="shieldCheck" eyebrow={<>Access</>}><h1 className="page-title">Restricted access</h1></PageHeader>
        </div>
      </header>
      {eligibility.eligible ? (
        <section className="panel card">
          <p>Routine access is not available for this restricted record.</p>
          <p>Emergency access is an exception. It is recorded, time limited, and reviewed.</p>
          <p><a href="/emergency/justify">Emergency Access</a></p>
          <p><a href="/dashboard">Cancel</a></p>
        </section>
      ) : (
        <section className="panel card">
          <p role="status">That record is not available.</p>
          <p><a href="/dashboard">Back</a></p>
        </section>
      )}
    </Shell>
  );
}
