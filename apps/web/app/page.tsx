import type { DirectoryEntry } from "@curasphere/contracts";
import { redirect } from "next/navigation";
import { Feedback } from "@/components/feedback";
import { readFoundationDirectory } from "@/lib/foundation";
import { roleLabel } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { optionalSession } from "@/lib/session";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await optionalSession();
  if (ctx) redirect("/dashboard");
  const query = await searchParams;
  const feedback = readFeedback(query);
  const directory = await readFoundationDirectory();
  const groups = new Map<string, DirectoryEntry[]>();
  for (const entry of directory.entries) {
    const list = groups.get(entry.organizationName) ?? [];
    list.push(entry);
    groups.set(entry.organizationName, list);
  }
  const error =
    feedback.error ??
    (directory.disabled
      ? "Local directory sign-in is disabled."
      : directory.unavailable
        ? "The foundation service is not running."
        : null);

  return (
    <main className="gate" id="content">
      <section>
        <p className="eyebrow">Local foundation</p>
        <h1>The chart stays the source of truth.</h1>
        <p className="lede">
          Facility and purpose of use come from the directory, not from the browser. The since-last-visit note only
          restates source events. It does not diagnose or recommend treatment.
        </p>
      </section>
      <section className="panel card">
        <h2>Identity provider</h2>
        <p className="muted">Workforce sign-in uses the local identity provider. The organization still comes from the directory.</p>
        <p>
          <a className="btn-dark" href="/api/auth/start">
            Sign in
          </a>
        </p>
        <h2>Directory</h2>
        <p className="muted">Development identities from the foundation service. No passwords.</p>
        <Feedback error={error} notice={null} />
        {directory.entries.length > 0 ? (
          <form action="/api/session" method="post">
            {[...groups.entries()].map(([organization, people]) => (
              <fieldset key={organization} style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="org-label">{organization}</legend>
                {people.map((person) => (
                  <label className="identity" key={person.userId}>
                    <input type="radio" name="userId" value={person.userId} required />
                    <strong>{person.displayName}</strong>
                    <span className="muted">
                      {roleLabel(person.role)}
                      {person.facilityName ? ` · ${person.facilityName}` : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <button className="btn-dark" type="submit">
              Continue
            </button>
          </form>
        ) : null}
        <p className="muted">
          <a href="/portal">Open your own patient record</a>
        </p>
      </section>
    </main>
  );
}
