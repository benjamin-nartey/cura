/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { chargeHistory, effectivePermissions, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ChargeHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("billing.history.read")) redirect("/access/denied");
  let rows: ReturnType<typeof chargeHistory> = [];
  let failed = false;
  try {
    rows = chargeHistory(getDb(), masterActor(ctx), id);
  } catch {
    failed = true;
  }
  return (
    <Shell ctx={ctx} current="billing">
      <PageHeader section="Charges" href="/billing" icon="wallet" description={<>Earlier versions are kept. An adjustment does not rewrite the original total.</>}><h1 className="page-title">Charge history</h1></PageHeader>
      {failed ? <p role="alert">That history is not available.</p> : null}
      <ol>
        {rows.map((row) => (
          <li key={row.version}>Version {row.version} · {row.actorId} · {row.amendedAt ?? row.recordedAt} · {row.reason ?? "recorded"}<pre>{JSON.stringify(row.snapshot)}</pre></li>
        ))}
      </ol>
    </Shell>
  );
}
