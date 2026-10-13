import { canReadChart, getDb, listIncomingReferrals, noteDenial } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function CoordinationPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const feedback = readFeedback(await searchParams);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "care.referral", "CareReferral", null);
    return (
      <Shell ctx={ctx} current="coordination">
        <p className="eyebrow">Coordination</p>
        <h1 className="page-title">The chart is closed for this role.</h1>
      </Shell>
    );
  }
  const incoming = listIncomingReferrals(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="coordination">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">Incoming referrals</h1>
      <p className="lede">A referral shows the recorded reason. Accepting it does not copy the chart or send a message.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {incoming.length === 0 ? <p>No referrals are addressed to this facility.</p> : null}
      {incoming.map((referral) => (
        <article className="card" key={referral.id}>
          <p>
            {referral.patientId} · {referral.fromFacilityId} · {referral.status}
          </p>
          <p>{referral.reason}</p>
          {referral.status === "requested" ? (
            <div className="form-grid">
              <form action="/api/care/referral/decision" method="post">
                <input type="hidden" name="referralId" value={referral.id} />
                <input type="hidden" name="decision" value="accepted" />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <button className="btn-dark" type="submit">
                  Accept
                </button>
              </form>
              <form action="/api/care/referral/decision" method="post">
                <input type="hidden" name="referralId" value={referral.id} />
                <input type="hidden" name="decision" value="declined" />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <button className="btn-text" type="submit">
                  Decline
                </button>
              </form>
            </div>
          ) : null}
        </article>
      ))}
    </Shell>
  );
}
