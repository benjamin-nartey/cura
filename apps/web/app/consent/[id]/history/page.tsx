import { consentHistory, effectivePermissions, getDb } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { consentActor } from "@/lib/consent";
import { formatWhen } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function ConsentHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.history.read")) {
    return <Shell ctx={ctx} current="consent"><h1 className="page-title">Consent history is limited to authorized staff.</h1></Shell>;
  }
  try {
    const history = consentHistory(getDb(), consentActor(ctx), id);
    return (
      <Shell ctx={ctx} current="consent">
        <h1 className="page-title">Consent history</h1>
        {history.length === 0 ? <p>No versions are stored.</p> : null}
        <div className="list">
          {history.map((item) => (
            <article className="row" key={`${item.version}-${item.change_code}`}>
              <span>v{item.version}</span>
              <strong>{item.change_code}</strong>
              <span>{item.actor_id}</span>
              <span>{item.reason_code}</span>
              <span>{formatWhen(item.recorded_at)}</span>
            </article>
          ))}
        </div>
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return <Shell ctx={ctx} current="consent"><h1 className="page-title">That consent record is not available.</h1></Shell>;
  }
}
