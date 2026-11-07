/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function AccessDeniedPage() {
  const ctx = await requireSession();
  return (
    <Shell ctx={ctx} current="access" title="Access unavailable">
      <header className="chart-head">
        <div>
          <PageHeader section="Access management" href="/access" icon="shieldCheck" eyebrow={<>Authorization</>} description={<>Your session does not include access to the requested area. Return to the dashboard to continue.</>}><h1 className="page-title">This area is not available.</h1></PageHeader>
        </div>
      </header>
      <PageActions><a href="/dashboard">Back to dashboard</a></PageActions>
    </Shell>
  );
}
