/* Individual page workspace */
import {SectionHeading} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { purposeLabel, roleLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AccountPage() {
  const ctx = await requireSession();
  return (
    <Shell ctx={ctx} current="account">
      <section className="card account-card">
        <p className="metric-label">Workspace identity</p>
        <SectionHeading icon="sliders"><h2>{ctx.displayName}</h2></SectionHeading>
        <p className="lede">Name, role, facility, and purpose of use come from the directory. This page does not change them.</p>
        <dl className="account-facts">
          <div>
            <dt>Role</dt>
            <dd>{roleLabel(ctx.role)}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{ctx.organizationName}</dd>
          </div>
          <div>
            <dt>Facility</dt>
            <dd>{ctx.facilityName ?? "None on this directory entry"}</dd>
          </div>
          <div>
            <dt>Purpose of use</dt>
            <dd>{purposeLabel(ctx.purposeOfUse)}</dd>
          </div>
        </dl>
        <p>
          <a href="/auth/enroll">Manage authenticators</a>
        </p>
        <form action="/api/session/end" method="post">
          <button className="btn-dark" type="submit">
            Sign out
          </button>
        </form>
      </section>
      <section className="card" style={{ marginTop: 24 }}>
        <SectionHeading icon="sliders"><h2>Workspace information</h2></SectionHeading>
        <p>This is an isolated simulation environment containing synthetic patient and operational records. It is not connected to live clinical services.</p>
        <p>Production clinical use, external prescriptions and orders, claims transmission, and payment collection remain disabled. Policy approval and credential verification are separate from account access.</p>
      </section>
    </Shell>
  );
}
