import { getDb, noteDenial, readEnterprise } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function EnterprisePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (ctx.role !== "admin") {
    noteDenial(getDb(), ctx, "enterprise.read", "EnterpriseResidency", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="enterprise">
        <p className="eyebrow">Enterprise</p>
        <h1 className="page-title">Enterprise controls are closed for this role.</h1>
      </Shell>
    );
  }
  const view = readEnterprise(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="enterprise">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Enterprise · {view.regionVersion}</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">
            {view.residencyNote} {view.rpoNote} {view.rtoNote} {view.ssoNote} {view.keyNote} {view.linkNote} {view.apiNote} {view.moveNote}
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form action="/api/enterprise/residency" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <input type="hidden" name="region" value="local-sqlite" />
        <button className="btn-line" type="submit">Pin local-sqlite</button>
      </form>
      <form action="/api/enterprise/federation" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Record identity provider as not connected</button>
      </form>
      <form action="/api/enterprise/key" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Record customer key as not configured</button>
      </form>
      <form action="/api/enterprise/drill" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Read the local database</button>
      </form>
      <form action="/api/enterprise/grant" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Grant label
          <input name="label" type="text" required minLength={2} maxLength={40} />
        </label>
        <button className="btn-line" type="submit">Store local session grant</button>
      </form>
      <form action="/api/enterprise/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Ask the gateway</button>
      </form>
      <div className="board" style={{ marginTop: 16 }}>
        <section className="card">
          <p className="eyebrow">{view.region ?? "unpinned"}</p>
          <h2>Residency</h2>
          <p>{view.residencyNote}</p>
          <p>{view.federation ? view.ssoNote : "Identity provider status is not stored."}</p>
          <p>{view.key ? view.keyNote : "Customer key status is not stored."}</p>
        </section>
        {view.drills.map((drill) => (
          <section className="card" key={drill.id}>
            <p className="eyebrow">{drill.failover} · schema {drill.schemaVersion}</p>
            <h2>Local read</h2>
            <p>{drill.note}</p>
            <p className="muted">{drill.elapsedMs} ms</p>
          </section>
        ))}
        {view.grants.map((grant) => (
          <section className="card" key={grant.id}>
            <p className="eyebrow">{grant.status} · {grant.scope}</p>
            <h2>{grant.label}</h2>
            <p>{view.apiNote}</p>
          </section>
        ))}
      </div>
    </Shell>
  );
}
