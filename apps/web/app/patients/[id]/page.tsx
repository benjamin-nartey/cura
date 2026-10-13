import { canReadChart, canRegisterPatient, evidenceFromChart, filterTimeline, formatQuantity, getChart, getDb, groupTimelineByDay, isTimelineGroup, listFacilityObservationCatalog, noteDenial, patientStateFromChart, readCoordination, readCopilot, readCopilotTurn, readDocumentation, readLab, readPatientDesk, readRx, TERMINOLOGY } from "@curasphere/domain";
import { notFound } from "next/navigation";
import { Feedback } from "@/components/feedback";
import { listFoundationConditionCatalog, listFoundationObservations, readFoundationChartCore, readFoundationTimeline } from "@/lib/foundation";
import { Shell } from "@/components/shell";
import { formatDay, formatWhen, sexLabel } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

export default async function ChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; group?: string; turn?: string }>;
}) {
  const ctx = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const feedback = readFeedback(query);
  const group = query.group && isTimelineGroup(query.group) ? query.group : "all";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) notFound();
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "patient.read", "Patient", id);
    return (
      <Shell ctx={ctx} current="patients">
        <p className="eyebrow">Chart</p>
        <h1 className="page-title">The chart is closed for this role.</h1>
      </Shell>
    );
  }
  const chart = getChart(getDb(), ctx, id);
  if (!chart) {
    return (
      <Shell ctx={ctx} current="patients">
        <p className="eyebrow">Record</p>
        <h1 className="page-title">Nothing on this facility matches.</h1>
        <p className="lede">The identifier is missing here, or it belongs to another facility.</p>
      </Shell>
    );
  }
  const catalog = listFacilityObservationCatalog(getDb(), ctx);
  const problems = await listFoundationConditionCatalog(ctx.sessionId);
  const state = patientStateFromChart(getDb(), ctx, chart);
  const evidence = evidenceFromChart(getDb(), ctx, chart);
  const copilot = readCopilot(getDb(), ctx, chart.patient.id);
  const turn = query.turn && /^ask_[A-Za-z0-9-]{1,80}$/.test(query.turn) ? readCopilotTurn(getDb(), ctx, query.turn) : null;
  const answer = turn && turn.patientId === chart.patient.id ? turn : null;
  const documentation = readDocumentation(getDb(), ctx, chart.patient.id);
  const lab = readLab(getDb(), ctx, chart.patient.id);
  const rx = readRx(getDb(), ctx, chart.patient.id);
  const care = readCoordination(getDb(), ctx, chart.patient.id);
  const desk = readPatientDesk(getDb(), ctx, chart.patient.id);
  const foundationTimeline = await readFoundationTimeline(ctx.sessionId, chart.patient.id, group);
  const deviceOnly = filterTimeline(
    chart.timeline.filter((event) => event.sourceTable === "device_readings"),
    group,
  );
  const events = foundationTimeline
    ? [...foundationTimeline.events, ...deviceOnly].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)))
    : filterTimeline(chart.timeline, group);
  const days = groupTimelineByDay(events);
  const since = foundationTimeline ? foundationTimeline.since : chart.briefing.since;
  const changes = foundationTimeline?.changes ?? chart.briefing.items;
  const filters = [
    ["all", "All"],
    ["results", "Results"],
    ["encounters", "Encounters"],
    ["problems", "Problems"],
    ["allergies", "Allergies"],
    ["medications", "Medications"],
    ["visits", "Visits"],
  ] as const;
  const open = chart.encounters.find((encounter) => encounter.status === "in-progress");
  const sourceResults = await listFoundationObservations(ctx.sessionId, chart.patient.id);
  const core = await readFoundationChartCore(ctx.sessionId, chart.patient.id);
  const latest = new Map<string, NonNullable<typeof sourceResults>[number]>();
  for (const observation of sourceResults ?? []) {
    if (!latest.has(observation.code)) latest.set(observation.code, observation);
  }
  return (
    <Shell ctx={ctx} current="patients">
      <header className="chart-head">
        <div>
          <p className="eyebrow">{chart.patient.mrn}</p>
          <h1 className="page-title">
            {chart.patient.givenName} {chart.patient.familyName}
          </h1>
          <p className="meta">
            <span>
              {chart.patient.ageYears} years · {sexLabel(chart.patient.sex)}
            </span>
            <span>{ctx.facilityName}</span>
            <span>Record version {chart.patient.version}</span>
            <span className="mono">Confidentiality {chart.patient.confidentiality}</span>
          </p>
        </div>
      </header>
      {core === null ? (
        <p>The foundation service is not running.</p>
      ) : core.allergies.length > 0 ? (
        <div className="allergy">
          <strong>Allergies. </strong>
          {core.allergies.map((allergy) => `${allergy.display} · ${allergy.reaction}`).join(" · ")}
        </div>
      ) : (
        <p>No allergies on this record.</p>
      )}
      <section className="card">
        <p className="eyebrow">Record an allergy</p>
        <p className="muted">Stores the substance and reaction entered here. The criticality is the one selected. It does not grade risk.</p>
        <form className="form-grid" action="/api/allergies" method="post">
          <input type="hidden" name="patientId" value={chart.patient.id} />
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <label className="field">
            Substance
            <input name="display" required maxLength={80} />
          </label>
          <label className="field">
            Reaction
            <input name="reaction" required maxLength={80} />
          </label>
          <label className="field">
            Criticality
            <select name="criticality" defaultValue="low">
              <option value="low">low</option>
              <option value="high">high</option>
            </select>
          </label>
          <button className="btn-line" type="submit">Store allergy</button>
        </form>
      </section>
      <div className="chart">
        <section className="timeline-pane">
          <h2 className="section-title">Timeline</h2>
          <p className="muted">Every line is a source row. A group only hides other rows. Nothing here is generated.</p>
          <nav className="filters" aria-label="Timeline group">
            {filters.map(([id, label]) => (
              <a
                key={id}
                href={id === "all" ? `/patients/${chart.patient.id}` : `/patients/${chart.patient.id}?group=${id}`}
                aria-current={group === id ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          {days.length === 0 ? (
            <p>No source rows in this group. The record is unchanged.</p>
          ) : (
            days.map((day) => (
              <div key={day.day}>
                <p className="day-label">{formatDay(day.day)}</p>
                <ol className="timeline">
                  {day.events.map((event) => (
                    <li key={event.id} id={`source-${event.sourceId}`} className={event.abnormal ? "is-abnormal" : undefined}>
                      <h3>{event.title}</h3>
                      <p>
                        {formatWhen(event.at)} · {event.detail}
                      </p>
                      <span className="provenance">
                        {event.sourceTable} · {event.sourceId}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
        <aside className="rail">
          <Feedback error={feedback.error} notice={feedback.notice} />
          <section className="card">
            <p className="eyebrow">Encounter</p>
            {open ? (
              <form action="/api/encounters/complete" method="post" className="form-grid">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="encounterId" value={open.id} />
                <input type="hidden" name="expectedVersion" value={open.version} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <p>
                  Open · {open.reason}
                  <span className="muted"> · version {open.version}</span>
                </p>
                <button className="btn-line" type="submit">
                  Mark finished
                </button>
              </form>
            ) : (
              <form action="/api/encounters" method="post" className="form-grid">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label className="field">
                  Reason
                  <input name="reason" type="text" required minLength={3} maxLength={200} />
                </label>
                <button className="btn-line" type="submit">
                  Open encounter
                </button>
              </form>
            )}
          </section>
          <section className="card">
            <p className="eyebrow">Since last finished encounter</p>
            <p className="muted" style={{ marginTop: 8 }}>
              {since
                ? `Compared with the encounter finished ${formatWhen(since)}. This note does not direct care.`
                : "No finished encounter yet, so older history stays on the timeline."}
            </p>
            {changes.length === 0 ? (
              <p>Nothing new since that encounter.</p>
            ) : (
              <ul className="briefing">
                {changes.map((item) => (
                  <li key={`${item.sourceId}-${item.text}`}>
                    <a href={`#source-${item.sourceId}`}>
                      {item.text}
                      {item.abnormal ? <span className="flag high"> · Flag</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <p className="eyebrow">Problems</p>
            <p className="muted">This list is read from the foundation service.</p>
            {core === null ? (
              <p>The foundation service is not running.</p>
            ) : core.conditions.length === 0 ? (
              <p>None recorded.</p>
            ) : (
              core.conditions.map((condition) => (
                <p key={condition.id} style={{ margin: "10px 0" }}>
                  {condition.display}
                  <span className="muted"> · {condition.clinicalStatus}</span>
                  <span className="provenance">
                    {condition.codeSystemLabel} {condition.codeSystemVersion} · {condition.code}
                  </span>
                </p>
              ))
            )}
            {problems && problems.length > 0 ? (
              <form className="form-grid" action="/api/conditions" method="post">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label className="field">
                  Problem from the ICD-10-CM {problems[0]?.codeSystemVersion} pin
                  <select name="code" defaultValue={problems[0]?.code}>
                    {problems.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.display} · {item.code}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">The display is copied from the pin. This does not diagnose.</p>
                <button className="btn-line" type="submit">Add to the problem list</button>
              </form>
            ) : null}
          </section>
          <section className="card">
            <p className="eyebrow">Medications</p>
            <p className="muted">This list is read from the foundation service.</p>
            {core === null ? (
              <p>The foundation service is not running.</p>
            ) : core.medications.length === 0 ? (
              <p>None recorded.</p>
            ) : (
              core.medications.map((medication) => (
                <p key={medication.id} style={{ margin: "10px 0" }}>
                  {medication.display}
                  <span className="muted"> · {medication.dose}</span>
                </p>
              ))
            )}
          </section>
          <section className="card">
            <p className="eyebrow">Latest results</p>
            <p className="muted">This list is read from the foundation service.</p>
            {sourceResults === null ? (
              <p>The foundation service is not running.</p>
            ) : latest.size === 0 ? (
              <p>None recorded.</p>
            ) : (
              [...latest.values()].map((observation) => (
                <p key={observation.id} style={{ margin: "10px 0" }}>
                  {observation.display} · {formatQuantity(observation.value)} {observation.unit}{" "}
                  <span className={`flag ${observation.interpretation}`}>{observation.interpretation}</span>
                  <span className="provenance">
                    {observation.codeSystemLabel} {observation.codeSystemVersion} · {observation.code} · UCUM{" "}
                    {observation.unitSystemVersion} · {observation.bindingVersion}
                  </span>
                </p>
              ))
            )}
          </section>
        </aside>
        <div className="board">
          <section className="card">
            <p className="eyebrow">Patient state</p>
            <p className="muted" style={{ marginTop: 8 }}>
              A derived copy of the source rows. It does not replace the chart and it does not calculate risk.
            </p>
            {state.built && state.state ? (
              <>
                <p className="provenance">
                  Version {state.version} · built {formatWhen(state.builtAt ?? "")}
                  {state.stale ? " · source rows changed after this build" : " · matches the source rows"}
                </p>
                {state.state.conflicts.map((item) => (
                  <p className="allergy" key={`${item.kind}-${item.code}`}>
                    {item.text}
                  </p>
                ))}
                <p>
                  <strong>Active problems. </strong>
                  {state.state.problems.map((item) => item.text).join(" · ") || "None recorded."}
                </p>
                <p>
                  <strong>Active medications. </strong>
                  {state.state.medications.map((item) => item.text).join(" · ") || "None recorded."}
                </p>
                <p>
                  <strong>Allergies. </strong>
                  {state.state.allergies.map((item) => item.text).join(" · ") || "None recorded."}
                </p>
                <p>
                  <strong>Latest results. </strong>
                  {state.state.recentResults.map((item) => item.text.replace("Latest stored result · ", "")).join(" · ") || "None recorded."}
                </p>
                <p>
                  <strong>Open items. </strong>
                  {state.state.careGaps.map((item) => item.text).join(" ") || "None from the current rules."}
                </p>
                <p>
                  <strong>Pending. </strong>
                  {state.state.pending.map((item) => item.text).join(" · ") || "None recorded."}
                </p>
                <p>{state.state.riskSignals[0].text}</p>
              </>
            ) : (
              <p>Not built yet. The chart remains the source record.</p>
            )}
            <form action="/api/patient-state" method="post">
              <input type="hidden" name="patientId" value={chart.patient.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <button className="btn-line" type="submit">
                Rebuild from source rows
              </button>
            </form>
          </section>
          <section className="card">
            <p className="eyebrow">Evidence</p>
            <p className="muted" style={{ marginTop: 8 }}>
              Each derived line cites a source row. A changed source leaves the old line invalidated.
            </p>
            {evidence.claims.length === 0 ? (
              <p>No claims are filed. Rebuild the patient state to cite each derived line.</p>
            ) : (
              <ul className="briefing">
                {evidence.claims.map((claim) => (
                  <li key={claim.id}>
                    <span className={`evidence-state ${claim.evidenceState}`}>{claim.evidenceState}</span>
                    <p>{claim.text}</p>
                    {claim.citations.map((citation) => (
                      <a key={`${citation.sourceTable}-${citation.sourceId}`} href={`#source-${citation.sourceId}`}>
                        {citation.label}
                      </a>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {copilot ? (
            <section className="card">
              <p className="eyebrow">Copilot</p>
              <p className="muted" style={{ marginTop: 8 }}>
                Grounding threshold {copilot.threshold}. A summary is shown only when every stored claim is supported. The lines below are those claims. This does not diagnose, recommend treatment, or call a model.
              </p>
              {copilot.released ? (
                <div className="stack">
                  <CopilotGroup patientId={chart.patient.id} title="Summary" lines={copilot.summary} />
                  <CopilotGroup patientId={chart.patient.id} title="What changed" lines={copilot.changed} />
                  <CopilotGroup patientId={chart.patient.id} title="Abnormal" lines={copilot.abnormal} />
                  <CopilotGroup patientId={chart.patient.id} title="Open items" lines={copilot.openItems} />
                </div>
              ) : (
                <p>Grounding score {copilot.groundingScore.toFixed(2)} is below the threshold. Nothing was summarized.</p>
              )}
              {copilot.flagged.length > 0 ? (
                <div>
                  <p className="eyebrow">Flagged</p>
                  <ul className="briefing">
                    {copilot.flagged.map((item) => (
                      <li key={item.claimId}>
                        <span className={`evidence-state ${item.evidenceState}`}>{item.reason}</span>
                        <p>This claim is withheld from the summary.</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <form className="form-grid" action="/api/copilot/ask" method="post">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label className="field">
                  Question about this record
                  <textarea name="question" required minLength={1} maxLength={500} rows={3} />
                </label>
                <button className="btn-dark" type="submit">
                  Ask from the evidence
                </button>
              </form>
              {query.turn && !answer ? <p>That answer is not on this record.</p> : null}
              {answer?.outcome === "blocked" ? <p>Nothing was answered. The question is not fully grounded.</p> : null}
              {answer?.outcome === "grounded" ? <CopilotGroup patientId={chart.patient.id} title="Answer" lines={answer.lines} /> : null}
            </section>
          ) : null}
          <section className="card">
            <p className="eyebrow">Add a source result</p>
            <p className="muted">
              Choices are this facility&apos;s catalog, pinned to LOINC {TERMINOLOGY.loincVersion}. The display and unit are copied
              from that pin. The threshold is a local binding, not a model output.
            </p>
            <form className="form-grid" action="/api/observations" method="post">
              <input type="hidden" name="patientId" value={chart.patient.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="field">
                Observation
                <select name="code" defaultValue={catalog[0]?.code}>
                  {catalog.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.display} ({item.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Value
                <input name="value" type="number" step="any" required />
              </label>
              <button className="btn-dark" type="submit">
                Add to the record
              </button>
            </form>
          </section>
          <section className="card">
            <p className="eyebrow">Lab</p>
            <p className="muted">
              The order is stored in the foundation service, then copied to this record. The display is copied from the facility catalog. A specimen is stored the same way. The result is stored against that specimen, then copied here. A critical result also stores an alert. Acknowledgement of that alert is stored in the foundation service, then copied here. The reference range is copied from the catalog pin. Critical flags use rule lab-critical-2026.10. A model cannot clear them. An order does not diagnose.
            </p>
            {canRegisterPatient(ctx) ? (
              <form className="form-grid" action="/api/lab/order" method="post">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label className="field">
                  Order
                  <select name="code" defaultValue={catalog[0]?.code}>
                    {catalog.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.display} ({item.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn-dark" type="submit">
                  Place order
                </button>
              </form>
            ) : (
              <p>This role can collect and result an order. It cannot place one.</p>
            )}
            {lab?.trends.map((trend) => (
              <div key={trend.code}>
                <p>{trend.text}</p>
                <p className="muted">Model explanation is not stored.</p>
                <form action="/api/lab/explain" method="post">
                  <input type="hidden" name="patientId" value={chart.patient.id} />
                  <input type="hidden" name="code" value={trend.code} />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <button className="btn-line" type="submit">
                    Ask the gateway
                  </button>
                </form>
              </div>
            ))}
            {lab?.orders.map((order) => (
              <article key={order.id}>
                <p>
                  {order.display} · {order.code} · {order.status}
                  {order.result && order.result.criticalFlag !== "none" ? (
                    <span className="flag high"> {order.result.criticalFlag}</span>
                  ) : null}
                </p>
                {order.result ? (
                  <>
                    <p>
                      {formatQuantity(order.result.value)} {order.result.unit}
                      {order.result.referenceLow !== null || order.result.referenceHigh !== null
                        ? ` · reference ${order.result.referenceLow ?? "—"}–${order.result.referenceHigh ?? "—"} ${order.result.unit}`
                        : ""}
                    </p>
                    <p className="provenance">
                      LOINC {order.result.codeSystemVersion} · UCUM {order.result.unitSystemVersion} · {order.result.bindingVersion}
                      {order.result.ruleVersion ? ` · ${order.result.ruleVersion}` : ""}
                    </p>
                    {order.result.alertStatus === "open" ? (
                      <form action="/api/lab/acknowledge" method="post">
                        <input type="hidden" name="patientId" value={chart.patient.id} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="resultId" value={order.result.id} />
                        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                        <button className="btn-line" type="submit">
                          Acknowledge alert
                        </button>
                      </form>
                    ) : null}
                    {order.result.alertStatus === "acknowledged" ? <p className="muted">Alert acknowledged. The critical flag remains.</p> : null}
                  </>
                ) : null}
                {order.status === "requested" ? (
                  <form action="/api/lab/specimen" method="post">
                    <input type="hidden" name="patientId" value={chart.patient.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                    <button className="btn-line" type="submit">
                      Collect specimen
                    </button>
                  </form>
                ) : null}
                {order.status === "collected" ? (
                  <form className="form-grid" action="/api/lab/result" method="post">
                    <input type="hidden" name="patientId" value={chart.patient.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                    <label className="field">
                      Result
                      <input name="value" type="number" step="any" required />
                    </label>
                    <button className="btn-dark" type="submit">
                      Record result
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </section>
          <section className="card">
            <p className="eyebrow">Prescriptions</p>
            <p className="muted">
              The proposal is stored in the foundation service, then copied here. Recording it stores the medication in the foundation service and marks that order active there. A dispense is stored in the foundation service, then copied here. An administration is stored in the foundation service, then copied here. Nothing was billed. Allergy, interaction, duplicate-therapy, and formulary checks use pin med-safety-2026.10. A high-risk warning stays open until someone acknowledges it. The acknowledgement is stored in the foundation service, then copied here. Its severity is unchanged. A model cannot clear it. The proposal does not diagnose.
            </p>
            {canRegisterPatient(ctx) ? (
              <form className="form-grid" action="/api/rx/prescribe" method="post">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label className="field">
                  Formulary
                  <select name="formularyId" defaultValue={rx?.formulary[0]?.id}>
                    {rx?.formulary.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.display} · {item.therapyClass} · {item.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Dose as recorded
                  <input name="dose" required maxLength={80} />
                </label>
                <button className="btn-dark" type="submit">
                  Propose prescription
                </button>
              </form>
            ) : (
              <p>This role can dispense and record an administration. It cannot propose a prescription.</p>
            )}
            {rx?.orders.map((order) => {
              const openHigh = order.warnings.some((warning) => warning.severity === "high" && warning.status === "open");
              return (
                <article key={order.id}>
                  <p>
                    {order.display} · {order.dose} · {order.status}
                  </p>
                  {order.warnings.map((warning) => (
                    <div key={warning.id}>
                      <p>
                        <span className={warning.severity === "high" ? "flag high" : "muted"}>{warning.severity}</span> {warning.kind} · {warning.status}
                      </p>
                      <p>{warning.summary}</p>
                      <p className="provenance">
                        {warning.source} · {warning.ruleId} · {warning.ruleVersion}
                      </p>
                      {warning.status === "open" && warning.severity === "high" ? (
                        <form action="/api/rx/acknowledge" method="post">
                          <input type="hidden" name="patientId" value={chart.patient.id} />
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="warningId" value={warning.id} />
                          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                          <button className="btn-line" type="submit">
                            Acknowledge warning
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                  <p>{order.adherence.text}</p>
                  <p className="muted">Model text is not stored.</p>
                  {order.status === "proposed" && canRegisterPatient(ctx) && !openHigh ? (
                    <form action="/api/rx/activate" method="post">
                      <input type="hidden" name="patientId" value={chart.patient.id} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                      <button className="btn-dark" type="submit">
                        Record on the medication list
                      </button>
                    </form>
                  ) : null}
                  {order.status === "active" || order.status === "dispensed" ? (
                    <div className="form-grid">
                      <form action="/api/rx/dispense" method="post">
                        <input type="hidden" name="patientId" value={chart.patient.id} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                        <label className="field">
                          Dispense quantity
                          <input name="quantity" type="number" min={1} max={90} step={1} required />
                        </label>
                        <button className="btn-line" type="submit">
                          Record dispense
                        </button>
                      </form>
                      <form action="/api/rx/administer" method="post">
                        <input type="hidden" name="patientId" value={chart.patient.id} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                        <button className="btn-line" type="submit">
                          Record administration
                        </button>
                      </form>
                    </div>
                  ) : null}
                  <form action="/api/rx/explain" method="post">
                    <input type="hidden" name="patientId" value={chart.patient.id} />
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                    <button className="btn-text" type="submit">
                      Ask the gateway
                    </button>
                  </form>
                </article>
              );
            })}
          </section>
          <section className="card wide">
            <p className="eyebrow">Coordination</p>
            <p className="muted">
              Templates are stored in English and Spanish. A message is copied from the patient&apos;s locale only after consent, and only into this record. A failed send opens an escalation task. A model cannot rewrite the template.
            </p>
            <form className="form-grid" action="/api/care/preference" method="post">
              <input type="hidden" name="patientId" value={chart.patient.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="field">
                Locale
                <select name="locale" defaultValue={care?.preference?.locale ?? "en"}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
              <label className="field">
                Channel
                <select name="channel" defaultValue={care?.preference?.channel ?? "none"}>
                  <option value="portal">Facility record</option>
                  <option value="none">No outreach</option>
                </select>
              </label>
              <label className="field">
                Consent
                <select name="consent" defaultValue={care?.preference?.consent ?? "withheld"}>
                  <option value="withheld">Withheld</option>
                  <option value="granted">Granted</option>
                </select>
              </label>
              <button className="btn-line" type="submit">
                Store preference
              </button>
            </form>
            <form className="form-grid" action="/api/care/message" method="post">
              <input type="hidden" name="patientId" value={chart.patient.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="field">
                Template
                <select name="templateId" defaultValue={care?.templates[0]?.id}>
                  {care?.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.id} · {template.locales.join(", ")}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-dark" type="submit">
                Store template
              </button>
            </form>
            {care?.messages.map((message) => (
              <p key={message.id}>
                {message.locale} · {message.version}
                <span className="muted"> · {message.body}</span>
              </p>
            ))}
            {care?.gaps.map((gap) => (
              <form key={gap.sourceId} action="/api/care/gap" method="post">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="sourceId" value={gap.sourceId} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <p>{gap.text}</p>
                <button className="btn-line" type="submit">
                  Open task
                </button>
              </form>
            ))}
            {care?.tasks.map((task) => (
              <article key={task.id}>
                <p>
                  {task.kind} · {task.status}
                  {task.failure ? ` · ${task.failure}` : ""}
                  {task.ownerId ? " · owned" : " · unowned"}
                </p>
                <p>{task.reason}</p>
                {task.status === "open" && !task.ownerId ? (
                  <form action="/api/care/task" method="post">
                    <input type="hidden" name="patientId" value={chart.patient.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="action" value="claim" />
                    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                    <button className="btn-line" type="submit">
                      Claim task
                    </button>
                  </form>
                ) : null}
                {task.status === "open" && task.ownerId === ctx.userId ? (
                  <form action="/api/care/task" method="post">
                    <input type="hidden" name="patientId" value={chart.patient.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="action" value="complete" />
                    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                    <button className="btn-line" type="submit">
                      Complete task
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
            <form className="form-grid" action="/api/care/follow-up" method="post">
              <input type="hidden" name="patientId" value={chart.patient.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <label className="field">
                Follow-up date
                <input name="dueOn" type="date" required />
              </label>
              <label className="field">
                Reason
                <input name="reason" required maxLength={200} />
              </label>
              <button className="btn-line" type="submit">
                Add follow-up
              </button>
            </form>
            {canRegisterPatient(ctx) ? (
              <>
                <form className="form-grid" action="/api/care/referral" method="post">
                  <input type="hidden" name="patientId" value={chart.patient.id} />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <label className="field">
                    Facility in this organization
                    <select name="toFacilityId" defaultValue={care?.targets[0]?.id}>
                      {care?.targets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Reason
                    <input name="reason" required maxLength={200} />
                  </label>
                  <button className="btn-line" type="submit">
                    Request referral
                  </button>
                </form>
                <form className="form-grid" action="/api/care/plan" method="post">
                  <input type="hidden" name="patientId" value={chart.patient.id} />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <label className="field">
                    Goal as recorded
                    <textarea name="goal" required maxLength={400} rows={3} />
                  </label>
                  <button className="btn-dark" type="submit">
                    Store draft plan
                  </button>
                </form>
              </>
            ) : null}
            {care?.plans.map((plan) => (
              <article key={plan.id}>
                <p>
                  {plan.status} · {plan.goal}
                </p>
                {plan.status === "draft" && canRegisterPatient(ctx) ? (
                  <form action="/api/care/plan/activate" method="post">
                    <input type="hidden" name="patientId" value={chart.patient.id} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                    <button className="btn-line" type="submit">
                      Mark plan active
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
            {care?.referrals.map((referral) => (
              <p key={referral.id}>
                {referral.toFacilityId} · {referral.status} · {referral.reason}
              </p>
            ))}
            <form action="/api/care/explain" method="post">
              <input type="hidden" name="patientId" value={chart.patient.id} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <button className="btn-text" type="submit">
                Ask the gateway
              </button>
            </form>
          </section>
          {desk ? (
            <section className="card wide">
              <p className="eyebrow">Patient record</p>
              <p className="muted">Questions, messages, and visit requests the patient stored. This is not the chart, and it does not diagnose.</p>
              {desk.questions.length === 0 ? <p>No questions stored.</p> : desk.questions.map((item) => (
                <article key={item.id}>
                  <p>{item.text}</p>
                  {item.instruction ? <p>{item.instruction}</p> : <p className="muted">Stored. Nothing was answered.</p>}
                </article>
              ))}
              {desk.messages.length === 0 ? <p>No messages stored.</p> : desk.messages.map((item) => (
                <article key={item.id}>
                  <p className="muted">{item.author === "patient" ? "Patient" : "Facility"}</p>
                  <p>{item.body}</p>
                </article>
              ))}
              <form action="/api/portal/reply" method="post" className="form-grid">
                <input type="hidden" name="patientId" value={chart.patient.id} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <label className="field">
                  Reply
                  <input name="body" type="text" required minLength={1} maxLength={500} />
                </label>
                <button className="btn-line" type="submit">Store reply</button>
              </form>
              {desk.requests.map((item) => (
                <article key={item.id}>
                  <p>{item.reason}</p>
                  <p className="muted">{item.status}</p>
                  {item.status === "requested" && canRegisterPatient(ctx) ? (
                    <form action="/api/portal/request/decision" method="post" className="form-grid">
                      <input type="hidden" name="patientId" value={chart.patient.id} />
                      <input type="hidden" name="requestId" value={item.id} />
                      <input type="hidden" name="decision" value="accepted" />
                      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                      <label className="field">
                        Starts
                        <input name="startsAt" type="datetime-local" required />
                      </label>
                      <label className="field">
                        Ends
                        <input name="endsAt" type="datetime-local" required />
                      </label>
                      <button className="btn-line" type="submit">Book visit</button>
                    </form>
                  ) : null}
                </article>
              ))}
              {desk.coverage ? <p>Coverage {desk.coverage.payerName} · {desk.coverage.memberId}. Nothing was billed.</p> : null}
              {desk.payments.map((item) => (
                <p key={item.id}>{item.description} · {(item.amountCents / 100).toFixed(2)} · {item.status}. Nothing was charged.</p>
              ))}
            </section>
          ) : null}
          <section className="card wide">
            <p className="eyebrow">Documentation</p>
            <p className="muted">
              Audio retention {documentation?.audioRetentionHours ?? 0} hours. Speech-to-text is not available, so audio is not transcribed and a draft is never signed.
            </p>
            {documentation?.encounterId ? (
              <>
                <p>{documentation.consentGranted ? "Consent is recorded for the open encounter." : "Consent is not recorded for the open encounter."}</p>
                <form action="/api/documentation/consent" method="post">
                  <input type="hidden" name="patientId" value={chart.patient.id} />
                  <input type="hidden" name="encounterId" value={documentation.encounterId} />
                  <input type="hidden" name="granted" value="1" />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <button className="btn-line" type="submit">
                    Record consent
                  </button>
                </form>
                <form className="form-grid" action="/api/documentation/text" method="post">
                  <input type="hidden" name="patientId" value={chart.patient.id} />
                  <input type="hidden" name="encounterId" value={documentation.encounterId} />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <label className="field">
                    Clinician text
                    <textarea name="text" required minLength={1} maxLength={4000} rows={4} />
                  </label>
                  <button className="btn-dark" type="submit">
                    Store draft
                  </button>
                </form>
                <form action="/api/documentation/audio" method="post" encType="multipart/form-data">
                  <input type="hidden" name="patientId" value={chart.patient.id} />
                  <input type="hidden" name="encounterId" value={documentation.encounterId} />
                  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                  <label className="field">
                    Audio
                    <input name="audio" type="file" accept="audio/*,.bin" required />
                  </label>
                  <button className="btn-line" type="submit">
                    Offer audio
                  </button>
                </form>
              </>
            ) : (
              <p>Open an encounter before capturing a draft.</p>
            )}
            {documentation?.drafts.map((draft) => (
              <article key={draft.id}>
                <p>
                  <span className={`note-state ${draft.status}`}>{draft.status}</span>
                  <span className="note-auth"> Not signed</span>
                </p>
                {draft.sections.map((section) => (
                  <div key={section.id}>
                    <p>{section.text}</p>
                    <p className="note-auth">{section.authorship === "clinician-authored" ? "Clinician-authored" : "Source quote"}</p>
                    {section.authorship === "clinician-authored" && section.text !== section.sourceQuote ? (
                      <p className="provenance">Source quote · {section.sourceQuote}</p>
                    ) : null}
                  </div>
                ))}
                {draft.status === "draft" ? (
                  <div className="form-grid">
                    <form action="/api/documentation/draft" method="post">
                      <input type="hidden" name="patientId" value={chart.patient.id} />
                      <input type="hidden" name="draftId" value={draft.id} />
                      <input type="hidden" name="decision" value="accepted" />
                      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                      <button className="btn-dark" type="submit">
                        Accept draft
                      </button>
                    </form>
                    <form action="/api/documentation/draft" method="post">
                      <input type="hidden" name="patientId" value={chart.patient.id} />
                      <input type="hidden" name="draftId" value={draft.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                      <button className="btn-text" type="submit">
                        Reject draft
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </div>
        <p className="muted">Retention class {chart.patient.retentionClass}. Jurisdiction policy is not automated in this slice.</p>
      </div>
    </Shell>
  );
}

function CopilotGroup({
  patientId,
  title,
  lines,
}: {
  patientId: string;
  title: string;
  lines: { claimId: string; text: string; citations: { sourceTable: string; sourceId: string; label: string }[] }[];
}) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="briefing">
        {lines.map((line) => (
          <li key={`${title}-${line.claimId}`}>
            <p>{line.text}</p>
            {line.citations.map((citation) => (
              <a key={`${citation.sourceTable}-${citation.sourceId}`} href={`#source-${citation.sourceId}`}>
                {citation.label}
              </a>
            ))}
            <form action="/api/copilot/feedback" method="post" className="form-grid">
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="claimId" value={line.claimId} />
              <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
              <button className="btn-line" type="submit" name="rating" value="helpful">
                Helpful
              </button>
              <button className="btn-text" type="submit" name="rating" value="not-grounded">
                Not grounded
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
