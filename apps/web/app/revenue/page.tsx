import { authorize, getDb, noteDenial, readRevenue } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  const decision = authorize(
    getDb(),
    { principalId: ctx.userId, accountActive: true },
    "billing.read",
    { type: "Billing", organizationId: ctx.organizationId, facilityId: ctx.facilityId, sensitivity: "administrative" },
    { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: true, activeFacilityId: ctx.facilityId },
  );
  if (!decision.allow) redirect("/access/denied");
  if (ctx.role !== "admin") {
    noteDenial(getDb(), ctx, "revenue.read", "RevenueInvoice", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="revenue">
        <p className="eyebrow">Revenue</p>
        <h1 className="page-title">The ledger is closed for this role.</h1>
      </Shell>
    );
  }
  const view = readRevenue(getDb(), ctx);
  return (
    <Shell ctx={ctx} current="revenue">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Revenue</p>
          <h1 className="page-title">{ctx.organizationName}</h1>
          <p className="lede">
            {view.invoiceNote} {view.eligibilityNote} {view.claimNote} {view.denialNote} {view.subscriptionNote} {view.aiNote}
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <p className="provenance">{view.reconciliation.text}</p>
      <p className="muted">{view.usageCount} ledger rows are stored. {view.subscriptionNote}</p>
      <form action="/api/revenue/invoice" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Facility
          <select name="facilityId" required>
            {view.facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>{facility.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Account
          <select name="patientId" required>
            {view.accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.mrn}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Service label
          <input name="serviceLabel" type="text" required minLength={2} maxLength={80} />
        </label>
        <label className="field">
          Amount in cents
          <input name="amountCents" type="number" min={1} max={1000000} step={1} required />
        </label>
        <button className="btn-line" type="submit">Record amount</button>
      </form>
      {view.invoices.length > 0 ? (
        <form action="/api/revenue/payment" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Invoice
            <select name="invoiceId" required>
              {view.invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.amountCents} cents</option>
              ))}
            </select>
          </label>
          <label className="field">
            Payment cents
            <input name="amountCents" type="number" min={1} max={1000000} step={1} required />
          </label>
          <button className="btn-line" type="submit">Record payment</button>
        </form>
      ) : null}
      <form action="/api/revenue/eligibility" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Facility
          <select name="facilityId" required>
            {view.facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>{facility.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Account
          <select name="patientId" required>
            {view.accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.mrn}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Payer label
          <input name="payerLabel" type="text" required minLength={2} maxLength={80} />
        </label>
        <button className="btn-line" type="submit">Store eligibility note</button>
      </form>
      {view.invoices.length > 0 ? (
        <form action="/api/revenue/claim" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Invoice for a draft
            <select name="invoiceId" required>
              {view.invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.serviceLabel}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Store draft</button>
        </form>
      ) : null}
      {view.claims.length > 0 ? (
        <form action="/api/revenue/submit" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Draft
            <select name="claimId" required>
              {view.claims.map((claim) => (
                <option key={claim.id} value={claim.id}>{claim.status}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Try to submit</button>
        </form>
      ) : null}
      <form action="/api/revenue/plan" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Plan label
          <input name="planLabel" type="text" required minLength={2} maxLength={80} />
        </label>
        <button className="btn-line" type="submit">Store plan</button>
      </form>
      <form action="/api/revenue/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Ask the gateway</button>
      </form>
      <div className="board" style={{ marginTop: 16 }}>
        {view.invoices.map((invoice) => (
          <section className="card" key={invoice.id}>
            <p className="eyebrow">{invoice.status}</p>
            <h2>{invoice.serviceLabel}</h2>
            <p>{invoice.amountCents} cents · {invoice.patientId}</p>
            <p>{invoice.note}</p>
          </section>
        ))}
        {view.claims.map((claim) => (
          <section className="card" key={claim.id}>
            <p className="eyebrow">{claim.status} · {claim.attempts} attempts</p>
            <h2>Claim draft</h2>
            <p>{view.claimNote}</p>
          </section>
        ))}
        {view.subscription ? (
          <section className="card">
            <p className="eyebrow">{view.subscription.status}</p>
            <h2>{view.subscription.planLabel}</h2>
            <p>{view.subscriptionNote}</p>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
