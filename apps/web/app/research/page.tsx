import { canReviewAudit, getDb, noteDenial, readResearch } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReviewAudit(ctx) || ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "research.read", "ResearchWorkspace", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="research">
        <p className="eyebrow">Research</p>
        <h1 className="page-title">Research workspaces are closed for this role.</h1>
      </Shell>
    );
  }
  const view = readResearch(getDb(), ctx);
  const datasets = view.workspaces.flatMap((workspace) => workspace.datasets);
  const pending = view.workspaces.flatMap((workspace) => workspace.exports).filter((item) => item.status === "awaiting-approval" && item.requesterId !== ctx.userId);
  return (
    <Shell ctx={ctx} current="research">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Research</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">
            A workspace freezes the stored population counts. The ethics label is not an approval. No analysis notebook is running. An export waits for a different auditor.
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form action="/api/research/workspace" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Title
          <input name="title" type="text" required minLength={2} maxLength={80} />
        </label>
        <label className="field">
          Protocol label
          <input name="protocolLabel" type="text" required minLength={2} maxLength={80} />
        </label>
        <button className="btn-line" type="submit">Open workspace</button>
      </form>
      {view.workspaces.length > 0 ? (
        <form action="/api/research/snapshot" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Workspace
            <select name="workspaceId" required>
              {view.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.title}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Freeze dataset</button>
        </form>
      ) : null}
      {datasets.length > 0 ? (
        <form action="/api/research/export" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Dataset
            <select name="datasetId" required>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>Version {dataset.version}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Request export</button>
        </form>
      ) : null}
      {pending.length > 0 ? (
        <form action="/api/research/decision" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Waiting export
            <select name="exportId" required>
              {pending.map((item) => (
                <option key={item.id} value={item.id}>{item.id}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Decision
            <select name="decision" required defaultValue="approve">
              <option value="approve">Approve</option>
              <option value="decline">Decline</option>
            </select>
          </label>
          <button className="btn-line" type="submit">Record decision</button>
        </form>
      ) : null}
      <div className="board" style={{ marginTop: 16 }}>
        {view.workspaces.map((workspace) => (
          <section className="card wide" key={workspace.id}>
            <p className="eyebrow">{workspace.protocolLabel} · {workspace.ethicsStatus} · {workspace.purposeOfUse}</p>
            <h2>{workspace.title}</h2>
            <p>{workspace.ethicsNote}</p>
            <p className="muted">Opened {formatWhen(workspace.createdAt)}</p>
            {workspace.datasets.map((dataset) => (
              <p key={dataset.id} className="provenance">
                Dataset version {dataset.version} · population {dataset.populationVersion} · {dataset.notebookNote}
              </p>
            ))}
            {workspace.exports.map((item) => (
              <p key={item.id} className="provenance">
                Export {item.status}
                {item.approverId ? ` · approver ${item.approverId}` : ""}
                {item.body ? ` · ${item.body.text}` : ""}
              </p>
            ))}
          </section>
        ))}
      </div>
    </Shell>
  );
}
