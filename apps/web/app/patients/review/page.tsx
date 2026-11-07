/* Individual page workspace */
import {PageHeader,SectionHeading,PageActions} from "@/components/page-workspace";
import { getDb, readRegistrationDraft } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReviewRegistrationPage({ searchParams }: { searchParams: Promise<{ draft?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!query.draft) redirect("/patients");
  let draft: ReturnType<typeof readRegistrationDraft>;
  try {
    draft = readRegistrationDraft(getDb(), masterActor(ctx), query.draft);
  } catch {
    redirect("/patients?error=notfound");
  }
  return (
    <Shell ctx={ctx} current="patients">
      <PageHeader section="Patients" href="/patients" icon="users" eyebrow={<>{ctx.facilityName}</>} description={<>These candidates are not confirmed as the same person. Nothing is merged from this screen.</>}><h1 className="page-title">Possible duplicate</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <section className="card">
        <SectionHeading icon="users"><h2 style={{ marginTop: 0 }}>Registration waiting to be saved</h2></SectionHeading>
        <p>
          {draft.given_name} {draft.family_name}
          {draft.preferred_name ? ` · preferred ${draft.preferred_name}` : ""}
        </p>
        <p className="muted">
          {draft.birth_date} · {draft.sex}
          {draft.contact_value ? " · contact on file" : ""}
        </p>
      </section>
      <div className="list">
        {draft.matches.map((match) => (
          <a className="row" key={`${match.id}-${match.reason}`} href={`/patients/${match.id}/identity`}>
            <span className="mono">{match.reason}</span>
            <span className="person">{match.id}</span>
          </a>
        ))}
      </div>
      <form action="/api/patients/confirm" method="post">
        <input type="hidden" name="draftId" value={draft.id} />
        <button className="btn-dark" type="submit">
          Save as a separate record
        </button>
      </form>
      <PageActions>
        <a href="/patients">Return without saving</a>
      </PageActions>
    </Shell>
  );
}
