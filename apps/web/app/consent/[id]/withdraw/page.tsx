/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readConsent } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { consentActor } from "@/lib/consent";
import { requireSession } from "@/lib/session";

export default async function WithdrawConsentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.withdraw")) {
    return <Shell ctx={ctx} current="consent"><PageHeader section="Consent" href="/consent" icon="shieldCheck"><h1 className="page-title">Withdrawal is limited to an authorized privacy workflow.</h1></PageHeader></Shell>;
  }
  try {
    const row = readConsent(getDb(), consentActor(ctx), id);
    return (
      <Shell ctx={ctx} current="consent">
        <PageHeader section="Consent" href="/consent" icon="shieldCheck"><h1 className="page-title">Withdraw consent</h1></PageHeader>
        <p>This withdraws future {row.purpose} processing for {row.subject_id}. It does not erase the grant history or a message that was already delivered.</p>
        {query.error ? <p>The withdrawal was not applied. Refresh the record and try again.</p> : null}
        <form action={`/api/consents/${row.id}/withdraw`} method="post">
          <input type="hidden" name="expectedVersion" value={row.version} />
          <input type="hidden" name="idempotencyKey" value={`with${crypto.randomUUID().replaceAll("-", "")}`} />
          <input type="hidden" name="reasonCode" value="subject-request" />
          <button type="submit">Confirm withdrawal</button>
        </form>
      </Shell>
    );
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return <Shell ctx={ctx} current="consent"><PageHeader section="Consent" href="/consent" icon="shieldCheck"><h1 className="page-title">That consent record is not available.</h1></PageHeader></Shell>;
  }
}
