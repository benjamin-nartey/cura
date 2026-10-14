import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function AccessDeniedPage() {
  const ctx = await requireSession();
  return (
    <Shell ctx={ctx} current="access" title="Access unavailable">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Authorization</p>
          <h1 className="page-title">This area is not available.</h1>
          <p className="lede">Your session does not include access to the requested area. Return to the dashboard to continue.</p>
        </div>
      </header>
      <p><a href="/dashboard">Back to dashboard</a></p>
    </Shell>
  );
}
