import { effectivePermissions, getDb, listCharges } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ patient?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("billing.charge.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  const rows = listCharges(getDb(), masterActor(ctx), query.patient || undefined);
  return (
    <Shell ctx={ctx} current="billing">
      <h1 className="page-title">Synthetic charges</h1>
      <p className="lede">These amounts are fictional test records. Nothing was billed or collected.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {rows.length === 0 ? <p>No charge is recorded for this facility.</p> : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <a href={`/billing/charges/${row.id}`}>{row.id}</a> · {row.status} · {row.currency} {(row.total_minor / 100).toFixed(2)} · version {row.version}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
