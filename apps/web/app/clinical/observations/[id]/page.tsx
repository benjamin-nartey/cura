import { effectivePermissions, getDb, readObservation } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ObservationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("clinical.observation.read")) redirect("/access/denied");
  let failed = false;
  let row: ReturnType<typeof readObservation> | null = null;
  try {
    row = readObservation(getDb(), masterActor(ctx), id);
  } catch {
    failed = true;
  }
  return (
    <Shell ctx={ctx} current="clinical">
      <h1 className="page-title">Observation</h1>
      {failed || !row ? <p role="alert">That observation is not available.</p> : null}
      {row ? (
        <div className="card">
          <p>{row.display}</p>
          <p>Status: <strong>{String(row.status)}</strong> · version {String(row.version)}</p>
          <p>{row.value_quantity === null || row.value_quantity === undefined ? "Component observation" : `${row.value_quantity} ${row.unit_code ?? ""}`}</p>
          {Array.isArray(row.components) ? row.components.map((part) => <p key={String(part.code)}>{String(part.display)} {String(part.value_quantity)} {String(part.unit_code)}</p>) : null}
          <p>Effective {String(row.effective_at)}</p>
          <p>Recorded {String(row.recorded_at)} by {String(row.recorded_by)}</p>
          <p><a href={`/clinical/history?kind=observation&id=${id}`}>History</a></p>
          {access.permissions.includes("clinical.observation.correct") && row.status !== "entered-in-error" ? <p><a href={`/clinical/observations/${id}/correct`}>Correct this value</a></p> : null}
        </div>
      ) : null}
    </Shell>
  );
}
