/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { effectivePermissions, getDb, readVisitEncounter } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function CloseEncounterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("encounter.close")) redirect("/access/denied");
  const encounter = readVisitEncounter(getDb(), masterActor(ctx), id);
  return (
    <Shell ctx={ctx} current="appointments">
      <PageHeader section="Visits" href="/appointments" icon="stethoscope" eyebrow={<>{ctx.facilityName}</>} description={<>Closing records the end time and makes ordinary lifecycle edits read-only. It does not create a diagnosis or a note.</>}><h1 className="page-title">Close encounter</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="card">
        <p>Encounter {encounter.id}</p>
        <p>Practitioner {encounter.practitioner_id}</p>
        <p>Current status: {encounter.status}</p>
        <p>Version {encounter.version}</p>
      </div>
      {encounter.status === "in-progress" ? (
        <form action={`/api/encounters/${encounter.id}/close`} method="post">
          <input type="hidden" name="version" value={encounter.version} />
          <input type="hidden" name="reason" value="visit-complete" />
          <button className="btn-dark" type="submit">Confirm closure</button>
        </form>
      ) : (
        <p>This encounter cannot be closed from {encounter.status}.</p>
      )}
    </Shell>
  );
}
