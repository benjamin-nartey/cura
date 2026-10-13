import { ForbiddenError, getDb, listPatientDirectory, readPatientSession } from "@curasphere/domain";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Feedback } from "@/components/feedback";
import { readFeedback } from "@/lib/messages";

export default async function PortalSignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  const sid = jar.get("cura_portal")?.value;
  if (sid && readPatientSession(getDb(), sid)) redirect("/portal/home");
  const query = await searchParams;
  const feedback = readFeedback(query);
  const directory = loadDirectory();
  const error = feedback.error ?? (directory.disabled ? "Local directory sign-in is disabled." : null);
  return (
    <main className="gate" id="content">
      <section>
        <p className="eyebrow">Patient record</p>
        <h1>Your facility record, not the clinician chart.</h1>
        <p className="lede">
          This page shows your appointments, medications, and results. It does not diagnose or give treatment advice. An emergency phrase shows a fixed instruction to call local emergency services.
        </p>
        <Feedback error={error} notice={null} />
        {directory.entries.length > 0 ? (
          <form action="/api/portal/session" method="post">
            {directory.entries.map((person) => (
              <label className="identity" key={person.principalId}>
                <input type="radio" name="principalId" value={person.principalId} required />
                <strong>{person.displayName}</strong>
                <span className="muted">{person.facilityName}</span>
              </label>
            ))}
            <button className="btn-dark" type="submit">Continue</button>
          </form>
        ) : null}
        <p className="muted"><a href="/">Clinician sign-in</a></p>
      </section>
    </main>
  );
}

function loadDirectory() {
  try {
    return { entries: listPatientDirectory(getDb()), disabled: false };
  } catch (error) {
    if (error instanceof ForbiddenError) return { entries: [], disabled: true };
    throw error;
  }
}
