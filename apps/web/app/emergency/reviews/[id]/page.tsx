import { effectivePermissions, getDb, readEmergencyReview } from "@curasphere/domain";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { emergencyActor, emergencyContext } from "@/lib/emergency";

export default async function EmergencyReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await emergencyContext();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("emergency.review.read")) redirect("/access/denied");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) notFound();
  let detail: Awaited<ReturnType<typeof readEmergencyReview>>;
  try {
    detail = readEmergencyReview(getDb(), emergencyActor(ctx), id);
  } catch {
    notFound();
  }
  const canAssign = access.permissions.includes("emergency.review.assign");
  const canDispose = access.permissions.includes("emergency.review.disposition");
  const canEscalate = access.permissions.includes("emergency.review.escalate");
  return (
    <Shell ctx={ctx} current="emergency" title="Emergency review">
      <header className="chart-head">
        <div>
          <h1 className="page-title">Emergency request</h1>
          <p className="lede">Status {detail.review.status}. This page does not show the restricted record.</p>
        </div>
      </header>
      {query.error === "conflict" ? <p role="alert">This review changed. Reload it and try again.</p> : null}
      {query.error && query.error !== "conflict" ? <p role="alert">The review action was not saved.</p> : null}
      <section className="panel card">
        <p>Reason category: {detail.request?.reason_category}</p>
        <p>Justification: {detail.request?.justification}</p>
        <h2>Activity</h2>
        <ol>
          {(detail.events as Array<{ event_type: string; created_at: string; action: string | null; outcome: string }>).map((event, index) => (
            <li key={`${event.event_type}-${index}`}>{event.created_at} · {event.event_type} · {event.action ?? "review"} · {event.outcome}</li>
          ))}
        </ol>
      </section>
      {canAssign ? (
        <form method="post" action={`/api/emergency-access/reviews/${id}/assign`}>
          <input type="hidden" name="reviewerId" value={ctx.userId} />
          <button type="submit">Assign to me</button>
        </form>
      ) : null}
      {canDispose ? (
        <form className="form-grid" method="post" action={`/api/emergency-access/reviews/${id}/disposition`}>
          <label className="field">Disposition
            <select name="disposition" defaultValue="closed_appropriate">
              <option value="closed_appropriate">Closed appropriate</option>
              <option value="closed_inappropriate">Closed inappropriate</option>
            </select>
          </label>
          <label className="field">Notes<textarea name="notes" required minLength={8} /></label>
          <button type="submit">Record disposition</button>
        </form>
      ) : null}
      {canEscalate ? (
        <form className="form-grid" method="post" action={`/api/emergency-access/reviews/${id}/escalate`}>
          <label className="field">Escalation notes<textarea name="notes" required minLength={8} /></label>
          <button type="submit">Escalate</button>
        </form>
      ) : null}
    </Shell>
  );
}
