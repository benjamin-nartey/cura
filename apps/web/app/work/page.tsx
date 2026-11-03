import { effectivePermissions, getDb, listOrders, listPending, listPlans, listReferrals, listWorkCatalog } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ patient?: string; encounter?: string; error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("work.pending.read") && !access.permissions.includes("work.order.read")) redirect("/access/denied");
  const actor = masterActor(ctx);
  const feedback = readFeedback(query);
  let pending: ReturnType<typeof listPending> | null = null;
  let failed = false;
  try {
    pending = listPending(getDb(), actor);
  } catch {
    failed = true;
  }
  const patientId = query.patient ?? "";
  const encounterId = query.encounter ?? "";
  const orders = patientId && access.permissions.includes("work.order.read") ? safeList(() => listOrders(getDb(), actor, patientId)) : [];
  const plans = patientId && access.permissions.includes("work.plan.read") ? safeList(() => listPlans(getDb(), actor, patientId)) : [];
  const referrals = patientId && access.permissions.includes("work.referral.read") ? safeList(() => listReferrals(getDb(), actor, patientId)) : [];
  const open = encounterId && query.patient;
  const canSubmit = access.permissions.includes("work.order.submit");
  const departments = listWorkCatalog().departments;
  return (
    <Shell ctx={ctx} current="work">
      <h1 className="page-title">Pending work</h1>
      <p className="lede">These are coordination records. A saved request is not a transmitted order, a result, or a prescription.</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {failed ? <p role="alert">Pending work is not available.</p> : null}
      {pending && pending.orders.length + pending.tasks.length + pending.referrals.length + pending.plans.length === 0 ? <p>No pending work for this facility.</p> : null}
      {pending ? (
        <>
          <h2>Requests</h2>
          <ul>
            {pending.orders.map((row) => <li key={row.id}><a href={`/work/orders/${row.id}`}>{row.display}</a> · {row.status} · due {row.due_on} · not transmitted</li>)}
          </ul>
          <h2>Tasks</h2>
          <ul>
            {pending.tasks.map((row) => <li key={row.id}>{row.parent_kind} · {row.status} · due {row.due_on}{row.assignee_user_id ? ` · ${row.assignee_user_id}` : " · unassigned"}</li>)}
          </ul>
          <h2>Referrals</h2>
          <ul>
            {pending.referrals.map((row) => <li key={row.id}><a href={`/work/referrals/${row.id}`}>{row.display}</a> · {row.status} · due {row.due_on}</li>)}
          </ul>
          <h2>Care plans</h2>
          <ul>
            {pending.plans.map((row) => <li key={row.id}><a href={`/work/plans/${row.id}`}>{row.display}</a> · {row.status} · due {row.due_on}</li>)}
          </ul>
        </>
      ) : null}
      {open && canSubmit ? <p><a href={`/work/orders/new?patient=${patientId}&encounter=${encounterId}`}>New department request</a> · <a href={`/work/plans/new?patient=${patientId}&encounter=${encounterId}`}>New care plan</a> · <a href={`/work/referrals/new?patient=${patientId}&encounter=${encounterId}`}>New referral</a></p> : null}
      {patientId ? (
        <>
          <h2>Saved for this patient</h2>
          <ul>
            {orders.map((row) => <li key={row.id}><a href={`/work/orders/${row.id}`}>{row.display}</a> · {row.status} · version {row.version}</li>)}
            {plans.map((row) => <li key={row.id}><a href={`/work/plans/${row.id}`}>{row.display}</a> · {row.status}</li>)}
            {referrals.map((row) => <li key={row.id}><a href={`/work/referrals/${row.id}`}>{row.display}</a> · {row.status}</li>)}
          </ul>
        </>
      ) : null}
      <p>{departments.length} departments are available for internal requests. External transmission is not enabled.</p>
    </Shell>
  );
}

function safeList<T>(load: () => T[]): T[] {
  try {
    return load();
  } catch {
    return [];
  }
}
