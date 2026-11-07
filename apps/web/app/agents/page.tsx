/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { AppError, agentExecutionStopped, assertLocalHealthcareSandbox, agentPatientIds, canReadChart, getDb, listAgentApprovalInbox, listAgentRuns, listPatients, noteDenial, readAgentRun, readChartAgentPolicy } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

const STATUS_COPY: Record<string, string> = {
  "awaiting-approval": "Waiting for another person at this facility.",
  completed: "The review was approved. The chart was not changed.",
  refused: "The review stopped. The chart was not changed.",
  failed: "The run stopped before a decision.",
  running: "The run is still open.",
};

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ run?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const stopped = agentExecutionStopped(getDb(),ctx);
  let canControl = false;
  if (ctx.role === "admin" && ctx.purposeOfUse === "OPERATIONS" && ctx.facilityId === null) {
    try {
      assertLocalHealthcareSandbox();
      canControl = true;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  if (canControl) {
    return (
      <Shell ctx={ctx} current="agents">
        <PageHeader section="Agents" href="/agents" icon="bot" eyebrow={<>Operations</>}><h1 className="page-title">Agent execution controls</h1></PageHeader>
        <Feedback error={feedback.error} notice={feedback.notice} />
        <section className="card">
          <p role="status">{stopped ? "Agent execution is stopped for this organization." : "Agent execution is enabled for this organization."}</p>
          <p>Stopping execution closes active runs and prevents new runs and approvals. Reviewers can still decline requests.</p>
          <form action="/api/agents/run" method="post">
            <button className="btn-dark" name="action" value={stopped ? "enable-execution" : "stop-execution"} type="submit">
              {stopped ? "Enable agent execution" : "Stop agent execution"}
            </button>
          </form>
        </section>
      </Shell>
    );
  }
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "agent.run", "AgentRun", null);
    return (
      <Shell ctx={ctx} current="agents">
        <PageHeader section="Agents" href="/agents" icon="bot" eyebrow={<>Agents</>} description={<>Audit review does not open agent runs.</>}><h1 className="page-title">The chart is closed for this role.</h1></PageHeader>
      </Shell>
    );
  }
  let policy: ReturnType<typeof readChartAgentPolicy> = null;
  try {
    policy = readChartAgentPolicy(getDb(),ctx);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
  const related = new Set(agentPatientIds(getDb(),ctx));
  const patients = listPatients(getDb(),ctx).filter(patient => related.has(patient.id));
  const inbox = listAgentApprovalInbox(getDb(),ctx);
  const runs = listAgentRuns(getDb(), ctx);
  const selected = query.run && /^run_[A-Za-z0-9-]{1,80}$/.test(query.run) ? readAgentRun(getDb(), ctx, query.run) : null;
  return (
    <Shell ctx={ctx} current="agents">
      <PageHeader section="Agents" href="/agents" icon="bot" eyebrow={<>{ctx.facilityName}</>} description={<>
        Chart review lists source identifiers and waits for a second person at this facility. It does not call a model, and approval does not change the chart.
      </>}><h1 className="page-title">Agent runtime</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="stack">
        {stopped && <p role="status">Agent execution is stopped for this organization. You can still decline pending reviews.</p>}
        <section className="card">
          <h2>Chart review permissions</h2>
          {policy ? <p>Manifest v{policy.version} · Owner {policy.owner} · Facility chart sources · Separate reviewer required</p>
            : <p>The chart review policy is unavailable.</p>}
          <p>Model budget is zero. The agent returns source identifiers for review.</p>
          {patients.length === 0 && <p>No patients with a recorded encounter for your account.</p>}
          <p className="eyebrow">Start</p>
          <form className="form-grid" action="/api/agents/run" method="post">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Patient
              <select aria-label="Patient" name="patientId" required>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.familyName}, {patient.givenName}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-dark" type="submit" disabled={stopped || !policy?.canStart || patients.length === 0}>
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
                {selected.approvalStatus === "expired" ? "The approval request expired." : STATUS_COPY[selected.status] ?? selected.status}
              </span>
            </p>
            <h2>Run trace</h2>
            <p>Execution attempts {selected.attempts} · Recorded checkpoints {selected.checkpoints.length}</p>
            {selected.checkpoints.length === 0 ? <p>No checkpoints recorded yet.</p> : (
              <ol>{selected.checkpoints.map((step,index) => (
                <li key={index}>{step.toolId} · {step.status} · {formatWhen(step.recordedAt)}</li>
              ))}</ol>
            )}
            <p className="provenance">{selected.sourceIds.join(" · ") || "No source identifiers stored."}</p>
            {selected.canCancel && process.env.CURASPHERE_AGENT_TEMPORAL === "true" && (
              <form action="/api/agents/run" method="post">
                <input type="hidden" name="action" value="cancel" />
                <input type="hidden" name="runId" value={selected.runId} />
                <button className="btn-line" type="submit">Cancel chart review</button>
              </form>
            )}
            {selected.approvalStatus === "pending" && selected.requestedBy === ctx.userId ? (
              <p>Waiting for another person at this facility.</p>
            ) : null}
            {selected.approvalStatus === "pending" && selected.approvalExpiresAt && (
              <p>Review due {formatWhen(selected.approvalExpiresAt)}</p>
            )}
            {selected.canDecideApproval && selected.approvalId ? (
              <div className="form-grid">
                <p>Approve to complete the review record. Decline to stop it. Neither decision changes the chart or starts a model.</p>
                <form action="/api/agents/approval" method="post">
                  <input type="hidden" name="approvalId" value={selected.approvalId} />
                  <input type="hidden" name="runId" value={selected.runId} />
                  <input type="hidden" name="decision" value="approved" />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <button className="btn-dark" type="submit" disabled={stopped}>
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
          <SectionHeading icon="bot"><h2>Review inbox</h2></SectionHeading>
          <div className="list">
            {inbox.length === 0 && <p className="row">No reviews awaiting your decision.</p>}
            {inbox.map(item => (
              <article className="row" key={item.runId}>
                <span>Review due {item.approvalExpiresAt && formatWhen(item.approvalExpiresAt)}</span>
                <a href={`/agents?run=${item.runId}`}>Open review</a>
              </article>
            ))}
          </div>
        </section>
        <section>
          <SectionHeading icon="bot"><h2>Recent runs</h2></SectionHeading>
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
