/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { getDb, noteDenial, readModules } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function ModulesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "module.read", "AiModule", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="modules">
        <PageHeader section="Modules" href="/modules" icon="boxes" eyebrow={<>Modules</>}><h1 className="page-title">Module cards are closed for this role.</h1></PageHeader>
      </Shell>
    );
  }
  const view = readModules(getDb(), ctx);
  const stored = new Set(view.modules.map((item) => item.code));
  return (
    <Shell ctx={ctx} current="modules">
      <header className="chart-head">
        <div>
          <PageHeader section="Modules" href="/modules" icon="boxes" eyebrow={<>Modules · {view.catalogVersion}</>} description={<>{view.platformNote} {view.aiNote}</>}><h1 className="page-title">{ctx.organizationName}</h1></PageHeader>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <section className="page-form card"><form action="/api/modules/platform" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Approve every module</button>
      </form></section>
      <section className="page-form card"><form action="/api/modules/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Ask the gateway</button>
      </form></section>
      <div className="board" style={{ marginTop: 16 }}>
        {view.catalog.map((item) => (
          <section className="card" key={item.code}>
            <p className="eyebrow">{item.code}</p>
            <SectionHeading icon="boxes"><h2>{item.intendedUse}</h2></SectionHeading>
            <p>{item.modelCard}</p>
            {stored.has(item.code) ? null : (
              <form action="/api/modules/record" method="post" className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="hidden" name="code" value={item.code} />
                <button className="btn-line" type="submit">Store {item.code} as not-cleared</button>
              </form>
            )}
          </section>
        ))}
        {view.modules.map((item) => (
          <section className="card" key={item.id}>
            <p className="eyebrow">{item.code} · {item.status}</p>
            <SectionHeading icon="boxes"><h2>{item.intendedUse}</h2></SectionHeading>
            <p>{item.modelCard}</p>
            <p>{item.datasetNote}</p>
            <p>{item.validation ? `refused. ${item.validationNote}` : "Validation is not stored."}</p>
            <p>{item.study ? `not-run. ${item.studyNote}` : "A workflow study is not stored."}</p>
            <p>{item.explainNote}</p>
            <p>{item.performance ? `not-calculated. ${item.performanceNote}` : item.performanceNote}</p>
            <p>{item.clearNote}</p>
            <p className="muted">{item.id}</p>
            {item.authorId !== ctx.userId && !item.validation ? (
              <form action="/api/modules/validation" method="post" className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="hidden" name="moduleId" value={item.id} />
                <button className="btn-line" type="submit">Record a refused validation</button>
              </form>
            ) : null}
            {item.study ? null : (
              <form action="/api/modules/study" method="post" className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="hidden" name="moduleId" value={item.id} />
                <button className="btn-line" type="submit">Record the workflow study as not run</button>
              </form>
            )}
            {item.performance ? null : (
              <form action="/api/modules/performance" method="post" className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="hidden" name="moduleId" value={item.id} />
                <button className="btn-line" type="submit">Record performance as not calculated</button>
              </form>
            )}
            <form action="/api/modules/clear" method="post" className="form-grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <input type="hidden" name="moduleId" value={item.id} />
              <button className="btn-line" type="submit">Clear {item.code}</button>
            </form>
          </section>
        ))}
      </div>
    </Shell>
  );
}
