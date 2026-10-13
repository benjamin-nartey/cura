import { canReadChart, getDb, noteDenial, readOperations } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "operations.read", "OperationsState", ctx.facilityId);
    return (
      <Shell ctx={ctx} current="operations">
        <p className="eyebrow">Operations</p>
        <h1 className="page-title">The operations comparison is closed for this role.</h1>
      </Shell>
    );
  }
  const view = readOperations(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="operations">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="page-title">{ctx.facilityName}</h1>
          <p className="lede">
            Each sentence compares stored rows and shows its factors and confidence. A hold keeps that sentence. This page does not forecast, staff, or direct care.
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <p className="muted">
        {view.built ? `Version ${view.version} · built ${formatWhen(view.builtAt ?? "")}` : "Not built yet."}
        {view.stale ? " · source rows changed after this build" : ""}
        {view.eventsPending ? " · an event is waiting" : ""}
      </p>
      <form action="/api/operations/rebuild" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Rebuild from stored rows</button>
      </form>
      {view.state ? (
        <section className="card wide" style={{ marginTop: 16 }}>
          <p className="eyebrow">Measured change · {view.state.kpi.version}</p>
          <p>{view.state.kpi.text}</p>
        </section>
      ) : null}
      <div className="board" style={{ marginTop: 16 }}>
        {(view.state?.recommendations ?? []).map((item) => (
          <section className="card" key={item.kind}>
            <p className="eyebrow">{item.kind} · {item.confidence}</p>
            <p>{item.text}</p>
            <p className="provenance">
              {item.confidenceVersion}
              {item.factors.map((factor) => ` · ${factor.name} ${factor.value} (${factor.sourceTable})`).join("")}
            </p>
            {item.override ? <p className="muted">Held {formatWhen(item.override.createdAt)}. {item.override.reason}</p> : null}
          </section>
        ))}
        <section className="card">
          <p className="eyebrow">On-hand count</p>
          <p className="muted">A stored count is not a forecast of later use.</p>
          <form action="/api/operations/inventory" method="post" className="form-grid">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Label
              <input name="label" type="text" required minLength={2} maxLength={80} />
            </label>
            <label className="field">
              On hand
              <input name="onHand" type="number" required min={0} max={100000} step={1} />
            </label>
            <button className="btn-line" type="submit">Store count</button>
          </form>
        </section>
        <section className="card">
          <p className="eyebrow">Hold</p>
          <p className="muted">A hold is stored beside the sentence. The sentence stays.</p>
          <form action="/api/operations/override" method="post" className="form-grid">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Comparison
              <select name="kind" required defaultValue="staffing">
                <option value="wait">Wait</option>
                <option value="capacity">Capacity</option>
                <option value="inventory">Inventory</option>
                <option value="staffing">Staffing</option>
                <option value="bottleneck">Bottleneck</option>
              </select>
            </label>
            <label className="field">
              Reason
              <input name="reason" type="text" required minLength={8} maxLength={240} />
            </label>
            <button className="btn-line" type="submit">Hold this comparison</button>
          </form>
        </section>
        <section className="card">
          <p className="eyebrow">Explanation</p>
          <p className="muted">The gateway cannot replace a stored comparison.</p>
          <form action="/api/operations/explain" method="post">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <button className="btn-text" type="submit">Ask the gateway</button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
