import { canReadChart, ensureClinicBoard, ForbiddenError, getDb, listDirectory, listFacilityBoard, noteDenial, readFacility } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function FacilityPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; ward?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "facility.read", "FacilityState", ctx.facilityId);
    return (
      <Shell ctx={ctx} current="facility">
        <p className="eyebrow">Facility</p>
        <h1 className="page-title">The facility projection is closed for this role.</h1>
      </Shell>
    );
  }
  ensureClinicBoard(getDb());
  const view = readFacility(getDb(), ctx);
  const board = listFacilityBoard(getDb(), ctx);
  const wards = ["All", ...new Set(board.beds.map((bed) => bed.ward))];
  const ward = query.ward && wards.includes(query.ward) ? query.ward : "All";
  const beds = ward === "All" ? board.beds : board.beds.filter((bed) => bed.ward === ward);
  const occupied = board.beds.filter((bed) => bed.status === "occupied").length;
  const open = board.beds.filter((bed) => bed.status === "open").length;
  const closed = board.beds.filter((bed) => bed.status === "closed").length;
  const staff = workforce(ctx.facilityId);
  return (
    <Shell ctx={ctx} current="facility">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Beds and wards</p>
          <h1 className="page-title">{ctx.facilityName}</h1>
          <p className="lede">These counts are stored bed rows. They are not a forecast and they do not assign the next bed.</p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <p className="muted">
        {view.built ? `Version ${view.version} · built ${formatWhen(view.builtAt ?? "")}` : "Not built yet."}
        {view.stale ? " · source rows changed after this build" : ""}
        {view.eventsPending ? " · an event is waiting" : ""}
      </p>
      <form action="/api/facility/rebuild" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <button className="btn-line" type="submit">Rebuild from stored rows</button>
      </form>
      <div className="stat-grid">
        <section className="card stat">
          <p className="eyebrow">Total beds</p>
          <p className="stat-value">{board.beds.length}</p>
          <p className="muted">Stored on this facility</p>
        </section>
        <section className="card stat">
          <p className="eyebrow">Occupied</p>
          <p className="stat-value">{occupied}</p>
          <p className="muted">{board.beds.length === 0 ? "No rows stored" : `${Math.round((occupied / board.beds.length) * 100)}% of stored beds`}</p>
        </section>
        <section className="card stat">
          <p className="eyebrow">Open</p>
          <p className="stat-value">{open}</p>
          <p className="muted">Ready for a stored assignment</p>
        </section>
        <section className="card stat">
          <p className="eyebrow">Closed</p>
          <p className="stat-value">{closed}</p>
          <p className="muted">Not in use</p>
        </section>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-row">
          <p className="eyebrow">Ward availability</p>
          <p className="muted">{beds.length} shown</p>
        </div>
        <nav className="filters" aria-label="Ward">
          {wards.map((name) => (
            <a key={name} href={name === "All" ? "/facility" : `/facility?ward=${name}`} aria-current={ward === name ? "page" : undefined}>
              {name}
              {name === "All" ? ` (${board.beds.length})` : ` (${board.beds.filter((bed) => bed.ward === name).length})`}
            </a>
          ))}
        </nav>
        {beds.length === 0 ? (
          <p>No bed rows are stored for this ward.</p>
        ) : (
          <table className="ward-table">
            <thead>
              <tr>
                <th>Bed</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Ward</th>
              </tr>
            </thead>
            <tbody>
              {beds.map((bed) => (
                <tr key={bed.id}>
                  <td className="mono">{bed.label}</td>
                  <td>
                    {bed.patientName ? (
                      <a href={`/patients/${bed.patientId}`}>
                        {bed.patientName}
                        <span className="muted"> · {bed.mrn}</span>
                      </a>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${bed.status}`}>{bed.status}</span>
                  </td>
                  <td>{bed.ward}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <p className="eyebrow">On shift</p>
        {board.shifts.length === 0 ? (
          <p>No shift rows are stored.</p>
        ) : (
          board.shifts.map((shift) => (
            <p key={shift.id}>
              {shift.displayName} · <span className={`pill ${shift.status === "active" ? "open" : "occupied"}`}>{shift.status}</span>
              <span className="muted"> · {formatWhen(shift.startsAt)} – {formatWhen(shift.endsAt)}</span>
            </p>
          ))
        )}
      </section>
      <div className="board" style={{ marginTop: 16 }}>
        {(view.state?.signals ?? []).map((signal) => (
          <section className="card" key={signal.kind}>
            <p className="eyebrow">{signal.kind}</p>
            <p>{signal.text}</p>
            <p className="provenance">
              {signal.sourceTable} · {signal.count} · {signal.slaVersion} · {Math.round(signal.slaSeconds / 60)} min
              {signal.sourceAt ? ` · source ${formatWhen(signal.sourceAt)}` : ""}
            </p>
          </section>
        ))}
        <details className="card">
          <summary className="eyebrow">Add a bed, shift, or piece of equipment</summary>
          <div className="board" style={{ marginTop: 12 }}>
        <section className="card">
          <p className="eyebrow">Bed</p>
          <form action="/api/facility/bed" method="post" className="form-grid">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Label
              <input name="label" type="text" required minLength={2} maxLength={80} />
            </label>
            <label className="field">
              Status
              <select name="status" required defaultValue="open">
                <option value="open">Open</option>
                <option value="occupied">Occupied</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="field">
              Patient id if occupied
              <input name="patientId" type="text" maxLength={80} />
            </label>
            <button className="btn-line" type="submit">Store bed</button>
          </form>
        </section>
        <section className="card">
          <p className="eyebrow">Shift</p>
          <form action="/api/facility/shift" method="post" className="form-grid">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Person
              <select name="userId" required>
                {staff.map((person) => (
                  <option key={person.userId} value={person.userId}>{person.displayName}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Starts
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label className="field">
              Ends
              <input name="endsAt" type="datetime-local" required />
            </label>
            <label className="field">
              Status
              <select name="status" required defaultValue="scheduled">
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="finished">Finished</option>
              </select>
            </label>
            <button className="btn-line" type="submit">Store shift</button>
          </form>
        </section>
        <section className="card">
          <p className="eyebrow">Equipment</p>
          <form action="/api/facility/equipment" method="post" className="form-grid">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Label
              <input name="label" type="text" required minLength={2} maxLength={80} />
            </label>
            <label className="field">
              Status
              <select name="status" required defaultValue="available">
                <option value="available">Available</option>
                <option value="out-of-service">Out of service</option>
              </select>
            </label>
            <button className="btn-line" type="submit">Store equipment</button>
          </form>
        </section>
        <section className="card">
          <p className="eyebrow">Explanation</p>
          <p className="muted">The gateway cannot replace a stored count.</p>
          <form action="/api/facility/explain" method="post">
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <button className="btn-text" type="submit">Ask the gateway</button>
          </form>
        </section>
          </div>
        </details>
      </div>
    </Shell>
  );
}

function workforce(facilityId: string | null) {
  try {
    return listDirectory(getDb()).filter((person) => person.facilityId === facilityId && (person.role === "clinician" || person.role === "nurse"));
  } catch (error) {
    if (error instanceof ForbiddenError) return [];
    throw error;
  }
}
