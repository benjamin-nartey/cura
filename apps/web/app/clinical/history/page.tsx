import { effectivePermissions, getDb, sourceHistory } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.source.history.read")) redirect("/access/denied");
  const kind = query.kind ?? "";
  let failed = false;
  let rows: ReturnType<typeof sourceHistory> = [];
  if (query.id && ["condition", "allergy", "observation", "medication-order"].includes(kind)) {
    try {
      rows = sourceHistory(getDb(), masterActor(ctx), kind, query.id);
    } catch {
      failed = true;
    }
  }
  return (
    <Shell ctx={ctx} current="clinical">
      <h1 className="page-title">Source history</h1>
      <p className="lede">Each version is stored. The current screen does not rewrite an earlier version.</p>
      {failed ? <p role="alert">That history is not available.</p> : null}
      {rows.length === 0 && !failed ? <p>No source version is available.</p> : null}
      <ol>
        {rows.map((row) => (
          <li key={row.version}>
            Version {row.version} · {row.actor_id} · {row.amended_at ?? row.recorded_at} · {row.reason ?? "recorded"}
            <pre>{JSON.stringify(row.snapshot)}</pre>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
