/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { effectivePermissions, getDb, listPractitioners } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function PractitionersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("practitioner.read")) redirect("/access/denied");
  const q = (query.q ?? "").trim().toLowerCase();
  let rows: ReturnType<typeof listPractitioners> = [];
  let failed = false;
  try {
    rows = listPractitioners(getDb(), masterActor(ctx)).filter((row) => {
      if (!q) return true;
      return row.display_name.toLowerCase().includes(q) || row.role_type.toLowerCase().includes(q) || row.id.toLowerCase().includes(q);
    });
  } catch {
    failed = true;
  }
  return (
    <Shell ctx={ctx} current="practitioners">
      <PageHeader section="Practitioners" href="/practitioners" icon="users" eyebrow={<>{ctx.organizationName}</>} description={<>A practitioner record is not a workforce account. A link does not grant access.</>}><h1 className="page-title">Practitioners</h1></PageHeader>
      <form className="search" action="/practitioners" method="get">
        <label className="field">
          Find a practitioner
          <input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Name or role" />
        </label>
        <button className="btn-dark" type="submit">
          Search
        </button>
      </form>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {failed ? <p>The practitioner directory is unavailable.</p> : null}
      {!failed && rows.length === 0 ? <p>{q ? "No practitioner matches." : "No practitioner is recorded for this organization."}</p> : null}
      <div className="practitioner-grid">{rows.map(row=><a className="practitioner-card" key={row.id} href={`/practitioners/${row.id}`}><div className="practitioner-card-top"><span className="record-profile-avatar" aria-hidden="true">{row.display_name.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]).join('')}</span><span className="record-status">{row.status}</span></div><h2>{row.display_name}</h2><p>{row.role_type}</p><div className="practitioner-note">Verification · {row.verification_state}</div><div className="practitioner-footer"><span>{row.linked_user?'Workforce account linked':'No workforce account linked'}</span><strong>View record →</strong></div></a>)}</div>
      {access.permissions.includes("practitioner.manage") ? (
        <section className="card" style={{ marginTop: 36, maxWidth: 520 }}>
          <SectionHeading icon="users"><h2 style={{ marginTop: 0 }}>Create a practitioner</h2></SectionHeading>
          <form className="form-grid" action="/api/practitioners" method="post">
            <label className="field">
              Professional name
              <input name="displayName" type="text" required maxLength={80} />
            </label>
            <label className="field">
              Role
              <input name="roleType" type="text" required maxLength={80} defaultValue="doctor" />
            </label>
            <label className="field">
              Fictional license number
              <input name="licenseNumber" type="text" maxLength={80} />
            </label>
            <label className="field">
              Fictional issuer
              <input name="licenseIssuer" type="text" maxLength={80} defaultValue="SYNTHETIC-GH" />
            </label>
            <input type="hidden" name="facilityId" value={ctx.facilityId ?? ""} />
            <button className="btn-dark" type="submit">
              Save practitioner
            </button>
          </form>
        </section>
      ) : null}
    </Shell>
  );
}
