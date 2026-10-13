import { GATEWAY_PROMPT, gatewayPolicy, getDb, listGatewayAttempts, readGatewayAttempt } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

const OUTCOME_COPY: Record<string, string> = {
  policy: "No model is enabled. Nothing was generated.",
  "no-model": "No allowed model is registered. Nothing was generated.",
  budget: "The token budget blocked the attempt. Nothing was generated.",
  "provider-down": "The provider did not answer. Nothing was generated.",
  schema: "The response did not pass the output check.",
};

export default async function GatewayPage({ searchParams }: { searchParams: Promise<{ trace?: string; error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const policy = gatewayPolicy(getDb(), ctx);
  const attempts = listGatewayAttempts(getDb(), ctx);
  const trace = query.trace && /^trc_[A-Za-z0-9-]{1,80}$/.test(query.trace) ? readGatewayAttempt(getDb(), ctx, query.trace) : null;
  return (
    <Shell ctx={ctx} current="gateway">
      <p className="eyebrow">{ctx.organizationName}</p>
      <h1 className="page-title">Model gateway</h1>
      <p className="lede">
        Clinical generation is closed. This page records the attempt, the prompt version, and the model version. It does not call a provider, and it does not keep the text you submit.
      </p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="stack">
        <section className="card">
          <p className="eyebrow">Policy</p>
          <p>
            Token budget {policy.quota.tokenBudget}. Used {policy.quota.tokensUsed}.
          </p>
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
          {query.trace && !trace ? <p>That trace is not in this organization.</p> : null}
          {trace ? (
            <p>
              <span className="provenance">
                {trace.traceId} · {trace.modelId} version {trace.modelVersion}
              </span>
              <span className="muted" style={{ display: "block" }}>
                {OUTCOME_COPY[trace.reason] ?? trace.outcome}
              </span>
            </p>
          ) : null}
        </section>
        <section>
          <h2>Recent traces</h2>
          <div className="list">
            {attempts.length === 0 ? <p className="row">No attempts for this organization yet.</p> : null}
            {attempts.map((item) => (
              <article className="row" key={item.traceId} style={{ gridTemplateColumns: "180px minmax(0, 1fr) auto" }}>
                <span className="mono">{formatWhen(item.createdAt)}</span>
                <span>
                  {item.outcome}
                  <span className="provenance">
                    {item.traceId} · prompt {item.promptVersion} · model {item.modelVersion}
                  </span>
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
