/* Individual page workspace */
import {PageHeader,SectionHeading,PageActions} from "@/components/page-workspace";
import { effectivePermissions, getDb, readPractitioner } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function PractitionerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  let practitioner: ReturnType<typeof readPractitioner>;
  try {
    practitioner = readPractitioner(getDb(), masterActor(ctx), id);
  } catch {
    redirect("/practitioners?error=notfound");
  }
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  return (
    <Shell ctx={ctx} current="practitioners">
      <PageHeader section="Practitioners" href="/practitioners" icon="users" eyebrow={<>{practitioner.role_type}</>} description={<>
        {practitioner.status} · version {practitioner.version} · {practitioner.verification_state}
      </>}><h1 className="page-title">{practitioner.display_name}</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <section className="card">
        <SectionHeading icon="users"><h2 style={{ marginTop: 0 }}>Credential</h2></SectionHeading>
        <p>License: {practitioner.license_number ?? "Not recorded"}</p>
        <p>Issuer: {practitioner.license_issuer ?? "Not recorded"}</p>
        <p>Practitioner credentials require independent verification. Account access does not verify a professional license.</p>
      </section>
      <section className="card">
        <SectionHeading icon="users"><h2 style={{ marginTop: 0 }}>Facilities</h2></SectionHeading>
        <ul>
          {practitioner.affiliations.map((affiliation) => (
            <li key={affiliation.facility_id}>
              {affiliation.facility_id} · {affiliation.status}
            </li>
          ))}
        </ul>
        {access.permissions.includes("practitioner.manage") ? (
          <form action={`/api/practitioners/${practitioner.id}/affiliate`} method="post">
            <label className="field">
              Facility id in this organization
              <input name="facilityId" type="text" required maxLength={80} defaultValue={ctx.facilityId ?? ""} />
            </label>
            <button className="btn-dark" type="submit">
              Add affiliation
            </button>
          </form>
        ) : null}
      </section>
      <section className="card">
        <SectionHeading icon="users"><h2 style={{ marginTop: 0 }}>Workforce identity</h2></SectionHeading>
        {practitioner.link ? (
          <p>
            {practitioner.link.user_id} · {practitioner.link.status}
          </p>
        ) : (
          <p>No workforce account is linked.</p>
        )}
        {access.permissions.includes("practitioner.link") && practitioner.status === "active" ? (
          <form action={`/api/practitioners/${practitioner.id}/link`} method="post">
            <label className="field">
              Workforce user id
              <input name="userId" type="text" required maxLength={80} />
            </label>
            <button className="btn-dark" type="submit">
              Link verified identity
            </button>
          </form>
        ) : null}
      </section>
      <PageActions>
        <a href="/practitioners">Back to practitioners</a>
      </PageActions>
    </Shell>
  );
}
