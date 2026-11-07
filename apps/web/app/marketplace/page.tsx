/* Individual page workspace */
import {PageHeader,SectionHeading} from "@/components/page-workspace";
import { getDb, noteDenial, readMarketplace } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (ctx.role !== "admin" && ctx.role !== "auditor") {
    noteDenial(getDb(), ctx, "marketplace.read", "MarketplaceListing", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="marketplace">
        <PageHeader section="Marketplace" href="/marketplace" icon="store" eyebrow={<>Marketplace</>}><h1 className="page-title">Marketplace listings are closed for this role.</h1></PageHeader>
      </Shell>
    );
  }
  const view = readMarketplace(getDb(), ctx);
  const admin = ctx.role === "admin";
  return (
    <Shell ctx={ctx} current="marketplace">
      <header className="chart-head">
        <div>
          <PageHeader section="Marketplace" href="/marketplace" icon="store" eyebrow={<>Marketplace · {view.compatVersion}</>} description={<>
            {view.portalNote} {view.oauthNote} {view.sandboxNote} {view.compatNote} {view.listingNote} {view.reviewNote} {view.shareNote} {view.killNote} {view.releaseNote} {view.aiNote}
          </>}><h1 className="page-title">{ctx.organizationName}</h1></PageHeader>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      {admin ? (
        <>
          <section className="page-form card"><form action="/api/marketplace/listing" method="post" className="form-grid">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Listing label
              <input name="label" type="text" required minLength={2} maxLength={40} />
            </label>
            <button className="btn-line" type="submit">Store administrative listing</button>
          </form></section>
          <section className="page-form card"><form action="/api/marketplace/oauth" method="post" className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <button className="btn-line" type="submit">Issue an OAuth client</button>
          </form></section>
          <section className="page-form card"><form action="/api/marketplace/sandbox" method="post" className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <button className="btn-line" type="submit">Open a sandbox tenant</button>
          </form></section>
        </>
      ) : null}
      <section className="page-form card"><form action="/api/marketplace/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Ask the gateway</button>
      </form></section>
      <div className="board" style={{ marginTop: 16 }}>
        {view.listings.map((listing) => (
          <section className="card" key={listing.id}>
            <p className="eyebrow">{listing.status} · {listing.scope} · {listing.risk}</p>
            <SectionHeading icon="store"><h2>{listing.label}</h2></SectionHeading>
            <p>{listing.note}</p>
            <p className="muted">{listing.id}</p>
            {admin ? (
              <>
                <section className="page-form card"><form action="/api/marketplace/share" method="post" className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button className="btn-line" type="submit">Record share as not billed</button>
                </form></section>
                <section className="page-form card"><form action="/api/marketplace/stop" method="post" className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button className="btn-line" type="submit">Stop the listing</button>
                </form></section>
                <section className="page-form card"><form action="/api/marketplace/release" method="post" className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button className="btn-line" type="submit">Release the listing</button>
                </form></section>
              </>
            ) : null}
            {ctx.role === "auditor" && listing.status === "awaiting-review" ? (
              <form action="/api/marketplace/review" method="post" className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="hidden" name="listingId" value={listing.id} />
                <button className="btn-line" type="submit">Store a hold review</button>
              </form>
            ) : null}
          </section>
        ))}
        {view.shares.map((share) => (
          <section className="card" key={share.id}>
            <p className="eyebrow">{share.status}</p>
            <SectionHeading icon="store"><h2>Share</h2></SectionHeading>
            <p>{view.shareNote}</p>
          </section>
        ))}
      </div>
    </Shell>
  );
}
