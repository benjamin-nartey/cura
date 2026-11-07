/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readPlan } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.plan.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  let row: ReturnType<typeof readPlan> | null = null;
  try {
    row = readPlan(getDb(), masterActor(ctx), id);
  } catch {
    row = null;
  }
  if (!row) redirect("/work");
  return (
    <Shell ctx={ctx} current="work">
      <PageHeader section="Care coordination" href="/work" icon="checklist"><h1 className="page-title">Care plan</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="card">
        <p>{row.display}</p>
        <p>Status: <strong>{row.status}</strong> · version {row.version}</p>
        <p>Owner {row.owner_user_id} · due {row.due_on}</p>
        <p><a href={`/work/history?kind=plan&id=${id}`}>History</a></p>
      </div>
      {row.status === "active" && access.permissions.includes("work.plan.update") ? (
        <form action={`/api/work/plans/${id}/update`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <label className="field">Next status
            <select aria-label="Next status" name="status"><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
          </label>
          <label className="field">Reason
            <select aria-label="Reason" name="reason"><option value="completed">Completed</option><option value="no-longer-needed">No longer needed</option></select>
          </label>
          <button className="btn-dark" type="submit">Update plan</button>
        </form>
      ) : null}
    </Shell>
  );
}
