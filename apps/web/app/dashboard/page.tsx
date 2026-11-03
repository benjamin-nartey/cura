import { getDb, readDashboard } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/session";

const TONES = ["orange", "blue", "green", "red", "ink"] as const;

export default async function DashboardPage() {
  const ctx = await requireSession();
  const view = readDashboard(getDb(), ctx);
  const headlines = view.metrics.slice(0, 4);
  const peak = Math.max(...view.metrics.map((item) => item.count), 1);
  const mixPeak = Math.max(...view.mix.map((item) => item.count), 1);

  return (
    <Shell ctx={ctx} current="dashboard">
      <div className="dashboard-welcome"><div><p className="eyebrow">YOUR WORKSPACE, AT A GLANCE</p><h2>Welcome back, {ctx.displayName.split(" ")[0]}.</h2><p>Your facility’s activity, patient records, and care workflows in one view.</p></div><span className="workspace-context"><span className="live-dot" /> {ctx.facilityName ?? ctx.organizationName}</span></div>
      <div className="metric-grid">
        {headlines.map((item, index) => (
          <a className="card metric metric-link" key={item.label} href={item.href}>
            <p className="metric-label">{item.label}</p>
            <p className="metric-value">{item.count}</p>
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
            <p className="metric-label">Activity overview</p>
            <p className="muted">{view.metrics.length} categories</p>
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
            <p className="muted">Current status</p>
          </div>
          <div className="bubbles">
            {view.mix.length === 0 ? <p className="muted">No activity recorded yet.</p> : null}
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
          <p>No records are available for this view.</p>
        ) : (
          <div className="data-table-region" role="region" aria-label="Patient activity" tabIndex={0}><table className="ward-table">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Detail</th>
                <th scope="col">Action</th>
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
          </table></div>
        )}
      </section>
    </Shell>
  );
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
