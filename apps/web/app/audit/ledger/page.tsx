import { ForbiddenError, getDb, listAccessLedger } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AccessLedgerPage() {
  const ctx = await requireSession();
  try {
    const ledger = listAccessLedger(getDb(), {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      facilityId: ctx.facilityId,
    });
    return (
      <Shell ctx={ctx} current="audit">
        <p className="eyebrow">Experimental ledger</p>
        <h1 className="page-title">Access ledger</h1>
        <p className="lede">
          Review the organization’s append-only access history, record identifiers, and integrity hashes.
        </p>
        <p className={ledger.intact ? "meta" : "error"}>{ledger.intact ? "The hash chain matches." : `The hash chain broke at sequence ${ledger.brokenAt}.`}</p>
        <div className="list">
          {ledger.entries.map((entry) => (
            <article className="row" key={entry.id} style={{ gridTemplateColumns: "160px minmax(0, 1fr) auto" }}>
              <span className="mono">{formatWhen(entry.createdAt)}</span>
              <span>
                <strong>{entry.action}</strong>
                <span className="muted" style={{ display: "block" }}>
                  {entry.actorId} · {entry.resourceType}
                  {entry.resourceId ? ` · ${entry.resourceId}` : ""}
                </span>
              </span>
              <span className="mono">{entry.entryHash.slice(0, 12)}</span>
            </article>
          ))}
        </div>
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    return (
      <Shell ctx={ctx} current="audit">
        <p className="eyebrow">Experimental ledger</p>
        <h1 className="page-title">The access ledger is limited to auditors.</h1>
      </Shell>
    );
  }
}
