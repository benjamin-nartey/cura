import { canReadChart, getDb, listAgentRuns, listPatients, noteDenial, readAgentRun } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

const STATUS_COPY: Record<string, string> = {
  "awaiting-approval": "Waiting for another person at this facility.",
  completed: "The review was approved. The chart was not changed.",
  refused: "The review was declined. The chart was not changed.",
  failed: "The run stopped before a decision.",
  running: "The run is still open.",
};

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ run?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "agent.run", "AgentRun", null);
    return (
      <Shell ctx={ctx} current="agents">
        <p className="eyebrow">Agents</p>
        <h1 className="page-title">The chart is closed for this role.</h1>
        <p className="lede">Audit review does not open agent runs.</p>
      </Shell>
    );
  }
  const patients = listPatients(getDb(), ctx);
  const runs = listAgentRuns(getDb(), ctx);
  const selected = query.run && /^run_[A-Za-z0-9-]{1,80}$/.test(query.run) ? readAgentRun(getDb(), ctx, query.run) : null;
  return (
    <Shell ctx={ctx} current="agents">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Agent runtime</h1>
      <p className="lede">
        Chart review lists source identifiers and waits for a second person at this facility. It does not call a model, and approval does not change the chart.
      </p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="stack">
        <section className="card">
          <p className="eyebrow">Start</p>
          <form className="form-grid" action="/api/agents/run" method="post">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Patient
              <select name="patientId" required>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.familyName}, {patient.givenName}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-dark" type="submit">
              Start chart review
            </button>
          </form>
        </section>
        {query.run && !selected ? <p>That run is not in this facility.</p> : null}
        {selected ? (
          <section className="card">
            <p className="eyebrow">Run</p>
            <p>
              <span className="provenance">
                {selected.runId} · {selected.agentId} version {selected.agentVersion}
              </span>
              <span className="muted" style={{ display: "block" }}>
                {STATUS_COPY[selected.status] ?? selected.status}
              </span>
            </p>
            <p className="provenance">{selected.sourceIds.join(" · ") || "No source identifiers stored."}</p>
            {selected.approvalStatus === "pending" && selected.requestedBy === ctx.userId ? (
              <p>Waiting for another person at this facility.</p>
            ) : null}
            {selected.approvalStatus === "pending" && selected.requestedBy !== ctx.userId && selected.approvalId ? (
              <div className="form-grid">
                <form action="/api/agents/approval" method="post">
                  <input type="hidden" name="approvalId" value={selected.approvalId} />
                  <input type="hidden" name="runId" value={selected.runId} />
                  <input type="hidden" name="decision" value="approved" />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <button className="btn-dark" type="submit">
                    Approve review
                  </button>
                </form>
                <form action="/api/agents/approval" method="post">
                  <input type="hidden" name="approvalId" value={selected.approvalId} />
                  <input type="hidden" name="runId" value={selected.runId} />
                  <input type="hidden" name="decision" value="declined" />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <button className="btn-text" type="submit">
                    Decline review
                  </button>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}
        <section>
          <h2>Recent runs</h2>
          <div className="list">
            {runs.length === 0 ? <p className="row">No runs for this facility yet.</p> : null}
            {runs.map((item) => (
              <article className="row" key={item.runId} style={{ gridTemplateColumns: "180px minmax(0, 1fr) auto" }}>
                <span className="mono">{formatWhen(item.createdAt)}</span>
                <span>
                  {item.status}
                  <span className="provenance">
                    {item.runId} · {item.patientId}
                  </span>
                </span>
                <a href={`/agents?run=${item.runId}`}>Open</a>
              </article>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
