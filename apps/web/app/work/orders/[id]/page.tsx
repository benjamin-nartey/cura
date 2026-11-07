/* Individual page workspace */
import {PageActions,PageHeader,SectionHeading} from "@/components/page-workspace";
import { effectivePermissions, getDb, listAttachments, listTasksFor, readOrder } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.order.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  let row: ReturnType<typeof readOrder> | null = null;
  try {
    row = readOrder(getDb(), masterActor(ctx), id);
  } catch {
    row = null;
  }
  if (!row) redirect("/work");
  const tasks = access.permissions.includes("work.task.read") ? listTasksFor(getDb(), masterActor(ctx), "order", id) : [];
  const files = listAttachments(getDb(), masterActor(ctx), "order", id);
  const here = ctx.facilityId;
  return (
    <Shell ctx={ctx} current="work">
      <PageActions><a href={`/clinical/coding/work-order/${id}`}>Recorded coding provenance</a></PageActions>
      <PageHeader section="Care coordination" href="/work" icon="checklist" description={<><strong>Not a transmitted order.</strong></>}><h1 className="page-title">Department request</h1></PageHeader>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="card">
        <p>{row.display}</p>
        <p>Status: <strong>{row.status}</strong> · version {row.version}</p>
        <p>Due {row.due_on} · priority {row.priority} · {row.fulfillment}</p>
        <p><a href={`/work/history?kind=order&id=${id}`}>History</a></p>
        {row.catalogSnapshot?<section><SectionHeading icon="checklist"><h2>Original catalog version</h2></SectionHeading><p>{row.catalogSnapshot.display} · revision {row.catalogSnapshot.revision}</p><p>Unit: {row.catalogSnapshot.unitCode} · {row.catalogSnapshot.unitPackVersion}</p><p style={{overflowWrap:"anywhere"}}>{row.catalogSnapshot.system} · {row.catalogSnapshot.codeSystemVersion} · {row.catalogSnapshot.code}</p><a href={`/terminology/catalogs/${row.catalogSnapshot.entryVersionId}`}>Catalog provenance</a><p className="muted">This immutable snapshot remains attached after catalog changes or encounter closure.</p></section>:null}
      </div>
      <section className="page-section card"><SectionHeading icon="checklist"><h2>Tasks</h2></SectionHeading>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.status} · version {task.version} · {task.assignee_user_id ?? "unassigned"}
            {access.permissions.includes("work.task.assign") && task.facility_id === here && task.status !== "cancelled" ? (
              <form action={`/api/work/tasks/${task.id}/assign`} method="post">
                <input type="hidden" name="expectedVersion" value={String(task.version)} />
                <input type="hidden" name="assigneeUserId" value={ctx.userId} />
                <button className="btn-line" type="submit">Assign to me</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {row.status === "submitted" && access.permissions.includes("work.order.route") ? (
        <form action={`/api/work/orders/${id}/route`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <button className="btn-dark" type="submit">Mark routed</button>
        </form>
      ) : null}
      {row.status !== "cancelled" && row.facility_id === here && access.permissions.includes("work.order.cancel") ? (
        <form action={`/api/work/orders/${id}/cancel`} method="post">
          <input type="hidden" name="expectedVersion" value={String(row.version)} />
          <label className="field">Reason
            <select aria-label="Reason" name="reason" required><option value="no-longer-needed">No longer needed</option><option value="entered-in-error">Entered in error</option></select>
          </label>
          <button className="btn-line" type="submit">Cancel request</button>
        </form>
      ) : null}
      {access.permissions.includes("work.attachment.add") && row.status !== "cancelled" ? (
        <form action="/api/work/attachments" method="post">
          <input type="hidden" name="parentKind" value="order" />
          <input type="hidden" name="parentId" value={id} />
          <input type="hidden" name="code" value="syn-request-note" />
          <input type="hidden" name="byteLength" value="128" />
          <input type="hidden" name="sha256" value={"ab".repeat(32)} />
          <button className="btn-line" type="submit">Attach note</button>
        </form>
      ) : null}</section>
      <section className="page-section card"><SectionHeading icon="checklist"><h2>Attachments</h2></SectionHeading>
      {files.length === 0 ? <p>No attachment reference.</p> : <ul>{files.map((file) => <li key={file.id}>{file.display} · {file.media_type} · {file.byte_length} bytes</li>)}</ul>}</section>
    </Shell>
  );
}
