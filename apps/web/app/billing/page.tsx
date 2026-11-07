/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
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
  if (!ctx.facilityId || !access.permissions.includes("billing.charge.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  const rows = listCharges(getDb(), masterActor(ctx), query.patient || undefined);
  return (
    <Shell ctx={ctx} current="billing">
      <PageHeader section="Charges" href="/billing" icon="wallet" description={<>Review charges, track their status, and manage adjustments. No payment is collected from this workspace.</>}><h1 className="page-title">Charges</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="page-summary" aria-label="Loaded charge records"><div><strong>{rows.length}</strong><span>Charges in this view</span></div><div><strong>{rows.filter(row=>row.status==='reviewed').length}</strong><span>Reviewed records</span></div><div><strong>{rows.filter(row=>row.status==='finalized-local').length}</strong><span>Finalized locally</span></div></div>
      {rows.length === 0 ? <p>No charge is recorded for this facility.</p> : (
        <div className="data-table-region" role="region" aria-label="Facility charges" tabIndex={0}>
          <table><caption className="sr">Charges recorded at this facility</caption><thead><tr><th scope="col">Charge</th><th scope="col">Status</th><th scope="col" className="numeric">Amount</th><th scope="col" className="numeric">Version</th><th scope="col">Action</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}><th scope="row" className="table-id">{row.id}</th><td><span className="record-status">{row.status}</span></td><td className="numeric">{row.currency} {(row.total_minor / 100).toFixed(2)}</td><td className="numeric">{row.version}</td><td><a href={`/billing/charges/${row.id}`}>View charge<span className="sr"> {row.id}</span></a></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
