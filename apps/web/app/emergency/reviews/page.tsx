import { effectivePermissions, getDb, listEmergencyReviews } from "@curasphere/domain";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { emergencyActor, emergencyContext } from "@/lib/emergency";

export default async function EmergencyReviewsPage() {
  const ctx = await emergencyContext();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("emergency.review.read")) redirect("/access/denied");
  let rows: Array<{ id: string; status: string; opened_at: string; deadline_at: string; disposition: string | null }> = [];
  let failed = false;
  try {
    rows = listEmergencyReviews(getDb(), emergencyActor(ctx)) as typeof rows;
  } catch {
    failed = true;
  }
  const now = Date.now();
  const pending = rows.filter((row) => row.status === "pending_review" || row.status === "in_review");
  const overdue = pending.filter((row) => Date.parse(row.deadline_at) < now);
  return (
    <Shell ctx={ctx} current="emergency" title="Emergency reviews">
      <header className="chart-head">
        <div>
          <h1 className="page-title">Emergency review queue</h1>
          <p className="lede">Review does not open the underlying record.</p>
        </div>
      </header>
      {failed ? <p role="alert">The queue could not be loaded. <a href="/emergency/reviews">Retry</a></p> : null}
      {!failed && rows.length === 0 ? <p role="status">No emergency reviews are waiting.</p> : null}
      <h2>Pending</h2>
      <ul>
        {pending.map((row) => (
          <li key={row.id}><a href={`/emergency/reviews/${row.id}`}>{row.opened_at} · {row.status}</a></li>
        ))}
      </ul>
      <h2>Overdue</h2>
      {overdue.length === 0 ? <p>No overdue reviews.</p> : <ul>{overdue.map((row) => <li key={row.id}>{row.deadline_at}</li>)}</ul>}
    </Shell>
  );
}
