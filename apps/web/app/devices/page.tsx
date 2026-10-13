import { canReadChart, getDb, listPatients, noteDenial, readDevices } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

const KINDS = [
  { id: "pulse-oximeter", label: "Pulse oximeter" },
  { id: "blood-pressure-cuff", label: "Blood pressure cuff" },
  { id: "glucose-meter", label: "Glucose meter" },
];

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "device.read", "Device", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="devices">
        <p className="eyebrow">Devices</p>
        <h1 className="page-title">Device readings are closed for this role.</h1>
      </Shell>
    );
  }
  const db = getDb();
  const view = readDevices(db, ctx);
  const patients = listPatients(db, ctx);
  const openAlerts = view.devices.flatMap((device) => device.alerts.filter((alert) => alert.status === "open").map((alert) => ({ ...alert, label: device.label })));
  return (
    <Shell ctx={ctx} current="devices">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Devices · {view.normalizationVersion}</p>
          <h1 className="page-title">{ctx.facilityName}</h1>
          <p className="lede">
            {view.connectivityNote} A reading uses the facility catalog unit. The alert budget is {view.alertBudget}. {view.aiNote}
          </p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form action="/api/devices/register" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Patient
          <select name="patientId" required>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.familyName}, {patient.givenName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Kind
          <select name="kind" required defaultValue="pulse-oximeter">
            {KINDS.map((kind) => (
              <option key={kind.id} value={kind.id}>{kind.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Label
          <input name="label" type="text" required minLength={2} maxLength={40} />
        </label>
        <button className="btn-line" type="submit">Register device</button>
      </form>
      {view.devices.length > 0 ? (
        <form action="/api/devices/reading" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Device
            <select name="deviceId" required>
              {view.devices.map((device) => (
                <option key={device.id} value={device.id}>{device.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Value
            <input name="value" type="number" step="any" required />
          </label>
          <label className="field">
            Reading time
            <input name="effectiveAt" type="datetime-local" required />
          </label>
          <button className="btn-line" type="submit">Store reading</button>
        </form>
      ) : null}
      {view.devices.length > 0 ? (
        <form action="/api/devices/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Device to explain
            <select name="deviceId" required>
              {view.devices.map((device) => (
                <option key={device.id} value={device.id}>{device.label}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Ask the gateway</button>
        </form>
      ) : null}
      {openAlerts.length > 0 ? (
        <form action="/api/devices/acknowledge" method="post" className="form-grid" style={{ marginTop: 12 }}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Open mark
            <select name="alertId" required>
              {openAlerts.map((alert) => (
                <option key={alert.id} value={alert.id}>{alert.label}</option>
              ))}
            </select>
          </label>
          <button className="btn-line" type="submit">Acknowledge</button>
        </form>
      ) : null}
      <div className="board" style={{ marginTop: 16 }}>
        {view.devices.map((device) => (
          <section className="card wide" key={device.id}>
            <p className="eyebrow">{device.kind} · {device.connectivity}</p>
            <h2>{device.label}</h2>
            <p>{device.connectivityNote}</p>
            <p className="muted">Patient {device.patientId} · registered {formatWhen(device.createdAt)}</p>
            {device.readings.map((reading) => (
              <p key={reading.id} className="provenance">
                {reading.display} {reading.value} {reading.unit} · {reading.order} · {reading.effectiveAt} · {reading.normalizationVersion}
              </p>
            ))}
            {device.alerts.map((alert) => (
              <p key={alert.id} className="provenance">{alert.status} · {alert.note}</p>
            ))}
            {device.escalations.map((item) => (
              <p key={item.id} className="provenance">{item.note}</p>
            ))}
          </section>
        ))}
      </div>
    </Shell>
  );
}
