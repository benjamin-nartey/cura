/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readObservation } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function CorrectObservationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.observation.correct")) redirect("/access/denied");
  const feedback = readFeedback(query);
  let row: ReturnType<typeof readObservation> | null = null;
  try {
    row = readObservation(getDb(), masterActor(ctx), id);
  } catch {
    row = null;
  }
  if (!row) redirect("/clinical");
  return (
    <Shell ctx={ctx} current="clinical">
      <PageHeader section="Clinical records" href="/clinical" icon="stethoscope" description={<>The current value stays in history. Saving creates a new version.</>}><h1 className="page-title">Correct an observation</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <section className="page-form card"><form className="form-grid" action={`/api/clinical/observations/${id}/correct`} method="post">
        <input type="hidden" name="expectedVersion" value={String(row.version)} />
        <p>Current version {String(row.version)}. {row.value_quantity === null || row.value_quantity === undefined ? "Enter both blood-pressure components." : `Current quantity ${row.value_quantity} ${row.unit_code ?? ""}.`}</p>
        <label className="field">Corrected quantity
          <input name="valueQuantity" type="number" step="0.1" defaultValue={row.value_quantity === null || row.value_quantity === undefined ? "" : String(row.value_quantity)} />
        </label>
        <label className="field">Corrected systolic
          <input name="systolic" type="number" step="1" />
        </label>
        <label className="field">Corrected diastolic
          <input name="diastolic" type="number" step="1" />
        </label>
        <label className="field">Reason
          <select aria-label="Reason" name="reason" required><option value="entry-error">Entry error</option><option value="amended">Amendment</option></select>
        </label>
        <button className="btn-dark" type="submit">Save correction</button>
      </form></section>
    </Shell>
  );
}
