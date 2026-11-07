/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

export default async function NewPrivacyRequestPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("privacy.request.create")) {
    return <Shell ctx={ctx} current="requests"><PageHeader section="Privacy requests" href="/privacy/requests" icon="shieldCheck"><h1 className="page-title">Submitting a privacy request is limited to the request workflow.</h1></PageHeader></Shell>;
  }
  return (
    <Shell ctx={ctx} current="requests">
      <PageHeader section="Privacy requests" href="/privacy/requests" icon="shieldCheck"><h1 className="page-title">Submit a privacy request</h1></PageHeader>
      <p>Select the subject and request type. Verify identity before releasing any records; email alone is insufficient.</p>
      {query.error ? <p>The request was not recorded. Check the subject and authority.</p> : null}
      <form action="/api/privacy/requests" method="post">
        <input type="hidden" name="idempotencyKey" value={`dsr${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
        <label>Request type
          <select aria-label="Request type" name="requestType" defaultValue="access">
            <option value="access">Access</option>
            <option value="portability">Portability</option>
            <option value="correction">Correction</option>
            <option value="erasure">Erasure</option>
            <option value="bulk">Bulk export</option>
          </select>
        </label>
        <label>Subject id <input name="subjectId" required defaultValue="sub_minor_kofi" /></label>
        <label>Relationship <input name="relationship" required defaultValue="guardian" /></label>
        <label>Authority id <input name="authorityId" required defaultValue="auth_guardian_ama" /></label>
        <label>Jurisdiction <input name="jurisdiction" required defaultValue="SYNTHETIC_GH_DSAR" /></label>
        <input type="hidden" name="categories" value="administrative-note,third-party-note,contact-preference" />
        <p>Verification is required before any disclosure. The workspace target is 30 days; applicable legal deadlines require separate review.</p>
        <button type="submit">Submit request</button>
      </form>
      <form action="/api/privacy/requests" method="post">
        <input type="hidden" name="idempotencyKey" value={`grd${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
        <input type="hidden" name="requestType" value="access" />
        <input type="hidden" name="subjectId" value="sub_minor_kofi" />
        <input type="hidden" name="relationship" value="guardian" />
        <input type="hidden" name="authorityId" value="auth_guardian_ama" />
        <input type="hidden" name="jurisdiction" value="SYNTHETIC_GH_DSAR" />
        <input type="hidden" name="categories" value="administrative-note,third-party-note,contact-preference" />
        <button type="submit">Submit the verified guardian access request</button>
      </form>
      <form action="/api/privacy/requests" method="post">
        <input type="hidden" name="idempotencyKey" value={`wrg${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
        <input type="hidden" name="requestType" value="access" />
        <input type="hidden" name="subjectId" value="sub_minor_kofi" />
        <input type="hidden" name="relationship" value="guardian" />
        <input type="hidden" name="authorityId" value="auth_guardian_wrong" />
        <input type="hidden" name="jurisdiction" value="SYNTHETIC_GH_DSAR" />
        <input type="hidden" name="categories" value="administrative-note" />
        <button type="submit">Submit a request with the wrong guardian</button>
      </form>
      <form action="/api/privacy/requests" method="post">
        <input type="hidden" name="idempotencyKey" value={`blk${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
        <input type="hidden" name="requestType" value="bulk" />
        <input type="hidden" name="subjectId" value="sub_bulk_cohort" />
        <input type="hidden" name="relationship" value="staff-prepared" />
        <input type="hidden" name="authorityId" value="auth_bulk_scope" />
        <input type="hidden" name="jurisdiction" value="SYNTHETIC_BULK_EXPORT" />
        <input type="hidden" name="categories" value="administrative-note,third-party-note,research-note" />
        <button type="submit">Submit a monitored bulk export request</button>
      </form>
      <form action="/api/privacy/requests" method="post">
        <input type="hidden" name="idempotencyKey" value={`ers${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`} />
        <input type="hidden" name="requestType" value="erasure" />
        <input type="hidden" name="subjectId" value="sub_minor_kofi" />
        <input type="hidden" name="relationship" value="guardian" />
        <input type="hidden" name="authorityId" value="auth_guardian_ama" />
        <input type="hidden" name="jurisdiction" value="SYNTHETIC_GH_DSAR" />
        <input type="hidden" name="categories" value="administrative-note,contact-preference" />
        <button type="submit">Submit an erasure request</button>
      </form>
    </Shell>
  );
}
