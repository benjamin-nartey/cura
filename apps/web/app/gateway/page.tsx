/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { AppError, GATEWAY_PROMPT, gatewayPolicy, getDb, listGatewayAttempts, readGatewayAttempt, readGatewayLifecycle } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import Link from "next/link";
import { requireSession } from "@/lib/session";

const OUTCOME_COPY: Record<string, string> = {
  policy: "No model is enabled. Nothing was generated.",
  "no-model": "No allowed model is registered. Nothing was generated.",
  budget: "The tenant token budget is exhausted. Continue with manual review.",
  "provider-down": "The provider is unavailable. Continue with manual review.",
  "provider-timeout": "The provider missed its deadline. Continue with manual review.",
  "circuit-open": "The provider is temporarily paused after repeated failures. Continue with manual review.",
  schema: "The response did not pass the output check.",
  "release-not-approved": "The selected prompt and model pair needs an active passing release.",
};

export default async function GatewayPage({ searchParams }: { searchParams: Promise<{ trace?: string; error?: string; facility?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const policy = gatewayPolicy(getDb(), ctx);
  const attempts = listGatewayAttempts(getDb(), ctx);
  const trace = query.trace && /^trc_[A-Za-z0-9-]{1,80}$/.test(query.trace) ? readGatewayAttempt(getDb(), ctx, query.trace) : null;
  const facility = query.facility ?? ctx.facilityId ?? "";
  let lifecycle: ReturnType<typeof readGatewayLifecycle> | null = null;
  if (ctx.role === "admin" && facility) {
    try {
      lifecycle = readGatewayLifecycle(getDb(),ctx,facility);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  return (
    <Shell ctx={ctx} current="gateway">
      <PageHeader section="Gateway" href="/gateway" icon="shield" eyebrow={<>{ctx.organizationName}</>} description={<>
        Inspect synthetic model activity, usage limits, and evidence references. Clinical generation is closed.
      </>}><h1 className="page-title">Model gateway</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="stack">
        {ctx.role === "admin" && <section className="card" aria-labelledby="gateway-lifecycle">
          <h2 id="gateway-lifecycle">Synthetic release registry</h2>
          <form action="/gateway" className="form-grid">
            <label className="field">Facility identifier
              <input name="facility" defaultValue={facility} required maxLength={80} />
            </label>
            <button className="btn-line" type="submit">View release history</button>
          </form>
          {facility && !lifecycle && <p>Registry access is unavailable for this facility.</p>}
          {lifecycle && <>
            <p>Alias revision {lifecycle.alias.revision} · {lifecycle.alias.evaluation_id ?? "Disabled"}</p>
            {lifecycle.activeRelease ? <p>Eligible pair {lifecycle.activeRelease.pair.promptId} v{lifecycle.activeRelease.pair.promptVersion} · {lifecycle.activeRelease.pair.modelId} v{lifecycle.activeRelease.pair.modelVersion}</p>
              : <p>Release unavailable. A current passing evaluation must be selected.</p>}
            <h3>Registered versions</h3>
            <ul>{lifecycle.versions.map(item => <li key={`${item.kind}-${item.id}-${item.version}`}>{item.kind} · {item.id} · version {item.version}</li>)}</ul>
            <h3>Evaluations</h3>
            <ul>{lifecycle.evaluations.map(item => <li key={item.id}>{item.prompt_id} v{item.prompt_version} · {item.model_id} v{item.model_version} · {item.verdict} · {item.evidence_ref} · {item.id}</li>)}</ul>
            <h3>Alias history</h3>
            <ul>{lifecycle.aliasHistory.map(item => <li key={item.revision}>Revision {item.revision} · {item.evaluation_id ?? "Disabled"}</li>)}</ul>
          </>}
        </section>}
        <section className="card">
          <h2>Budget and provider status</h2>
          <p>{policy.quota.tokensUsed.toLocaleString()} of {policy.quota.tokenBudget.toLocaleString()} estimated input units used</p>
          <p>{policy.quota.tokensUsed >= policy.quota.tokenBudget ? "Budget exhausted" : "Budget available"}</p>
          {policy.circuits.length === 0 && <p>No paused provider routes in your scope.</p>}
          {policy.circuits.map(circuit => (
            <p key={`${circuit.provider}-${circuit.model_id}-${circuit.model_version}`}>
              {circuit.provider} · {circuit.model_id} v{circuit.model_version} ·{" "}
              {circuit.open_until > Date.now() ? `Paused until ${formatWhen(new Date(circuit.open_until).toISOString())}` : "Eligible for a recovery probe"}
            </p>
          ))}
          {policy.models.map((model) => (
            <p key={`${model.id}-${model.version}`}>
              {model.id} · version {model.version} · {model.provider} · {model.status}
            </p>
          ))}
          {policy.prompts.map((prompt) => (
            <p key={`${prompt.id}-${prompt.version}`}>
              {prompt.name} · version {prompt.version} · {prompt.status}
            </p>
          ))}
        </section>
        <section className="card">
          <p className="eyebrow">Attempt</p>
          <form className="form-grid" action="/api/gateway/invoke" method="post">
            <input type="hidden" name="promptId" value={GATEWAY_PROMPT.id} />
            <input type="hidden" name="promptVersion" value={GATEWAY_PROMPT.version} />
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Text sent to the gateway
              <textarea name="text" required minLength={1} maxLength={2000} rows={4} />
            </label>
            <button className="btn-dark" type="submit">
              Submit attempt
            </button>
          </form>
          {query.trace && !trace ? <p>That trace is unavailable in your workspace.</p> : null}
          {trace ? (
            <section className="stack" aria-labelledby="gateway-trace">
              <h2 id="gateway-trace">Trace details</h2>
              <p>{trace.outcome === "accepted" ? "Output passed validation." : OUTCOME_COPY[trace.reason] ?? trace.outcome}</p>
              <dl>
                <dt>Correlation ID</dt><dd className="mono">{trace.traceId}</dd>
                <dt>Provider</dt><dd>{trace.provider ?? (trace.latencyMs === null ? "Unavailable" : "No provider selected")}</dd>
                <dt>Prompt</dt><dd>{trace.promptId} v{trace.promptVersion}</dd>
                <dt>Model</dt><dd>{trace.modelId} v{trace.modelVersion}</dd>
                <dt>Latency</dt><dd>{trace.latencyMs === null ? "Unavailable" : `${trace.latencyMs} ms`}</dd>
                <dt>Estimated input units</dt><dd>{trace.estimatedInputUnits ?? "Unavailable"}</dd>
              </dl>
              <h3>Provider-reported evidence references</h3>
              {trace.citationReferences.length > 0
                ? <ul>{trace.citationReferences.map((reference,index) => <li key={index}>{reference}</li>)}</ul>
                : <p>No evidence references recorded.</p>}
              <p>Synthetic output requires human review. Verify any references against the source before use.</p>
            </section>
          ) : null}
        </section>
        <section>
          <SectionHeading icon="shield"><h2>Recent traces</h2></SectionHeading>
          <div className="list">
            {attempts.length === 0 ? <p className="row">No attempts for this organization yet.</p> : null}
            {attempts.map((item) => (
              <article className="row" key={item.traceId} style={{ gridTemplateColumns: "180px minmax(0, 1fr) auto" }}>
                <span className="mono">{formatWhen(item.createdAt)}</span>
                <span>
                  {item.outcome}
                  <Link className="provenance" href={{pathname:"/gateway",query:{trace:item.traceId,...(facility ? {facility} : {})}}}>
                    {item.traceId} · prompt {item.promptVersion} · model {item.modelVersion}
                  </Link>
                </span>
                <span className="muted">{item.reason}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
