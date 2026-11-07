/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readReferral } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReferralPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.referral.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  let row: ReturnType<typeof readReferral> | null = null;
  try {
    row = readReferral(getDb(), masterActor(ctx), id);
  } catch {
    row = null;
  }
  if (!row) redirect("/work");
  return (
    <Shell ctx={ctx} current="work">
      <PageHeader section="Care coordination" href="/work" icon="checklist"><h1 className="page-title">Referral</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="card">
        <p>{row.display}</p>
        <p>Status: <strong>{row.status}</strong> · version {row.version}</p>
        <p>From {row.from_facility_id} to {row.to_facility_id} · due {row.due_on}</p>
        <p><a href={`/work/history?kind=referral&id=${id}`}>History</a></p>
      </div>
      {row.status === "submitted" && row.to_facility_id === ctx.facilityId && access.permissions.includes("work.referral.decide") ? (
        <form action={`/api/work/referrals/${id}/decide`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <label className="field">Decision
            <select aria-label="Decision" name="decision"><option value="accepted">Accept</option><option value="declined">Decline</option></select>
          </label>
          <button className="btn-dark" type="submit">Save decision</button>
        </form>
      ) : null}
      {row.from_facility_id === ctx.facilityId && row.status !== "cancelled" && row.status !== "declined" && access.permissions.includes("work.referral.cancel") ? (
        <form action={`/api/work/referrals/${id}/cancel`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <input type="hidden" name="reason" value="no-longer-needed" />
          <button className="btn-line" type="submit">Cancel referral</button>
        </form>
      ) : null}
    </Shell>
  );
}
