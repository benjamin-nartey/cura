import { emergencyHistory, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { emergencyActor, emergencyContext } from "@/lib/emergency";

export default async function EmergencyHistoryPage() {
  const ctx = await emergencyContext();
  const rows = emergencyHistory(getDb(), emergencyActor(ctx)) as Array<{
    id: string;
    created_at: string;
    reason_category: string;
    resource_id: string;
    status: string;
    expires_at: string | null;
    review_status: string | null;
  }>;
  return (
    <Shell ctx={ctx} current="emergency" title="Emergency history">
      <header className="chart-head">
        <div>
          <h1 className="page-title">Your emergency access history</h1>
          <p className="lede">This list shows only your own requests.</p>
        </div>
      </header>
      {rows.length === 0 ? <p role="status">No emergency requests are recorded for you.</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.created_at} · {row.reason_category} · {row.resource_id} · {row.status}
            {row.expires_at ? ` · expires ${row.expires_at}` : ""} · review {row.review_status ?? "not opened"}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
