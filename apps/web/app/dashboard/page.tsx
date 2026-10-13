import type { DashboardMetric } from "@curasphere/domain";
import { canReadChart, getDb, readDashboard } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { listFoundationAppointments, listFoundationEncounters, listFoundationPatients } from "@/lib/foundation";
import { requireSession } from "@/lib/session";

const TONES = ["orange", "blue", "green", "red", "ink"] as const;

export default async function DashboardPage() {
  const ctx = await requireSession();
  const view = readDashboard(getDb(), ctx);
  if (canReadChart(ctx)) {
    const [patients, appointments, encounters] = await Promise.all([
      listFoundationPatients(ctx.sessionId, ""),
      listFoundationAppointments(ctx.sessionId),
      listFoundationEncounters(ctx.sessionId),
    ]);
    if (patients) {
      setCount(view.metrics, "Patients", patients.length);
      view.rows = patients.slice(0, 8).map((person) => ({
        id: person.id,
        primary: `${person.givenName} ${person.familyName}`,
        secondary: person.mrn,
        href: `/patients/${person.id}`,
      }));
    }
    if (appointments) setCount(view.metrics, "Appointments", appointments.length);
    if (encounters) setCount(view.metrics, "Open encounters", encounters.length);
  }
  const headlines = view.metrics.slice(0, 4);
  const peak = Math.max(...view.metrics.map((item) => item.count), 1);
  const mixPeak = Math.max(...view.mix.map((item) => item.count), 1);
  const headlineTotal = headlines.reduce((sum, item) => sum + item.count, 0);

  return (
    <Shell ctx={ctx} current="dashboard">
      <p className="lede">These figures are stored rows this account can read. They are not a forecast.</p>
      <div className="metric-grid">
        {headlines.map((item, index) => (
          <a className="card metric metric-link" key={item.label} href={item.href}>
            <p className="metric-label">{item.label}</p>
            {index === 1 ? (
              <div className="metric-split">
                <p className="metric-value">{item.count}</p>
                <Donut percent={share(item.count, headlineTotal)} />
              </div>
            ) : (
              <p className="metric-value">{item.count}</p>
            )}
            {index !== 1 ? (
              <div className={`meter ${TONES[index] ?? "orange"}`} aria-hidden="true">
                <span style={{ width: `${share(item.count, peak)}%` }} />
              </div>
            ) : null}
            <p className="muted">{item.detail}</p>
          </a>
        ))}
      </div>
      <div className="dash-grid">
        <section className="card">
          <div className="section-row">
            <p className="metric-label">Core records</p>
            <p className="muted">{view.metrics.length} models</p>
          </div>
          <div className="model-bars">
            {view.metrics.map((item) => (
              <a key={item.label} href={item.href}>
                <span>{item.label}</span>
                <span className="meter orange" aria-hidden="true">
                  <span style={{ width: `${share(item.count, peak)}%` }} />
                </span>
                <strong>{item.count}</strong>
              </a>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="section-row">
            <p className="metric-label">{view.mixTitle}</p>
            <p className="muted">Stored status</p>
          </div>
          <div className="bubbles">
            {view.mix.length === 0 ? <p className="muted">No rows stored.</p> : null}
            {view.mix.map((item, index) => (
              <span key={item.label} className={`bubble ${bubbleTone(index)}`} style={{ width: bubbleSize(item.count, mixPeak), height: bubbleSize(item.count, mixPeak) }}>
                {item.count}
              </span>
            ))}
          </div>
          <ul className="mix">
            {view.mix.map((item, index) => (
              <li key={item.label}>
                <i className={`swatch ${bubbleTone(index)}`} />
                {item.label} <strong>{share(item.count, view.mix.reduce((sum, slice) => sum + slice.count, 0))}%</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-row">
          <p className="metric-label">{view.listTitle}</p>
          <p className="muted">{view.rows.length} shown</p>
        </div>
        {view.rows.length === 0 ? (
          <p>No rows are stored for this list.</p>
        ) : (
          <table className="ward-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Detail</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.primary}</td>
                  <td className="muted">{row.secondary}</td>
                  <td>{row.href ? <a href={row.href}>Open</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Shell>
  );
}

function setCount(metrics: DashboardMetric[], label: string, count: number) {
  const metric = metrics.find((item) => item.label === label);
  if (metric) metric.count = count;
}

function share(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function bubbleSize(count: number, max: number) {
  return `${72 + (count / max) * 88}px`;
}

function bubbleTone(index: number) {
  return (["occupied", "open", "closed", "occupied"] as const)[index % 4];
}

function Donut({ percent }: { percent: number }) {
  const radius = 28;
  const length = 2 * Math.PI * radius;
  const filled = (percent / 100) * length;
  return (
    <svg className="donut" viewBox="0 0 72 72" role="img" aria-label={`${percent} percent of the headline counts`}>
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${length - filled}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="40" textAnchor="middle">
        {percent}%
      </text>
    </svg>
  );
}
