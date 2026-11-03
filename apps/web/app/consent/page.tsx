import { consentOverview, effectivePermissions, getDb, listConsents } from "@curasphere/domain";
import { ForbiddenError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { consentActor } from "@/lib/consent";
import { requireSession } from "@/lib/session";

export default async function ConsentOverviewPage() {
  const ctx = await requireSession();
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.read")) {
    return (
      <Shell ctx={ctx} current="consent">
        <p className="eyebrow">Consent</p>
        <h1 className="page-title">Consent records are limited to authorized staff.</h1>
      </Shell>
    );
  }
  let overview = { total: 0, active: 0, pending: 0, withdrawn: 0, expired: 0, awaitingVerification: 0 };
  try {
    overview = consentOverview(getDb(), consentActor(ctx));
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
  }
  return (
    <Shell ctx={ctx} current="consent">
      <p className="eyebrow">Experimental consent</p>
      <h1 className="page-title">Consent overview</h1>
      <p className="lede">Synthetic development policies only. This screen is not a formal Phase 03 acceptance and does not choose a production jurisdiction.</p>
      <div className="list">
        <p>Total {overview.total}</p>
        <p>Active {overview.active}</p>
        <p>Pending {overview.pending}</p>
        <p>Awaiting verification {overview.awaitingVerification}</p>
        <p>Withdrawn {overview.withdrawn}</p>
        <p>Expired {overview.expired}</p>
      </div>
      <p><a href="/consent/directory">Open the directory</a></p>
      {access.permissions.includes("consent.record") ? <p><a href="/consent/new">Record a consent</a></p> : null}
      {access.permissions.includes("consent.policy.evaluate") && process.env.CURASPHERE_ENV !== "production" && process.env.CURASPHERE_ENV !== "staging" ? <p><a href="/consent/inspect">Inspect a processing decision</a></p> : null}
      {listConsents(getDb(), consentActor(ctx)).length === 0 ? <p>No consent directives are stored for this organization.</p> : null}
    </Shell>
  );
}
