/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, workHistory } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function WorkHistoryPage({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.history.read")) redirect("/access/denied");
  const kind = query.kind ?? "";
  let failed = false;
  let rows: ReturnType<typeof workHistory> = [];
  if (query.id && ["order", "plan", "referral", "task"].includes(kind)) {
    try {
      rows = workHistory(getDb(), masterActor(ctx), kind, query.id);
    } catch {
      failed = true;
    }
  }
  return (
    <Shell ctx={ctx} current="work">
      <PageHeader section="Care coordination" href="/work" icon="checklist" description={<>Each version is stored. An earlier version is not rewritten.</>}><h1 className="page-title">Work history</h1></PageHeader>
      {failed ? <p role="alert">That history is not available.</p> : null}
      {rows.length === 0 && !failed ? <p>No work version is available.</p> : null}
      <ol>
        {rows.map((row) => (
          <li key={row.version}>Version {row.version} · {row.actorId} · {row.amendedAt ?? row.recordedAt} · {row.reason ?? "recorded"}<pre>{JSON.stringify(row.snapshot)}</pre></li>
        ))}
      </ol>
    </Shell>
  );
}
