import { getDb, readPortal } from "@curasphere/domain";
import { redirect } from "next/navigation";
import { Feedback } from "@/components/feedback";
import { Icon, type IconName } from "@/components/icon";
import { formatWhen } from "@/lib/format";
import { currentPortal } from "@/lib/http";
import { readFeedback } from "@/lib/messages";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function tile(iso: string) {
  const date = new Date(iso);
  return { month: MONTHS[date.getUTCMonth()] ?? "", day: String(date.getUTCDate()) };
}

function tone(interpretation: string) {
  const text = interpretation.toLowerCase();
  if (text.includes("high") || text.includes("critical") || text.includes("abnormal")) return "high";
  if (text.includes("low")) return "low";
  return "normal";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const SECTIONS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "#visits", label: "Visits", icon: "calendar" },
  { href: "#health", label: "Medicines and results", icon: "heartPulse" },
  { href: "#messages", label: "Messages", icon: "message" },
  { href: "#questions", label: "Questions", icon: "help" },
  { href: "#coverage", label: "Coverage", icon: "shieldCheck" },
];

export default async function PortalHomePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await currentPortal();
  if (!ctx) redirect("/portal");
  const query = await searchParams;
  const feedback = readFeedback(query);
  const portal = readPortal(getDb(), ctx);
  const now = Date.now();
  const upcoming = portal.appointments.filter((item) => Date.parse(item.startsAt) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = portal.appointments.filter((item) => Date.parse(item.startsAt) < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const next = upcoming[0] ?? null;
  const name = `${portal.givenName} ${portal.familyName}`;

  return (
    <div className="shell">
      <aside className="side">
        <div>
          <a className="brand" href="/portal/home">
            <span className="mark" aria-hidden="true" />
            CuraSphere
          </a>
        </div>
        <div className="pt-me">
          <span className="pt-avatar" aria-hidden="true">{initials(name)}</span>
          <div>
            <strong>{ctx.displayName}</strong>
            <span className="muted">Patient access</span>
          </div>
        </div>
        <nav className="nav" aria-label="Your record">
          <div>
            <p className="nav-label">Your record</p>
            {SECTIONS.map((item) => (
              <a key={item.href} href={item.href}>
                <Icon name={item.icon} size={17} />
                {item.label}
              </a>
            ))}
          </div>
        </nav>
        <p className="where pt-where">
          <span className="eyebrow">Your facility</span>
          <strong>{ctx.facilityName}</strong>
        </p>
        <form action="/api/portal/signout" method="post">
          <button className="pt-signout" type="submit">
            <Icon name="logout" size={16} />
            Sign out
          </button>
        </form>
      </aside>
      <main className="main pt-main" id="content">
        <section className="pt-hero">
          <div className="pt-hero-copy">
            <p className="pt-kicker">
              <Icon name="heartPulse" size={15} />
              {portal.mrn} · born {portal.birthDate}
            </p>
            <h1>Hello, {portal.givenName}</h1>
            <p>Your visits, medicines and results come straight from the record {ctx.facilityName} keeps for you.</p>
          </div>
          <div className="pt-next">
            <p className="pt-next-label">
              <Icon name="calendar" size={15} />
              {next ? "Next visit" : "No visit booked"}
            </p>
            {next ? (
              <>
                <strong>{formatWhen(next.startsAt)}</strong>
                <span>{next.reason}</span>
              </>
            ) : (
              <>
                <strong>Plan your next visit</strong>
                <span>Send a request below and the clinic will confirm a time.</span>
              </>
            )}
          </div>
        </section>

        <Feedback error={feedback.error} notice={feedback.notice} />

        <div className="pt-stats">
          <Stat icon="calendar" label="Upcoming visits" value={upcoming.length} tint="orange" />
          <Stat icon="pill" label="Medicines" value={portal.medications.length} tint="violet" />
          <Stat icon="droplet" label="Results" value={portal.results.length} tint="blue" />
          <Stat icon="alert" label="Allergies" value={portal.allergies.length} tint="rose" />
        </div>

        <div className="pt-grid">
          <section className="card pt-card" id="visits">
            <Head icon="calendar" tint="orange" title="Visits" sub="Booked times come from the clinic schedule." />
            {portal.appointments.length === 0 ? <p className="muted">No booked visit is stored.</p> : null}
            <ul className="pt-list">
              {[...upcoming, ...past].map((item) => {
                const parts = tile(item.startsAt);
                const done = Date.parse(item.startsAt) < now;
                return (
                  <li key={item.id} className={done ? "is-past" : undefined}>
                    <span className="pt-date">
                      <small>{parts.month}</small>
                      {parts.day}
                    </span>
                    <div>
                      <strong>{item.reason}</strong>
                      <span className="muted">{formatWhen(item.startsAt)}</span>
                    </div>
                    <span className={`pt-pill ${item.status}`}>{item.status}</span>
                  </li>
                );
              })}
            </ul>
            <form action="/api/portal/request" method="post" className="form-grid pt-form">
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="field">
                Request a visit
                <input name="reason" type="text" required minLength={3} maxLength={200} placeholder="What is the visit for?" />
              </label>
              <button className="btn-dark" type="submit">Send request</button>
            </form>
            {portal.requests.length > 0 ? (
              <ul className="pt-list compact">
                {portal.requests.map((item) => (
                  <li key={item.id}>
                    <span className="pt-dot" aria-hidden="true">
                      <Icon name="clock" size={16} />
                    </span>
                    <div>
                      <strong>{item.reason}</strong>
                      <span className="muted">{item.startsAt ? formatWhen(item.startsAt) : "Waiting for the clinic"}</span>
                    </div>
                    <span className={`pt-pill ${item.status}`}>{item.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="card pt-card" id="health">
            <Head icon="pill" tint="violet" title="Medicines" sub="As written on your record." />
            {portal.medications.length === 0 ? <p className="muted">No medication row is stored.</p> : null}
            <ul className="pt-list compact">
              {portal.medications.map((item) => (
                <li key={`${item.display}-${item.dose}`}>
                  <span className="pt-dot violet" aria-hidden="true">
                    <Icon name="pill" size={16} />
                  </span>
                  <div>
                    <strong>{item.display}</strong>
                    <span className="muted">{item.dose}</span>
                  </div>
                  <span className="pt-pill active">{item.status}</span>
                </li>
              ))}
            </ul>
            <Head icon="alert" tint="rose" title="Allergies" />
            {portal.allergies.length === 0 ? <p className="muted">No allergy is stored.</p> : null}
            {portal.allergies.map((item) => (
              <p key={item.display} className="pt-allergy">
                <Icon name="alert" size={16} />
                <span>
                  <strong>{item.display}</strong> · {item.reaction}
                </span>
              </p>
            ))}
          </section>

          <section className="card pt-card wide">
            <div className="pt-row-head">
              <Head icon="droplet" tint="blue" title="Results" sub="Released results with a plain-language note. This does not diagnose." />
              <form action="/api/portal/explain" method="post">
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <button className="btn-line" type="submit">
                  <Icon name="sparkle" size={15} /> Ask for an explanation
                </button>
              </form>
            </div>
            {portal.results.length === 0 ? <p className="muted">No result has been released to your record.</p> : null}
            <div className="pt-results">
              {portal.results.map((item) => (
                <article key={`${item.display}-${item.at}`} className={`pt-result ${tone(item.interpretation)}`}>
                  <header>
                    <span>{item.display}</span>
                    <span className="pt-flag">{item.interpretation}</span>
                  </header>
                  <p className="pt-value">
                    {item.value}
                    <small>{item.unit}</small>
                  </p>
                  <p className="muted">{formatWhen(item.at)}</p>
                  <p>{item.explanation}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card pt-card" id="messages">
            <Head icon="message" tint="orange" title="Messages" sub={`Your thread with ${ctx.facilityName}.`} />
            <div className="pt-thread">
              {portal.messages.length === 0 ? <p className="muted">No messages yet.</p> : null}
              {portal.messages.map((item) => (
                <p key={item.id} className={item.author === "patient" ? "pt-bubble mine" : "pt-bubble"}>
                  <span className="pt-who">{item.author === "patient" ? "You" : "Care team"}</span>
                  {item.body}
                </p>
              ))}
            </div>
            <form action="/api/portal/message" method="post" className="pt-composer">
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="sr" htmlFor="pt-message">
                Message the facility
              </label>
              <input id="pt-message" name="body" type="text" required minLength={1} maxLength={500} placeholder="Write to your care team" />
              <button type="submit" aria-label="Send message">
                <Icon name="send" size={17} />
              </button>
            </form>
          </section>

          <section className="card pt-card" id="questions">
            <Head icon="help" tint="green" title="Questions" sub="Answers come only from your own record." />
            <form action="/api/portal/ask" method="post" className="form-grid pt-form">
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="field">
                Ask about your record
                <input name="text" type="text" required minLength={1} maxLength={500} placeholder="When is my next visit?" />
              </label>
              <button className="btn-dark" type="submit">Ask</button>
            </form>
            {portal.questions.map((item) => (
              <article key={item.id} className={item.instruction ? "pt-question urgent" : "pt-question"}>
                <p>
                  <strong>{item.text}</strong>
                </p>
                {item.instruction ? <p>{item.instruction}</p> : <p className="muted">Stored. Nothing was answered beyond your own rows.</p>}
              </article>
            ))}
          </section>

          <section className="card pt-card wide" id="coverage">
            <Head icon="shieldCheck" tint="blue" title="Coverage and amounts" sub="A stored amount is not a charge. A member id is not a card number." />
            <div className="pt-split">
              <div className="stack">
                {portal.coverage ? (
                  <p className="pt-cover">
                    <Icon name="shieldCheck" size={18} />
                    <span>
                      <strong>{portal.coverage.payerName}</strong>
                      <span className="muted">Member {portal.coverage.memberId}. Nothing was billed.</span>
                    </span>
                  </p>
                ) : null}
                <form action="/api/portal/coverage" method="post" className="form-grid">
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <label className="field">
                    Payer
                    <input name="payerName" type="text" required minLength={2} maxLength={80} />
                  </label>
                  <label className="field">
                    Member id
                    <input name="memberId" type="text" required minLength={2} maxLength={40} />
                  </label>
                  <button className="btn-line" type="submit">Store coverage</button>
                </form>
              </div>
              <div className="stack">
                {portal.payments.map((item) => (
                  <p key={item.id} className="pt-cover">
                    <Icon name="card" size={18} />
                    <span>
                      <strong>
                        {item.description} · {(item.amountCents / 100).toFixed(2)}
                      </strong>
                      <span className="muted">Recorded. Nothing was charged.</span>
                    </span>
                  </p>
                ))}
                <form action="/api/portal/payment" method="post" className="form-grid">
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <label className="field">
                    Description
                    <input name="description" type="text" required minLength={3} maxLength={120} />
                  </label>
                  <label className="field">
                    Amount in cents
                    <input name="amountCents" type="number" required min={1} max={500000} step={1} />
                  </label>
                  <button className="btn-line" type="submit">Record amount</button>
                </form>
              </div>
            </div>
          </section>

          {portal.education.length > 0 ? (
            <section className="card pt-card wide">
              <Head icon="book" tint="violet" title="From your care team" />
              <div className="pt-notes">
                {portal.education.map((item) => (
                  <p key={item.id}>{item.body}</p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value, tint }: { icon: IconName; label: string; value: number; tint: string }) {
  return (
    <div className={`pt-stat ${tint}`}>
      <span className="pt-stat-icon">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Head({ icon, tint, title, sub }: { icon: IconName; tint: string; title: string; sub?: string }) {
  return (
    <header className="pt-head">
      <span className={`pt-head-icon ${tint}`}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <h2>{title}</h2>
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
    </header>
  );
}
