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
      <p className="eyebrow">{ctx.organizationName}</p>
      <h1 className="page-title">Practitioners</h1>
      <p className="lede">A practitioner record is not a workforce account. A link does not grant access.</p>
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
      <div className="list">
        {rows.map((row) => (
          <a className="row" key={row.id} href={`/practitioners/${row.id}`}>
            <span className="person">{row.display_name}</span>
            <span className="muted">
              {row.role_type} · {row.status} · {row.verification_state} · {row.linked_user ? "account linked" : "no account"}
            </span>
          </a>
        ))}
      </div>
      {access.permissions.includes("practitioner.manage") ? (
        <section className="card" style={{ marginTop: 36, maxWidth: 520 }}>
          <h2 style={{ marginTop: 0 }}>Create a practitioner</h2>
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
