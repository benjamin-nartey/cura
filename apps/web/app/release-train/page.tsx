import { getDb, noteDenial, readReleaseTrain } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function ReleaseTrainPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "release.read", "ReleaseDossier", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="release-train">
        <p className="eyebrow">Release train</p>
        <h1 className="page-title">The release train is closed for this role.</h1>
      </Shell>
    );
  }
  const view = readReleaseTrain(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="release-train">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Release train · {view.strategyVersion}</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">
            {view.strategyNote} {view.dossierNote} {view.traceNote} {view.traceDocs.join(", ")}. {view.riskNote} {view.validationNote} {view.clinicalNote} {view.changeNote} {view.surveillanceNote} {view.attemptNote} {view.aiNote}
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form action="/api/release-train/strategy" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <input type="hidden" name="jurisdiction" value="local-synthetic" />
        <button className="btn-line" type="submit">Store strategy as not-approved</button>
      </form>
      <form action="/api/release-train/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Ask the gateway</button>
      </form>
      <div className="board" style={{ marginTop: 16 }}>
        {view.strategies.map((strategy) => (
          <section className="card" key={strategy.id}>
            <p className="eyebrow">{strategy.status} · {strategy.jurisdiction}</p>
            <h2>Strategy</h2>
            <p>{view.strategyNote}</p>
            <form action="/api/release-train/dossier" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="strategyId" value={strategy.id} />
              <label className="field">
                Dossier label
                <input name="label" type="text" required minLength={2} maxLength={40} />
              </label>
              <button className="btn-line" type="submit">Store dossier</button>
            </form>
          </section>
        ))}
        {view.dossiers.map((dossier) => (
          <section className="card" key={dossier.id}>
            <p className="eyebrow">{dossier.label}</p>
            <h2>Dossier</h2>
            <p>{view.dossierNote}</p>
            <p className="muted">{dossier.id}</p>
            <p>{dossier.trace ? view.traceNote : "Trace is not stored."}</p>
            <p>{dossier.risk ? `not-reviewed. ${view.riskNote}` : "Risk file is not stored."}</p>
            <p>{dossier.validation ? `refused. ${view.validationNote}` : "Validation is not stored."}</p>
            <p>{dossier.clinical ? `not-performed. ${view.clinicalNote}` : "Clinical evaluation is not stored."}</p>
            <p>{dossier.change ? `not-authorized. ${view.changeNote}` : "Change plan is not stored."}</p>
            <p>{dossier.surveillance ? `not-active. ${view.surveillanceNote} Stored gateway refusals: ${dossier.surveillance.refusalCount}.` : "Surveillance is not stored."}</p>
            <form action="/api/release-train/trace" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="dossierId" value={dossier.id} />
              <button className="btn-line" type="submit">Store local trace</button>
            </form>
            <form action="/api/release-train/risk" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="dossierId" value={dossier.id} />
              <button className="btn-line" type="submit">Store unsigned risk file</button>
            </form>
            <form action="/api/release-train/validation" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="dossierId" value={dossier.id} />
              <button className="btn-line" type="submit">Run the refusal gate</button>
            </form>
            <form action="/api/release-train/clinical" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="dossierId" value={dossier.id} />
              <button className="btn-line" type="submit">Record clinical evaluation as not performed</button>
            </form>
            <form action="/api/release-train/change" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="dossierId" value={dossier.id} />
              <button className="btn-line" type="submit">Record change plan as not authorized</button>
            </form>
            <form action="/api/release-train/surveillance" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="dossierId" value={dossier.id} />
              <button className="btn-line" type="submit">Record surveillance as not active</button>
            </form>
            {dossier.authorId !== ctx.userId ? (
              <form action="/api/release-train/attempt" method="post" className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="hidden" name="dossierId" value={dossier.id} />
                <button className="btn-line" type="submit">Record release attempt</button>
              </form>
            ) : null}
          </section>
        ))}
        {view.attempts.map((attempt) => (
          <section className="card" key={attempt.id}>
            <p className="eyebrow">{attempt.outcome}</p>
            <h2>Release attempt</h2>
            <p>{view.attemptNote}</p>
          </section>
        ))}
      </div>
    </Shell>
  );
}
