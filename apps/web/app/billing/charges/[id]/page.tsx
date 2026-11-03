import { effectivePermissions, getDb, readCharge } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ChargePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("billing.charge.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  let row: ReturnType<typeof readCharge> | null = null;
  try {
    row = readCharge(getDb(), masterActor(ctx), id);
  } catch {
    row = null;
  }
  if (!row) redirect("/billing");
  const item = row.items[0];
  return (
    <Shell ctx={ctx} current="billing">
      <h1 className="page-title">Synthetic charge</h1>
      <p className="lede"><strong>Not an invoice.</strong> Nothing was collected.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="card">
        <p>Status: <strong>{row.status}</strong> · version {row.version}</p>
        <p>Total {row.currency} {(row.total_minor / 100).toFixed(2)}</p>
        <p>Patient {row.patient_id} · encounter {row.encounter_id}</p>
        <p><a href={`/billing/charges/${id}/history`}>History</a></p>
      </div>
      <h2>Items</h2>
      <ul>
        {row.items.map((entry) => (
          <li key={entry.id}>{entry.display} · qty {entry.quantity} · catalog v{entry.catalog_version} · {entry.currency} {(entry.amount_minor / 100).toFixed(2)}</li>
        ))}
      </ul>
      {row.status === "recorded" && access.permissions.includes("billing.charge.review") ? (
        <form action={`/api/billing/charges/${id}/review`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <button className="btn-dark" type="submit">Mark reviewed</button>
        </form>
      ) : null}
      {row.status === "reviewed" && access.permissions.includes("billing.charge.review") ? (
        <form action={`/api/billing/charges/${id}/finalize`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <button className="btn-dark" type="submit">Finalize locally</button>
        </form>
      ) : null}
      {(row.status === "recorded" || row.status === "reviewed") && item && access.permissions.includes("billing.charge.adjust") ? (
        <form className="form-grid" action={`/api/billing/charges/${id}/adjust`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <input type="hidden" name="itemId" value={item.id} />
          <label className="field">New amount (minor units)
            <input name="amountMinor" type="number" min={0} required defaultValue={item.amount_minor} />
          </label>
          <label className="field">Reason
            <select name="reason"><option value="price-correction">Price correction</option><option value="quantity-correction">Quantity correction</option></select>
          </label>
          <button className="btn-line" type="submit">Adjust charge</button>
        </form>
      ) : null}
      {row.status !== "voided" && access.permissions.includes("billing.charge.void") ? (
        <form action={`/api/billing/charges/${id}/void`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <input type="hidden" name="reason" value="no-longer-needed" />
          <button className="btn-line" type="submit">Void charge</button>
        </form>
      ) : null}
    </Shell>
  );
}
