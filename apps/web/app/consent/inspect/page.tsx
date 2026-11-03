import { effectivePermissions, evaluateConsent, getDb, listConsentSubjects } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { consentActor } from "@/lib/consent";
import { requireSession } from "@/lib/session";

const ACTIONS = {
  COMMUNICATION: ["consent.communication.dispatch", "facility-messenger", "appointment-reminder"],
  SHARING: ["consent.sharing.release", "local-share-sink", "synthetic-record"],
  RESEARCH: ["consent.research.use", "research-workspace", "research-row"],
} as const;

export default async function ConsentInspectPage({ searchParams }: { searchParams: Promise<{ subjectId?: string; purpose?: string }> }) {
  const ctx = await requireSession();
  if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging") {
    return <Shell ctx={ctx} current="consent"><h1 className="page-title">The decision inspector is not available in this environment.</h1></Shell>;
  }
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.policy.evaluate")) {
    return <Shell ctx={ctx} current="consent"><h1 className="page-title">Processing decisions are limited to the privacy workflow.</h1></Shell>;
  }
  const query = await searchParams;
  const subjects = listConsentSubjects(getDb(), consentActor(ctx));
  const purpose = query.purpose === "SHARING" || query.purpose === "RESEARCH" ? query.purpose : "COMMUNICATION";
  const [action, recipient, category] = ACTIONS[purpose];
  const decision = query.subjectId
    ? evaluateConsent(getDb(), consentActor(ctx), { subjectId: query.subjectId, action, purpose, recipient, resourceCategory: category })
    : null;
  return (
    <Shell ctx={ctx} current="consent">
      <h1 className="page-title">Processing decision</h1>
      <p className="lede">This inspector reads the policy engine. It does not grant access.</p>
      <form method="get">
        <label>Subject
          <select name="subjectId" defaultValue={query.subjectId ?? ""}>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.id}</option>)}
          </select>
        </label>
        <label>Purpose
          <select name="purpose" defaultValue={purpose}>
            <option value="COMMUNICATION">Communication</option>
            <option value="SHARING">Sharing</option>
            <option value="RESEARCH">Research</option>
          </select>
        </label>
        <button type="submit">Evaluate</button>
      </form>
      {decision ? <p>Result {decision.result}. Reason {decision.reason}. Version {decision.version ?? "none"}.</p> : <p>Choose a subject to evaluate.</p>}
    </Shell>
  );
}
