import { randomUUID } from "node:crypto";
import {
  NotFoundError,
  canReadChart,
  fhirCapability,
  getDb,
  listObservationSubscriptions,
  listPatients,
  noteDenial,
  readFhirExport,
  readFhirResource,
  searchFhir,
} from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function InteropPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; export?: string; error?: string; notice?: string }>;
}) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "fhir.read", "CapabilityStatement", null);
    return (
      <Shell ctx={ctx} current="interop">
        <p className="eyebrow">Interop</p>
        <h1 className="page-title">The chart exchange is closed for this role.</h1>
        <p className="lede">Audit review does not open patient records.</p>
      </Shell>
    );
  }

  const statement = fhirCapability();
  const resources = (
    statement.rest as Array<{ resource: Array<{ type: string; interaction: Array<{ code: string }> }> }>
  )[0].resource;
  const patients = listPatients(getDb(), ctx);
  const patientId = query.patient && /^[A-Za-z0-9_-]{1,80}$/.test(query.patient) ? query.patient : "";
  const patient = patientId ? readFhirResource(getDb(), ctx, "Patient", patientId) : null;
  const observations = patient
    ? searchFhir(getDb(), ctx, "Observation", { patient: `Patient/${patientId}` })
    : null;
  const subscriptions = listObservationSubscriptions(getDb(), ctx);
  const exportId = query.export && /^exp_[A-Za-z0-9_-]{1,80}$/.test(query.export) ? query.export : "";
  let exportFile: { id: string; ndjson: string; lineCount: number } | null = null;
  let exportMissing = false;
  if (exportId) {
    try {
      exportFile = readFhirExport(getDb(), ctx, exportId);
    } catch (error) {
      if (error instanceof NotFoundError) exportMissing = true;
      else throw error;
    }
  }

  return (
    <Shell ctx={ctx} current="interop">
      <p className="eyebrow">{ctx.facilityName}</p>
      <h1 className="page-title">FHIR R4</h1>
      <p className="lede">
        This is the same facility chart, published as R4 JSON. The directory session is the authorization. SMART on FHIR is not available, and notifications stay in the local inbox.
      </p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="stack">
        <section>
          <h2>Published resources</h2>
          <p className="muted">FHIR {String(statement.fhirVersion)}. R5 is not served from this path.</p>
          <div className="list">
            {resources.map((resource) => (
              <article className="row" key={resource.type} style={{ gridTemplateColumns: "220px minmax(0, 1fr)" }}>
                <strong>{resource.type}</strong>
                <span className="muted">{resource.interaction.map((item) => item.code).join(", ")}</span>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2>Patient</h2>
          <div className="list">
            {patients.map((item) => (
              <a className="row" key={item.id} href={`/interop?patient=${item.id}`}>
                <span className="mono">{item.mrn}</span>
                <span className="person">
                  {item.givenName} {item.familyName}
                </span>
              </a>
            ))}
          </div>
          {patientId && !patient ? <p>That record is not on this facility.</p> : null}
          {patient ? (
            <>
              <pre className="record">{JSON.stringify(patient, null, 2)}</pre>
              <pre className="record">{JSON.stringify(observations, null, 2)}</pre>
            </>
          ) : null}
        </section>
        <section>
          <h2>Local inbox</h2>
          <p className="lede">New observations on this facility are copied here. An outside address is refused.</p>
          <form action="/api/fhir/subscription" method="post">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <button className="btn-dark" type="submit">
              Subscribe to observations
            </button>
          </form>
          <div className="list">
            {subscriptions.length === 0 ? <p className="row">No subscription on this facility yet.</p> : null}
            {subscriptions.map((item) => (
              <article className="row" key={item.id} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <span>
                  <strong>{item.criteria}</strong>
                  <span className="provenance">{item.endpoint}</span>
                </span>
                <span className="muted">{item.notifications} stored</span>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2>Facility export</h2>
          <p className="lede">NDJSON is built from the source rows when you download it. It includes this facility only.</p>
          <form action="/api/fhir/export" method="post">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <button className="btn-line" type="submit">
              Prepare export
            </button>
          </form>
          {exportMissing ? <p>That export is not on this facility.</p> : null}
          {exportFile ? (
            <>
              <p className="meta">
                <a href={`/api/fhir/r4/$export/${exportFile.id}`}>{exportFile.lineCount} resources</a>
              </p>
              <pre className="record">{exportFile.ndjson.split("\n").slice(0, 2).join("\n")}</pre>
            </>
          ) : null}
        </section>
      </div>
    </Shell>
  );
}
