import { effectivePermissions, getDb, listConsentSubjects } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function RecordConsentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("consent.record")) {
    return (
      <Shell ctx={ctx} current="consent">
        <h1 className="page-title">Recording consent is limited to the privacy workflow.</h1>
      </Shell>
    );
  }
  const subjects = listConsentSubjects(getDb(), { userId: ctx.userId, organizationId: ctx.organizationId, facilityId: ctx.facilityId, sessionId: ctx.sessionId });
  return (
    <Shell ctx={ctx} current="consent">
      <p className="eyebrow">Guided record</p>
      <h1 className="page-title">Record consent</h1>
      <p className="lede">Research permission is not selected. This acknowledgment is a synthetic test record, not a legally binding signature.</p>
      {query.error ? <p>The consent could not be recorded. Check the subject, authority, and dates.</p> : null}
      {subjects.length === 0 ? <p>No synthetic subjects are available in this organization.</p> : null}
      <form action="/api/consents" method="post">
        <input type="hidden" name="idempotencyKey" value={`cns${crypto.randomUUID().replaceAll("-", "")}`} />
        <label>Subject
          <select name="subjectId" required>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.display_name} · {subject.id}</option>)}
          </select>
        </label>
        <label>Grantor authority
          <select name="authorityId" required>
            <option value="auth_akua_self">Subject, self acknowledgment</option>
            <option value="auth_akua_guardian">Verified guardian record</option>
          </select>
        </label>
        <label>Purpose
          <select name="purpose" required defaultValue="COMMUNICATION">
            <option value="COMMUNICATION">Appointment reminder</option>
            <option value="SHARING">Local synthetic sharing</option>
            <option value="RESEARCH">Research use</option>
          </select>
        </label>
        <label>Effective at <input name="effectiveAt" type="datetime-local" required defaultValue="2026-10-14T00:00" /></label>
        <label>Expires at <input name="expiresAt" type="datetime-local" /></label>
        <label>Decision
          <select name="decision" required defaultValue="granted">
            <option value="granted">Grant</option>
            <option value="refused">Refuse</option>
          </select>
        </label>
        <p>Summary: the selected purpose applies only to that purpose, the subject shown above, and this organization.</p>
        <button type="submit">Submit consent</button>
      </form>
    </Shell>
  );
}
