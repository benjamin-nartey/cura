import { canReadChart, getDb, listWorklist, noteDenial } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { listFoundationAppointments, listFoundationEncounters } from "@/lib/foundation";
import { formatClock, formatDay } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function WorklistPage() {
  const ctx = await requireSession();
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "worklist.read", "Worklist", null);
    return (
      <Shell ctx={ctx} current="worklist">
        <p className="eyebrow">Worklist</p>
        <h1 className="page-title">The chart is closed for this role.</h1>
        <p className="lede">Audit review does not open the facility worklist.</p>
      </Shell>
    );
  }
  const board = listWorklist(getDb(), ctx);
  const appointments = await listFoundationAppointments(ctx.sessionId);
  const openEncounters = await listFoundationEncounters(ctx.sessionId);
  return (
    <Shell ctx={ctx} current="worklist">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">{formatDay(board.date)}</h1>
      <p className="lede">Appointments and open encounters are read from the foundation service. Times are UTC.</p>
      <div className="split">
        <section>
          <h2 className="section-title">Appointments</h2>
          {appointments === null ? (
            <p>The foundation service is not running.</p>
          ) : appointments.length === 0 ? (
            <p>No appointments on this UTC date.</p>
          ) : (
            <div className="list">
              {appointments.map((item) => (
                <a className="row" key={item.id} href={`/patients/${item.patientId}`}>
                  <span className="mono">{formatClock(item.startsAt)}</span>
                  <span>
                    <span className="person">{item.patientName}</span>
                    <span className="muted" style={{ display: "block" }}>
                      {item.reason}
                    </span>
                  </span>
                  <span className="mono">{item.mrn}</span>
                </a>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="section-title">Open encounters</h2>
          {openEncounters === null ? (
            <p>The foundation service is not running.</p>
          ) : openEncounters.length === 0 ? (
            <p>No encounter is in progress.</p>
          ) : (
            <div className="list">
              {openEncounters.map((item) => (
                <a className="row" key={item.id} href={`/patients/${item.patientId}`}>
                  <span className="mono">{formatClock(item.startedAt)}</span>
                  <span>
                    <span className="person">{item.patientName}</span>
                    <span className="muted" style={{ display: "block" }}>
                      {item.reason}
                    </span>
                  </span>
                  <span className="mono">{item.mrn}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
