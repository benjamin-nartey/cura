import { effectivePermissions, getDb, readMedicationOrder } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function MedicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.medication-order.read")) redirect("/access/denied");
  let row: ReturnType<typeof readMedicationOrder> | null = null;
  try {
    row = readMedicationOrder(getDb(), masterActor(ctx), id);
  } catch {
    row = null;
  }
  if (!row) return <Shell ctx={ctx} current="clinical"><p role="alert">That draft is not available.</p></Shell>;
  return (
    <Shell ctx={ctx} current="clinical">
      <h1 className="page-title">Medication draft</h1>
      <p className="lede"><strong>Synthetic draft — not a valid prescription.</strong></p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="card">
        <p>{String(row.display)} · {String(row.dose_quantity)} {String(row.dose_unit)} · {String(row.route)}</p>
        <p>Status: <strong>{String(row.status)}</strong> · version {String(row.version)} · transmission {String(row.transmission)}</p>
        <p><a href={`/clinical/history?kind=medication-order&id=${id}`}>History</a></p>
      </div>
      {row.status === "draft" && access.permissions.includes("clinical.medication-order.amend") ? (
        <form className="form-grid" action={`/api/clinical/medication-orders/${id}/amend`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <label className="field">Corrected dose in mg<input name="dose" type="number" required defaultValue={String(row.dose_quantity)} /></label>
          <input type="hidden" name="reason" value="dose-corrected" />
          <button className="btn-dark" type="submit">Amend draft</button>
        </form>
      ) : null}
      {row.status === "draft" && access.permissions.includes("clinical.medication-order.cancel") ? (
        <form action={`/api/clinical/medication-orders/${id}/cancel`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <input type="hidden" name="reason" value="patient-request" />
          <button className="btn-dark" type="submit">Cancel draft</button>
        </form>
      ) : null}
    </Shell>
  );
}
