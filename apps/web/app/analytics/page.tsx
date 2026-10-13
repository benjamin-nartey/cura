import { canReviewAudit, getDb, noteDenial, readAnalytics } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReviewAudit(ctx) || ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "analytics.read", "AnalyticsMart", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="analytics">
        <p className="eyebrow">Analytics</p>
        <h1 className="page-title">The analytics mart is closed for this role.</h1>
      </Shell>
    );
  }
  const view = readAnalytics(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="analytics">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">
            Events are copied from the outbox into a separate mart. Names, dates of birth, and result values are dropped. Counts below 5 are suppressed. This is not a patient list.
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <p className="provenance">
        {view.governanceVersion} · {view.deidVersion} · {view.metricVersion} · {view.reidVersion} · {view.factCount} facts
      </p>
      <form action="/api/analytics/ingest" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Ingest outbox events</button>
      </form>
      <form action="/api/analytics/export" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Metric
          <select name="metricId" required defaultValue="events-by-type">
            <option value="events-by-type">Events by type</option>
            <option value="events-by-facility">Events by facility</option>
          </select>
        </label>
        <button className="btn-line" type="submit">Export counts</button>
      </form>
      <div className="board" style={{ marginTop: 16 }}>
        {view.exports.map((item) => (
          <section className="card" key={item.exportId}>
            <p className="eyebrow">{item.metricId} · {item.decision}</p>
            <p>{item.assessment.text}</p>
            <p className="provenance">
              {item.assessment.version} · minimum {item.assessment.cellMinimum}
              {(item.body?.cells ?? []).map((cell) => ` · ${cell.key} ${cell.count}`).join("")}
              {item.assessment.suppressed.length > 0 ? ` · suppressed ${item.assessment.suppressed.length}` : ""}
            </p>
          </section>
        ))}
        <section className="card wide">
          <p className="eyebrow">Lineage</p>
          {view.facts.length === 0 ? <p>No facts ingested yet.</p> : null}
          <div className="list">
            {view.facts.map((fact) => (
              <article className="row" key={fact.id}>
                <span>
                  <strong>{fact.eventType}</strong>
                  <span className="muted" style={{ display: "block" }}>
                    {fact.facilityId ?? "No facility id"} · dropped {fact.droppedKeys.join(", ") || "none"} · {formatWhen(fact.ingestedAt)}
                  </span>
                </span>
                <span className="mono">{fact.outboxId.slice(0, 8)}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
