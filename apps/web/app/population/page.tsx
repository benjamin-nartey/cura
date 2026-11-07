/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { canReviewAudit, getDb, noteDenial, readPopulation } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function PopulationPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReviewAudit(ctx) || ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "population.read", "PopulationSnapshot", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="population">
        <PageHeader section="Population" href="/population" icon="globe" eyebrow={<>Population</>}><h1 className="page-title">Population counts are closed for this role.</h1></PageHeader>
      </Shell>
    );
  }
  const view = readPopulation(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="population">
      <header className="chart-head">
        <div>
          <PageHeader section="Population" href="/population" icon="globe" eyebrow={<>Population</>} description={<>
            Counts stay inside this organization. A group below 5 is not shown. No names or result values are included. This is not a case list.
          </>}><h1 className="page-title">{ctx.organizationName}</h1></PageHeader>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <p className="provenance">
        {view.jurisdictionVersion} · {view.privacyVersion} · {view.cohortVersion} · minimum {view.cellMinimum}
        {view.jurisdiction ? ` · ${view.jurisdiction === "local-synthetic" ? "organization records" : view.jurisdiction}` : " · no jurisdiction tag"}
        {view.built ? ` · version ${view.version} · ${formatWhen(view.builtAt ?? "")}` : " · not built"}
        {view.stale ? " · source rows changed after this build" : ""}
      </p>
      <section className="page-form card"><form action="/api/population/jurisdiction" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Jurisdiction tag
          <select aria-label="Jurisdiction tag" name="tag" required defaultValue={view.jurisdiction === "restricted" ? "restricted" : "local-synthetic"}>
            <option value="local-synthetic">Organization records</option>
            <option value="restricted">Restricted</option>
          </select>
        </label>
        <button className="btn-line" type="submit">Store tag</button>
      </form></section>
      <section className="page-form card"><form action="/api/population/build" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Build counts</button>
      </form></section>
      {view.state ? <p style={{ marginTop: 16 }}>{view.state.text}</p> : null}
      <div className="board" style={{ marginTop: 16 }}>
        {(view.state?.cohorts ?? []).map((cohort) => (
          <section className="card" key={cohort.id}>
            <p className="eyebrow">{cohort.label} · {cohort.status}</p>
            <p>{cohort.text}</p>
            {cohort.facilities.length > 0 ? (
              <p className="provenance">{cohort.facilities.map((item) => `${item.facilityId} ${item.count}`).join(" · ")}</p>
            ) : null}
          </section>
        ))}
      </div>
    </Shell>
  );
}
