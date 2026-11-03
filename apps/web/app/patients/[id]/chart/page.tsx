import { effectivePermissions, getDb, readUnifiedChart } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { masterActor } from "@/lib/master";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function UnifiedChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ encounter?: string; error?: string; notice?: string }>;
}) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  if (!access.permissions.includes("patient.read") && !access.permissions.includes("clinical.read")) redirect("/access/denied");
  const feedback = readFeedback(query);
  let chart: ReturnType<typeof readUnifiedChart> | null = null;
  let failed = false;
  try {
    chart = readUnifiedChart(getDb(), masterActor(ctx), id, query.encounter);
  } catch {
    failed = true;
  }
  if (!chart && failed) {
    return (
      <Shell ctx={ctx} current="patients" compactMobile>
        <h1 className="page-title">Patient chart</h1>
        <p role="alert">That patient chart is not available for this facility.</p>
      </Shell>
    );
  }
  if (!chart) redirect("/patients");
  if (chart.superseded) {
    return (
      <Shell ctx={ctx} current="patients" compactMobile>
        <h1 className="page-title">Patient chart</h1>
        <p role="alert">{chart.notice}</p>
        {chart.survivorId ? <p><a href={`/patients/${chart.survivorId}/chart`}>Open surviving record</a></p> : null}
      </Shell>
    );
  }
  const sections = chart.sections as Record<string, any>;
  const allergies = Array.isArray(sections.allergies) ? sections.allergies : [];
  const conditions = Array.isArray(sections.conditions) ? sections.conditions : [];
  const observations = Array.isArray(sections.observations) ? sections.observations : [];
  const medications = Array.isArray(sections.medications) ? sections.medications : [];
  const encounters = Array.isArray(sections.encounters) ? sections.encounters : [];
  const orders = Array.isArray(sections.orders) ? sections.orders : [];
  const plans = Array.isArray(sections.plans) ? sections.plans : [];
  const referrals = Array.isArray(sections.referrals) ? sections.referrals : [];
  const pending = sections.pending && !sections.pending.failed && !sections.pending.denied ? sections.pending : null;
  const billingStatus = sections.billingStatus && !sections.billingStatus.denied && !sections.billingStatus.failed ? sections.billingStatus : null;
  const charges = Array.isArray(sections.charges) ? sections.charges : [];
  const patient = chart.patient;
  return (
    <Shell ctx={ctx} current="patients" compactMobile>
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">{patient.given_name} {patient.family_name}</h1>
      <p><strong>SYNTHETIC — experimental workspace. Not authorized for clinical use.</strong></p>
      <p className="lede">MRN {patient.mrn} · {patient.registration_status} · facility context {ctx.facilityName}. {chart.notice}</p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {chart.failures?.length ? <p role="alert">Some chart sections could not load: {chart.failures.join(", ")}. <a href={`/patients/${id}/chart${chart.encounter ? `?encounter=${chart.encounter.id}` : ""}`}>Reload chart</a></p> : null}
      {chart.encounter ? (
        <div className="card">
          <h2>Active encounter</h2>
          <p>Status: <strong>{chart.encounter.status}</strong> · <a href={`/encounters/${chart.encounter.id}`}>Open encounter</a></p>
          {access.permissions.includes("work.order.submit") && chart.encounter.status === "in-progress" ? (
            <p>
              <a href={`/clinical?patient=${id}&encounter=${chart.encounter.id}`}>Clinical entries</a>
              {" · "}
              <a href={`/work?patient=${id}&encounter=${chart.encounter.id}`}>Orders and referrals</a>
            </p>
          ) : null}
          {access.permissions.includes("billing.charge.create") ? <p><a href={`/billing/charges/new?patient=${id}&encounter=${chart.encounter.id}`}>Create synthetic charge</a></p> : null}
        </div>
      ) : (
        <p>No encounter is selected. Open an appointment or encounter to continue the visit.</p>
      )}
      <h2>Allergies</h2>
      {sections.allergies?.denied ? <p>Allergy list is not available for this role.</p> : null}
      {sections.allergies?.failed ? <p role="alert">Allergy list could not load.</p> : null}
      {!sections.allergies?.denied && !sections.allergies?.failed && allergies.length === 0 ? <p>No allergy entry is recorded. Unknown status is not the same as no known allergies.</p> : null}
      <ul>{allergies.map((row: any) => <li key={row.id}>{row.display} · {row.clinical_status} · {row.verification_status} · version {row.version}</li>)}</ul>
      <h2>Problems</h2>
      <SectionAccess value={sections.conditions} label="Problem list" />
      {!sections.conditions?.denied && !sections.conditions?.failed && conditions.length === 0 ? <p>No problem list entry is recorded.</p> : null}
      <ul>{conditions.map((row: any) => <li key={row.id}>{row.display} · {row.clinical_status} · {row.verification_status} · version {row.version}</li>)}</ul>
      <h2>Observations</h2>
      <SectionAccess value={sections.observations} label="Observations" />
      {!sections.observations?.denied && !sections.observations?.failed && observations.length === 0 ? <p>No observation is recorded.</p> : null}
      <ul>
        {observations.map((row: any) => (
          <li key={row.id}>
            {row.display} · {row.value_quantity !== null ? `${row.value_quantity} ${row.unit_code ?? ""}` : row.components?.length ? row.components.map((part: any) => `${part.display}: ${part.value_quantity} ${part.unit_code}`).join("; ") : "No value recorded"} · {row.status} · version {row.version}
            {row.effective_at ? ` · observed ${row.effective_at}` : ""}
            {access.permissions.includes("clinical.source.history.read") ? <> · <a href={`/clinical/history?kind=observation&id=${row.id}`}>History</a></> : null}
          </li>
        ))}
      </ul>
      <h2>Medication drafts</h2>
      <SectionAccess value={sections.medications} label="Medication drafts" />
      <p><strong>Synthetic draft — not a valid prescription.</strong></p>
      {!sections.medications?.denied && !sections.medications?.failed && medications.length === 0 ? <p>No medication draft is recorded.</p> : null}
      <ul>{medications.map((row: any) => <li key={row.id}>{row.display} · {row.status} · executable {row.executable} · transmission {row.transmission}</li>)}</ul>
      <h2>Pending work</h2>
      <SectionAccess value={sections.pending} label="Pending work" />
      {pending && Object.values(pending).every((rows) => Array.isArray(rows) && rows.length === 0) ? <p>No pending work is recorded for this patient.</p> : null}
      {pending ? (
        <ul>
          {(pending.orders ?? []).map((row: any) => <li key={row.id}><a href={`/work/orders/${row.id}`}>{row.display}</a> · {row.status}</li>)}
          {(pending.tasks ?? []).map((row: any) => <li key={row.id}>{row.parent_kind} · {row.status}</li>)}
          {(pending.referrals ?? []).map((row: any) => <li key={row.id}><a href={`/work/referrals/${row.id}`}>{row.display}</a> · {row.status}</li>)}
          {(pending.plans ?? []).map((row: any) => <li key={row.id}><a href={`/work/plans/${row.id}`}>{row.display}</a> · {row.status}</li>)}
        </ul>
      ) : null}
      <h2>Orders, plans, referrals</h2>
      <SectionAccess value={sections.orders} label="Orders" />
      <SectionAccess value={sections.plans} label="Care plans" />
      <SectionAccess value={sections.referrals} label="Referrals" />
      {orders.length + plans.length + referrals.length === 0 && [sections.orders, sections.plans, sections.referrals].every(Array.isArray) ? <p>No orders, care plans, or referrals are recorded.</p> : null}
      <ul>
        {orders.map((row: any) => <li key={row.id}><a href={`/work/orders/${row.id}`}>{row.display}</a> · {row.status}</li>)}
        {plans.map((row: any) => <li key={row.id}><a href={`/work/plans/${row.id}`}>{row.display}</a> · {row.status}</li>)}
        {referrals.map((row: any) => <li key={row.id}><a href={`/work/referrals/${row.id}`}>{row.display}</a> · {row.status}</li>)}
      </ul>
      <h2>Encounter history</h2>
      <SectionAccess value={sections.encounters} label="Encounter history" />
      {Array.isArray(sections.encounters) && encounters.length === 0 ? <p>No visit encounter is recorded.</p> : encounters.length > 0 ? (
        <ol>
          {encounters.map((row: any) => (
            <li key={row.id}>
              <a href={`/patients/${id}/chart?encounter=${row.id}`}>{row.id}</a> · {row.status}
              {row.started_at ? ` · started ${row.started_at}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      <h2>Billing</h2>
      <SectionAccess value={sections.charges ?? sections.billingStatus} label="Billing" />
      {sections.billingStatus?.denied && sections.charges === undefined ? <p>Financial details are not available for this role.</p> : null}
      {billingStatus ? <p>Open charges: {billingStatus.counts?.open ?? 0}. Locally finalized: {billingStatus.counts?.finalized ?? 0}. Amounts are hidden for this role.</p> : null}
      {charges.length > 0 ? (
        <ul>
          {charges.map((row: any) => (
            <li key={row.id}>
              <a href={`/billing/charges/${row.id}`}>{row.id}</a> · {row.status} · {row.currency} {(row.total_minor / 100).toFixed(2)} · version {row.version}
            </li>
          ))}
        </ul>
      ) : Array.isArray(sections.charges) ? <p>No synthetic charge is recorded.</p> : null}
      <p><a href={`/patients/${id}`}>Identity record</a></p>
    </Shell>
  );
}

function SectionAccess({ value, label }: { value: any; label: string }) {
  if (value?.denied) return <p>{label} is not available for this role.</p>;
  if (value?.failed) return <p role="alert">{label} could not load. Reload the chart to retry.</p>;
  return null;
}
