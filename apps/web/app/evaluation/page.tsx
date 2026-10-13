import { getDb, noteDenial, readEvaluation } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "eval.read", "EvalDataset", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="evaluation">
        <p className="eyebrow">Evaluation</p>
        <h1 className="page-title">Evaluation records are closed for this role.</h1>
      </Shell>
    );
  }
  const view = readEvaluation(getDb(), ctx);
  const waiting = view.approvals.filter((item) => item.status === "awaiting" && item.requesterId !== ctx.userId);
  const signed = view.approvals.filter((item) => item.status === "signed");
  return (
    <Shell ctx={ctx} current="evaluation">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Evaluation · {view.goldenVersion}</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">{view.modelCard} {view.promptCard} {view.subgroupNote} {view.driftNote} {view.holdNote}</p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form action="/api/evaluation/dataset" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Store golden dataset</button>
      </form>
      {view.datasets.length > 0 ? (
        <form action="/api/evaluation/run" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Dataset
            <select name="datasetId" required>
              {view.datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>Version {dataset.version}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Run refusal suite</button>
        </form>
      ) : null}
      {view.runs.length > 0 ? (
        <form action="/api/evaluation/request" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Passed run
            <select name="runId" required>
              {view.runs.filter((run) => run.outcome === "passed").map((run) => (
                <option key={run.id} value={run.id}>{run.outcome}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Request a hold</button>
        </form>
      ) : null}
      {waiting.length > 0 ? (
        <form action="/api/evaluation/sign" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Waiting hold
            <select name="approvalId" required>
              {waiting.map((item) => (
                <option key={item.id} value={item.id}>{item.runId}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Sign hold</button>
        </form>
      ) : null}
      {signed.length > 0 ? (
        <form action="/api/evaluation/promote" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Signed run
            <select name="runId" required>
              {signed.map((item) => (
                <option key={item.id} value={item.runId}>{item.decision}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Record promotion attempt</button>
        </form>
      ) : null}
      <div className="board" style={{ marginTop: 16 }}>
        {view.runs.map((run) => (
          <section className="card wide" key={run.id}>
            <p className="eyebrow">{run.outcome} · {run.rollback.modelId} {run.rollback.status}</p>
            <h2>Refusal suite</h2>
            <p>{run.rollback.note}</p>
            {run.cases.map((item) => (
              <p key={item.id} className="provenance">{item.id} · expected {item.expected} · actual {item.actual}</p>
            ))}
          </section>
        ))}
        {view.promotions.map((item) => (
          <section className="card" key={item.id}>
            <p className="eyebrow">{item.outcome}</p>
            <h2>Promotion attempt</h2>
            <p>{view.holdNote}</p>
          </section>
        ))}
      </div>
    </Shell>
  );
}
