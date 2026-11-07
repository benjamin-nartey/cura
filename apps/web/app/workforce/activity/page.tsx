/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { historyFor, loadWorkforce } from "@/lib/workforce";

export default async function ActivityPage() {
  const { ctx } = await loadWorkforce();
  const rows = historyFor(ctx) as Array<{ action: string; targetId?: string; reason: string; createdAt: string }>;
  return (
    <Shell ctx={ctx} current="workforce" title="Workforce activity">
      <header className="chart-head">
        <div>
          <PageHeader section="Workforce" href="/workforce" icon="users" eyebrow={<>Activity</>} description={<>Recent workforce changes in this organization. Invitation secrets are not stored in this history.</>}><h1 className="page-title">Administrative history</h1></PageHeader>
        </div>
      </header>
      {rows.length === 0 ? <p className="panel card">No administrative changes yet.</p> : (
        <ul className="panel card">
          {rows.map((row, index) => (
            <li key={`${row.createdAt}-${index}`}>{row.createdAt} · {row.action} · {row.reason}</li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
