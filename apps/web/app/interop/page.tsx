/* Individual page workspace */
import {PageHeader,PageActions,SectionHeading} from "@/components/page-workspace";
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
        <PageHeader section="Interoperability" href="/interop" icon="plug" eyebrow={<>Interop</>} description={<>Audit review does not open patient records.</>}><h1 className="page-title">The chart exchange is closed for this role.</h1></PageHeader>
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
      <PageHeader section="Interoperability" href="/interop" icon="plug" eyebrow={<>{ctx.facilityName}</>}><h1 className="page-title">FHIR R4</h1></PageHeader>
      <PageActions><a href="/interop/conformance">Inspect published conformance and compatibility</a></PageActions>
      <PageActions><a href="/interop/reconciliation">Review bulk movement and reconciliation</a></PageActions>
      <PageActions><a href="/interop/partners">Manage signed partner exchange</a></PageActions>
      <PageActions><a href="/interop/source">Open current-record FHIR source workbench</a></PageActions>
      <PageActions><a href="/interop/apps">Manage SMART applications and patient grants</a></PageActions>
      <p className="lede">
        This legacy chart exchange uses your workspace session. Connected applications provide scoped SMART-style reads for current source records. Legacy notifications stay in the local inbox.
      </p>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <div className="stack">
        <section>
          <SectionHeading icon="plug"><h2>Published resources</h2></SectionHeading>
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
          <SectionHeading icon="plug"><h2>Patient</h2></SectionHeading>
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
          <SectionHeading icon="plug"><h2>Local inbox</h2></SectionHeading>
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
          <SectionHeading icon="plug"><h2>Facility export</h2></SectionHeading>
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
              <PageActions>
                <a href={`/api/fhir/r4/$export/${exportFile.id}`}>{exportFile.lineCount} resources</a>
              </PageActions>
              <pre className="record">{exportFile.ndjson.split("\n").slice(0, 2).join("\n")}</pre>
            </>
          ) : null}
        </section>
      </div>
    </Shell>
  );
}
