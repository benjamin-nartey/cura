import { effectivePermissions, getDb, readDuplicateCandidate } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function DuplicateReviewPage({
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
  let candidate: ReturnType<typeof readDuplicateCandidate>;
  try {
    candidate = readDuplicateCandidate(getDb(), masterActor(ctx), id);
  } catch {
    redirect("/patients/duplicates");
  }
  const canMerge = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId).permissions.includes("patient.merge");
  const side = (label: string, row: NonNullable<typeof candidate.left>) => (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{label}</h2>
      <p>
        {row.given_name} {row.family_name}
      </p>
      <p className="muted">
        {row.birth_date} · MRN {row.mrn}
      </p>
      <p className="mono">
        {row.id} · version {row.version} · {row.registration_status}
      </p>
    </section>
  );
  return (
    <Shell ctx={ctx} current="patients">
      <p className="eyebrow">Match reason: {candidate.reason}</p>
      <h1 className="page-title">Compare records</h1>
      <p className="lede">Opened by {candidate.opened_by}. Version {candidate.version}. Status {candidate.status}.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="split">
        {candidate.left ? side("Left record", candidate.left) : <p>The left record is not available.</p>}
        {candidate.right ? side("Right record", candidate.right) : <p>The right record is not available.</p>}
      </div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>If these are merged</h2>
        <p>The retired identity stays in history with its identifiers. Conditions, encounters, observations, allergies, and medications stay on the retired record and are listed as blocked.</p>
      </section>
      {candidate.status !== "open" ? <p>This candidate is already decided.</p> : null}
      {candidate.status === "open" ? (
        <>
          <form action={`/api/patients/duplicates/${candidate.id}`} method="post">
            <input type="hidden" name="expectedVersion" value={String(candidate.version)} />
            <input type="hidden" name="decision" value="different" />
            <button className="btn-dark" type="submit">
              Different people
            </button>
          </form>
          <form action={`/api/patients/duplicates/${candidate.id}`} method="post">
            <input type="hidden" name="expectedVersion" value={String(candidate.version)} />
            <input type="hidden" name="decision" value="needs-information" />
            <button className="btn-dark" type="submit">
              Needs more information
            </button>
          </form>
          {canMerge && candidate.left && candidate.right ? (
            <form action={`/api/patients/duplicates/${candidate.id}`} method="post">
              <input type="hidden" name="expectedVersion" value={String(candidate.version)} />
              <input type="hidden" name="decision" value="merge" />
              <input type="hidden" name="commandKey" value={`merge-${candidate.id}-${candidate.version}`} />
              <fieldset>
                <legend>Surviving record</legend>
                <label>
                  <input type="radio" name="survivorId" value={candidate.left.id} required /> {candidate.left.given_name} {candidate.left.family_name} ({candidate.left.mrn})
                </label>
                <label>
                  <input type="radio" name="survivorId" value={candidate.right.id} /> {candidate.right.given_name} {candidate.right.family_name} ({candidate.right.mrn})
                </label>
              </fieldset>
              <label>
                <input type="checkbox" name="confirm" value="yes" required /> I confirm this controlled merge.
              </label>
              <button className="btn-dark" type="submit">
                Merge these identities
              </button>
            </form>
          ) : (
            <p>Merge is limited to an organization administrator who did not open this candidate.</p>
          )}
        </>
      ) : null}
    </Shell>
  );
}
