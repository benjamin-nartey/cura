/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { canReviewAudit, getDb, listAudit, noteDenial } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { formatWhen, purposeLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AuditPage() {
  const ctx = await requireSession();
  if (!canReviewAudit(ctx)) {
    noteDenial(getDb(), ctx, "audit.read", "AuditEvent", null);
    return (
      <Shell ctx={ctx} current="audit">
        <PageHeader section="Audit" href="/audit" icon="fileSearch" eyebrow={<>Audit</>}><h1 className="page-title">Audit review is limited to auditors.</h1></PageHeader>
      </Shell>
    );
  }
  const entries = listAudit(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="audit">
      <PageHeader section="Audit" href="/audit" icon="fileSearch" eyebrow={<>{ctx.organizationName}</>} description={<>Who opened or changed a record, and whether the decision was allowed. Limited to this organization.</>}><h1 className="page-title">Access decisions</h1></PageHeader>
      <PageActions><a href="/audit/ledger">Open the access ledger</a></PageActions>
      <div className="list">
        {entries.map((entry) => (
          <article className="row" key={entry.id} style={{ gridTemplateColumns: "180px minmax(0, 1fr) auto" }}>
            <span className="mono">{formatWhen(entry.createdAt)}</span>
            <span>
              <strong>{entry.actorName}</strong>
              <span className="muted" style={{ display: "block" }}>
                {entry.action} · {entry.resourceType}
                {entry.resourceId ? ` · ${entry.resourceId}` : ""}
              </span>
            </span>
            <span>
              {entry.outcome}
              <span className="muted" style={{ display: "block" }}>
                {purposeLabel(entry.purposeOfUse)}
              </span>
            </span>
          </article>
        ))}
      </div>
    </Shell>
  );
}
