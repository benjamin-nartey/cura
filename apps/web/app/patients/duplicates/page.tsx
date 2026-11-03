import { getDb, listDuplicateCandidates } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function DuplicateQueuePage() {
  const ctx = await requireSession();
  let rows: ReturnType<typeof listDuplicateCandidates> = [];
  try {
    rows = listDuplicateCandidates(getDb(), masterActor(ctx));
  } catch {
    redirect("/access/denied");
  }
  const open = rows.filter((row) => row.status === "open");
  return (
    <Shell ctx={ctx} current="patients">
      <p className="eyebrow">{ctx.organizationName}</p>
      <h1 className="page-title">Duplicate candidates</h1>
      <p className="lede">A match is a review item. It does not mean the records are the same person.</p>
      {open.length === 0 ? (
        <p>No open duplicate candidate is waiting.</p>
      ) : (
        <div className="list">
          {open.map((row) => (
            <a className="row" key={row.id} href={`/patients/duplicates/${row.id}`}>
              <span className="mono">{row.reason}</span>
              <span className="person">
                {row.left_patient_id} · {row.right_patient_id}
              </span>
              <span className="muted">version {row.version}</span>
            </a>
          ))}
        </div>
      )}
    </Shell>
  );
}
