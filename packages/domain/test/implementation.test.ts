import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHART_AGENT,
  FHIR_VERSION,
  FIXTURES,
  ForbiddenError,
  GATEWAY_MODEL,
  GATEWAY_PROMPT,
  GROUNDING_THRESHOLD,
  NotFoundError,
  ValidationError,
  askCopilot,
  askPatient,
  assertPatientTool,
  callAgentTool,
  captureDocumentationAudio,
  captureDocumentationText,
  createDatabase,
  createPatient,
  decideDocumentationDraft,
  fhirCapability,
  filterTimeline,
  getChart,
  healthcheck,
  invokeGateway,
  listAudit,
  openSession,
  openPatientSession,
  readCopilot,
  readDocumentation,
  readEvidence,
  readFhirResource,
  readFacility,
  readPatientState,
  readPatientSession,
  readPortal,
  readSession,
  rebuildPatientState,
  rebuildFacility,
  readOperations,
  rebuildOperations,
  overrideOperations,
  recordInventory,
  ingestAnalytics,
  exportAnalytics,
  readAnalytics,
  buildPopulation,
  readPopulation,
  openResearchWorkspace,
  snapshotResearchDataset,
  requestResearchExport,
  decideResearchExport,
  readResearch,
  recordImagingStudy,
  releaseImagingStudy,
  readImaging,
  IMAGING_VIEWER_NOTE,
  registerDevice,
  recordDeviceReading,
  readDevices,
  DEVICE_CONNECTIVITY_NOTE,
  readRevenue,
  recordInvoice,
  REVENUE_INVOICE_NOTE,
  registerEvalDataset,
  runEvaluation,
  readEvaluation,
  EVAL_MODEL_CARD,
  readEnterprise,
  recordRegionDrill,
  recordResidency,
  moveTenant,
  ENTERPRISE_RTO_NOTE,
  readMarketplace,
  registerListing,
  reviewListing,
  releaseListing,
  MARKETPLACE_COMPAT_NOTE,
  readReleaseTrain,
  recordStrategy,
  recordDossier,
  recordValidation,
  recordReleaseAttempt,
  RELEASE_ATTEMPT_NOTE,
  readModules,
  recordModule,
  recordModuleValidation,
  approvePlatform,
  MODULE_CODES,
  moduleIntendedUse,
  recordDocumentationConsent,
  recordObservation,
  recordLabResult,
  rejectUncitedClaim,
  seed,
  signDocumentation,
  startAgentRun,
  collectLabSpecimen,
  explainLabTrend,
  holdCriticalFlag,
  placeLabOrder,
  readLab,
  prescribeMedication,
  readRx,
  explainRx,
  holdSafetyWarnings,
  acknowledgeRxWarning,
  activateRxOrder,
  sendOutreach,
  setOutreachPreference,
  readCoordination,
  ConflictError,
} from "../src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

function present(relative: string) {
  assert.equal(existsSync(path.join(root, relative)), true, `missing ${relative}`);
}

const phases: { name: string; check: () => void }[] = [
  {
    name: "phase 00 constitution",
    check() {
      present("docs/qms/intended-use-register.md");
      present("docs/qms/risk-register.md");
      present("docs/qms/definition-of-done.md");
      const intended = readFileSync(path.join(root, "docs/qms/intended-use-register.md"), "utf8");
      assert.match(intended, /Not for real patients|not legal or medical|Do not deploy/i);
    },
  },
  {
    name: "phase 01 repository",
    check() {
      const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { workspaces: string[]; scripts: { test: string } };
      assert.deepEqual(pkg.workspaces, ["apps/web", "packages/*"]);
      assert.equal(pkg.workspaces.includes("apps/mobile"), false);
      present("apps/web/package.json");
      present("apps/mobile/package.json");
      present("packages/domain/package.json");
      present("packages/contracts/package.json");
      const { db } = signIn(FIXTURES.amira);
      assert.equal(healthcheck(db).schemaVersion, 30);
    },
  },
  {
    name: "phase 02 identity and tenancy",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      assert.equal(ctx.organizationId, "org_harborlight");
      assert.equal(ctx.facilityId, "fac_riverside");
      assert.equal(ctx.purposeOfUse, "TREATMENT");
      assert.equal(getChart(db, ctx, FIXTURES.samir), null);
      const evan = session(db, FIXTURES.evan);
      assert.equal(getChart(db, evan, FIXTURES.elena), null);
      const previous = process.env.CURASPHERE_ENV;
      process.env.CURASPHERE_DEV_DIRECTORY = "local-test";
      process.env.CURASPHERE_ENV = "staging";
      try {
        assert.throws(() => openSession(db, FIXTURES.amira), (error: unknown) => error instanceof ForbiddenError);
        process.env.CURASPHERE_ENV = "production";
        assert.throws(() => openSession(db, FIXTURES.amira), (error: unknown) => error instanceof ForbiddenError);
      } finally {
        if (previous === undefined) delete process.env.CURASPHERE_ENV;
        else process.env.CURASPHERE_ENV = previous;
      }
      present("apps/web/app/api/session/route.ts");
    },
  },
  {
    name: "phase 03 audit",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      assert.ok(getChart(db, ctx, FIXTURES.elena));
      assert.throws(() => listAudit(db, ctx), (error: unknown) => error instanceof ForbiddenError);
      const priya = session(db, FIXTURES.priya);
      const audit = listAudit(db, priya);
      assert.ok(audit.some((entry) => entry.action === "patient.read" && entry.resourceId === FIXTURES.elena));
      assert.throws(() => getChart(db, priya, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
      present("apps/web/app/audit/page.tsx");
    },
  },
  {
    name: "phase 04 chart writes",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const created = createPatient(db, ctx, {
        givenName: "Nora",
        familyName: "Keita",
        birthDate: "1984-04-02",
        sex: "female",
        idempotencyKey: "phase04-reg-0001",
      });
      const replay = createPatient(db, ctx, {
        givenName: "Nora",
        familyName: "Keita",
        birthDate: "1984-04-02",
        sex: "female",
        idempotencyKey: "phase04-reg-0001",
      });
      assert.equal(replay.id, created.id);
      const jordan = session(db, FIXTURES.jordan);
      assert.throws(
        () =>
          createPatient(db, jordan, {
            givenName: "Nora",
            familyName: "Keita",
            birthDate: "1984-04-02",
            sex: "female",
            idempotencyKey: "phase04-reg-0002",
          }),
        (error: unknown) => error instanceof ForbiddenError,
      );
      const recorded = recordObservation(db, jordan, { patientId: FIXTURES.elena, code: "8867-4", value: 72, idempotencyKey: "phase04-hr-0001" });
      const again = recordObservation(db, jordan, { patientId: FIXTURES.elena, code: "8867-4", value: 72, idempotencyKey: "phase04-hr-0001" });
      assert.equal(again.id, recorded.id);
      present("apps/web/app/api/observations/route.ts");
    },
  },
  {
    name: "phase 05 terminology",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      assert.throws(
        () => recordObservation(db, ctx, { patientId: FIXTURES.elena, code: "not-a-code", value: 1, idempotencyKey: "phase05-code-01" }),
        (error: unknown) => error instanceof ValidationError,
      );
      recordObservation(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", value: 4.4, idempotencyKey: "phase05-k-0001" });
      const chart = getChart(db, ctx, FIXTURES.elena);
      const row = chart?.observations.find((item) => item.value === 4.4 && item.code === "2823-3");
      assert.equal(row?.codeSystemVersion, "2.78");
      assert.equal(row?.unit, "mmol/L");
      const lakeside = signIn(FIXTURES.evan);
      assert.throws(
        () => recordObservation(lakeside.db, lakeside.ctx, { patientId: FIXTURES.samir, code: "30934-4", value: 50, idempotencyKey: "phase05-bnp-01" }),
        (error: unknown) => error instanceof ValidationError,
      );
    },
  },
  {
    name: "phase 06 FHIR R4",
    check() {
      const statement = fhirCapability();
      assert.equal(statement.fhirVersion, FHIR_VERSION);
      assert.equal(FHIR_VERSION, "4.0.1");
      const { db, ctx } = signIn(FIXTURES.amira);
      const patient = readFhirResource(db, ctx, "Patient", FIXTURES.elena);
      assert.equal(patient?.resourceType, "Patient");
      const evan = session(db, FIXTURES.evan);
      assert.equal(readFhirResource(db, evan, "Patient", FIXTURES.elena), null);
      present("apps/web/app/api/fhir/r4/metadata/route.ts");
    },
  },
  {
    name: "phase 07 timeline",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const chart = getChart(db, ctx, FIXTURES.elena);
      if (!chart) throw new Error("chart missing");
      const results = filterTimeline(chart.timeline, "results");
      assert.ok(results.length > 0);
      assert.ok(results.every((item) => item.sourceTable === "observations"));
      assert.ok(chart.briefing.items.every((item) => item.sourceId.length > 0));
      const evan = session(db, FIXTURES.evan);
      assert.equal(getChart(db, evan, FIXTURES.elena), null);
      present("apps/web/app/api/patients/[id]/timeline/route.ts");
    },
  },
  {
    name: "phase 08 patient state",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const built = rebuildPatientState(db, ctx, FIXTURES.elena, "phase08-state-01");
      const again = rebuildPatientState(db, ctx, FIXTURES.elena, "phase08-state-02");
      assert.equal(again.version, built.version);
      const state = readPatientState(db, ctx, FIXTURES.elena);
      assert.equal(state?.state?.riskSignals[0]?.status, "unfilled");
      assert.equal(JSON.stringify(state?.state?.riskSignals ?? []).includes("\"value\""), false);
      assert.equal(readPatientState(db, session(db, FIXTURES.evan), FIXTURES.elena), null);
      present("apps/web/app/api/patient-state/route.ts");
    },
  },
  {
    name: "phase 09 evidence",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      rebuildPatientState(db, ctx, FIXTURES.elena, "phase09-evidence-01");
      const evidence = readEvidence(db, ctx, FIXTURES.elena);
      assert.ok((evidence?.claims.length ?? 0) > 0);
      assert.ok(evidence?.claims.every((claim) => claim.citations.length > 0));
      assert.throws(() => rejectUncitedClaim([]), ValidationError);
      assert.equal(readEvidence(db, session(db, FIXTURES.evan), FIXTURES.elena), null);
      present("apps/web/app/api/patients/[id]/evidence/route.ts");
    },
  },
  {
    name: "phase 10 model gateway",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      let called = 0;
      const result = invokeGateway(
        db,
        ctx,
        { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Review the record", idempotencyKey: "phase10-gw-0001" },
        { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => ((called += 1), { citations: ["x"] }) },
      );
      assert.equal(called, 0);
      assert.equal(result.outcome, "refused");
      assert.equal(result.modelId, GATEWAY_MODEL.id);
      assert.equal(result.modelVersion, "0");
      assert.equal(result.output, null);
      const replay = invokeGateway(db, ctx, {
        promptId: GATEWAY_PROMPT.id,
        promptVersion: GATEWAY_PROMPT.version,
        text: "Review the record",
        idempotencyKey: "phase10-gw-0001",
      });
      assert.equal(replay.traceId, result.traceId);
      present("apps/web/app/api/gateway/invoke/route.ts");
    },
  },
  {
    name: "phase 11 agent runtime",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const run = startAgentRun(db, ctx, {
        agentId: CHART_AGENT.id,
        agentVersion: CHART_AGENT.version,
        patientId: FIXTURES.elena,
        idempotencyKey: "phase11-run-0001",
      });
      const replay = startAgentRun(db, ctx, {
        agentId: CHART_AGENT.id,
        agentVersion: CHART_AGENT.version,
        patientId: FIXTURES.elena,
        idempotencyKey: "phase11-run-0001",
      });
      assert.equal(replay.runId, run.runId);
      assert.equal(run.status, "awaiting-approval");
      const before = (db.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number }).c;
      assert.throws(
        () => callAgentTool(db, ctx, { runId: run.runId, toolId: "tool_note_write", payload: {}, idempotencyKey: "phase11-tool-01" }),
        (error: unknown) => error instanceof ForbiddenError,
      );
      assert.equal((db.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number }).c, before);
      assert.throws(
        () => startAgentRun(db, session(db, FIXTURES.evan), { agentId: CHART_AGENT.id, agentVersion: CHART_AGENT.version, patientId: FIXTURES.elena, idempotencyKey: "phase11-run-0002" }),
        (error: unknown) => error instanceof NotFoundError,
      );
      present("apps/web/app/api/agents/run/route.ts");
    },
  },
  {
    name: "phase 12 clinical copilot",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      assert.equal(GROUNDING_THRESHOLD, 1);
      rebuildPatientState(db, ctx, FIXTURES.elena, "phase12-copilot-01");
      const view = readCopilot(db, ctx, FIXTURES.elena);
      assert.equal(view?.released, true);
      assert.equal(view?.groundingScore, 1);
      const before = (db.prepare("SELECT COUNT(*) AS c FROM gateway_attempts").get() as { c: number }).c;
      const blocked = askCopilot(db, ctx, { patientId: FIXTURES.elena, question: "should start insulin", idempotencyKey: "phase12-ask-0001" });
      assert.equal(blocked.outcome, "blocked");
      assert.equal(blocked.lines.length, 0);
      assert.equal((db.prepare("SELECT COUNT(*) AS c FROM gateway_attempts").get() as { c: number }).c, before);
      assert.equal(readCopilot(db, session(db, FIXTURES.evan), FIXTURES.elena), null);
      present("apps/web/app/api/copilot/ask/route.ts");
    },
  },
  {
    name: "phase 13 documentation",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      recordDocumentationConsent(db, ctx, {
        encounterId: FIXTURES.encounterMateo,
        patientId: FIXTURES.mateo,
        granted: true,
        idempotencyKey: "phase13-consent-1",
      });
      const draft = captureDocumentationText(db, ctx, {
        encounterId: FIXTURES.encounterMateo,
        patientId: FIXTURES.mateo,
        text: "Wheeze since yesterday.",
        idempotencyKey: "phase13-text-0001",
      });
      assert.equal(draft.status, "draft");
      assert.equal(draft.signed, false);
      assert.throws(() => signDocumentation(), (error: unknown) => error instanceof ValidationError);
      const audio = captureDocumentationAudio(db, ctx, {
        encounterId: FIXTURES.encounterMateo,
        patientId: FIXTURES.mateo,
        audio: new Uint8Array([9, 8, 7, 6]),
        idempotencyKey: "phase13-audio-01",
      });
      assert.equal(audio.transcript, null);
      assert.equal(audio.retained, false);
      const accepted = decideDocumentationDraft(db, ctx, { draftId: draft.draftId, decision: "accepted", idempotencyKey: "phase13-accept-1" });
      assert.equal(accepted.signed, false);
      assert.equal(readDocumentation(db, ctx, FIXTURES.mateo)?.drafts[0]?.status, "accepted");
      present("apps/web/app/api/documentation/text/route.ts");
    },
  },
  {
    name: "phase 14 curalab",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const order = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "phase14-order-01" });
      collectLabSpecimen(db, ctx, { orderId: order.orderId, idempotencyKey: "phase14-spec-001" });
      const result = recordLabResult(db, ctx, { orderId: order.orderId, value: 6.2, idempotencyKey: "phase14-result-1" });
      assert.equal(result.criticalFlag, "critical-high");
      const calls = { n: 0 };
      const explained = explainLabTrend(
        db,
        ctx,
        { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "phase14-explain1" },
        { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "not critical" }; } },
      );
      assert.equal(calls.n, 0);
      assert.equal(explained.aiText, null);
      assert.equal(explained.aiOutcome, "refused");
      assert.equal(holdCriticalFlag(explained.criticalFlag, { suppressCritical: true }), "critical-high");
      assert.equal(readLab(db, ctx, FIXTURES.elena)?.orders[0]?.result?.criticalFlag, "critical-high");
      assert.equal(readLab(db, session(db, FIXTURES.evan), FIXTURES.elena), null);
      present("apps/web/app/api/lab/result/route.ts");
    },
  },
  {
    name: "phase 15 curarx",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const before = (db.prepare("SELECT COUNT(*) AS c FROM medications").get() as { c: number }).c;
      const order = prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_amoxicillin", dose: "500 mg", idempotencyKey: "phase15-rx-00001" });
      assert.throws(
        () => activateRxOrder(db, ctx, { orderId: order.orderId, idempotencyKey: "phase15-act-0001" }),
        (error: unknown) => error instanceof ConflictError,
      );
      const calls = { n: 0 };
      const explained = explainRx(
        db,
        ctx,
        { orderId: order.orderId, idempotencyKey: "phase15-explain1" },
        { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "no allergy" }; } },
      );
      assert.equal(calls.n, 0);
      assert.equal(explained.aiText, null);
      assert.equal(explained.aiOutcome, "refused");
      assert.equal(holdSafetyWarnings(explained.warnings, { clear: true })[0]?.severity, "high");
      const warning = explained.warnings[0];
      if (!warning) throw new Error("warning missing");
      acknowledgeRxWarning(db, ctx, { warningId: warning.id, idempotencyKey: "phase15-ack-0001" });
      activateRxOrder(db, ctx, { orderId: order.orderId, idempotencyKey: "phase15-act-0002" });
      assert.equal((db.prepare("SELECT COUNT(*) AS c FROM medications").get() as { c: number }).c, before + 1);
      assert.equal(readRx(db, session(db, FIXTURES.evan), FIXTURES.elena), null);
      present("apps/web/app/api/rx/prescribe/route.ts");
    },
  },
  {
    name: "phase 16 care coordination",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      setOutreachPreference(db, ctx, { patientId: FIXTURES.elena, locale: "es", channel: "portal", consent: "withheld", idempotencyKey: "phase16-pref-001" });
      const blocked = sendOutreach(db, ctx, { patientId: FIXTURES.elena, templateId: "tpl_followup", idempotencyKey: "phase16-send-001" });
      assert.equal(blocked.outcome, "escalated");
      assert.equal((db.prepare("SELECT COUNT(*) AS c FROM outreach_messages").get() as { c: number }).c, 0);
      const task = readCoordination(db, ctx, FIXTURES.elena)?.tasks.find((item) => item.kind === "escalation");
      assert.equal(task?.failure, "consent");
      assert.equal(readCoordination(db, session(db, FIXTURES.evan), FIXTURES.elena), null);
      present("apps/web/app/api/care/message/route.ts");
    },
  },
  {
    name: "phase 17 patient record",
    check() {
      const db = createDatabase(":memory:");
      seed(db);
      const opened = openPatientSession(db, FIXTURES.elenaPortal);
      const ctx = readPatientSession(db, opened.sessionId);
      if (!ctx) throw new Error("patient session missing");
      assert.equal(readSession(db, opened.sessionId), null);
      assert.throws(() => getChart(db, ctx, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
      assert.throws(() => assertPatientTool("tool_chart_sources"), (error: unknown) => error instanceof ForbiddenError);
      assertPatientTool("own-results");
      const calls = { n: 0 };
      const asked = askPatient(
        db,
        ctx,
        { text: "I have chest pain", idempotencyKey: "phase17-ask-0001" },
        { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "you are fine" }; } },
      );
      assert.equal(calls.n, 0);
      assert.equal(asked.tool, "urgent-triage");
      assert.equal(asked.aiText, null);
      const view = readPortal(db, ctx);
      assert.equal(view.medications.some((item) => item.display === "Furosemide"), true);
      assert.equal(JSON.stringify(view).includes("Albuterol"), false);
      assert.equal(JSON.stringify(view).includes("tool_chart_sources"), false);
      present("apps/web/app/api/portal/ask/route.ts");
    },
  },
  {
    name: "phase 18 facility twin",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const built = rebuildFacility(db, ctx, "phase18-build-01");
      assert.equal(built.stale, false);
      assert.equal(built.state?.signals.find((item) => item.kind === "beds")?.count, 2);
      assert.equal(built.state?.signals.find((item) => item.kind === "capacity")?.text.includes("not a forecast"), true);
      const order = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "phase18-lab-0001" });
      const pending = readFacility(db, ctx);
      assert.equal(pending.stale, true);
      assert.equal(pending.eventsPending, true);
      assert.equal(order.orderId.length > 0, true);
      const evan = readFacility(db, session(db, FIXTURES.evan));
      assert.equal(evan.facilityId, "fac_lakeside");
      assert.equal(JSON.stringify(evan).includes("Bay 1"), false);
      present("apps/web/app/api/facility/rebuild/route.ts");
    },
  },
  {
    name: "phase 19 operations intelligence",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const built = rebuildOperations(db, ctx, "phase19-build-01");
      assert.equal(built.state?.recommendations.length, 5);
      assert.equal(
        built.state?.recommendations.every((item) => item.factors.length > 0 && item.confidence.length > 0),
        true,
      );
      assert.equal(built.state?.recommendations.find((item) => item.kind === "capacity")?.text.includes("not a forecast"), true);
      assert.equal(built.state?.recommendations.find((item) => item.kind === "inventory")?.text.includes("not forecast"), true);
      assert.equal(built.state?.kpi.text.includes("not a revenue or clinical outcome"), true);
      const staffing = built.state?.recommendations.find((item) => item.kind === "staffing")?.text;
      overrideOperations(db, ctx, {
        kind: "staffing",
        reason: "Held. This comparison is not an instruction.",
        idempotencyKey: "phase19-hold-01",
      });
      const held = readOperations(db, ctx);
      assert.equal(held.state?.recommendations.find((item) => item.kind === "staffing")?.text, staffing);
      assert.equal(held.state?.recommendations.find((item) => item.kind === "staffing")?.override?.action, "hold");
      placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "phase19-lab-0001" });
      const pending = readOperations(db, ctx);
      assert.equal(pending.stale, true);
      assert.equal(pending.eventsPending, true);
      const again = rebuildOperations(db, ctx, "phase19-build-02");
      assert.equal(again.state?.kpi.baseline.labBacklog, 0);
      assert.equal(again.state?.kpi.delta.labBacklog, 1);
      recordInventory(db, ctx, { label: "Phase gauze", onHand: 2, idempotencyKey: "phase19-stock-01" });
      const evan = readOperations(db, session(db, FIXTURES.evan));
      assert.equal(JSON.stringify(evan).includes("Phase gauze"), false);
      present("apps/web/app/api/operations/rebuild/route.ts");
    },
  },
  {
    name: "phase 20 analytics lakehouse",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      for (const [index, value] of [120, 122, 124, 126, 128].entries()) {
        recordObservation(db, ctx, { patientId: FIXTURES.elena, code: "8480-6", value, idempotencyKey: `phase20-obs-${index}01` });
      }
      const priya = session(db, FIXTURES.priya);
      assert.throws(() => readAnalytics(db, ctx), (error: unknown) => error instanceof ForbiddenError);
      const ingested = ingestAnalytics(db, priya, "phase20-ingest-01");
      assert.equal(ingested.copied, 5);
      const view = readAnalytics(db, priya);
      assert.equal(JSON.stringify(view.facts).includes("pat_elena"), false);
      assert.equal(view.facts.every((fact) => fact.droppedKeys.includes("patientId")), true);
      const exported = exportAnalytics(db, priya, { metricId: "events-by-type", idempotencyKey: "phase20-export-01" });
      assert.equal(exported.decision, "release");
      assert.equal(exported.body?.cells.some((cell) => cell.key === "observation.recorded" && cell.count === 5), true);
      assert.equal(exported.lineage.cells[0]?.outboxIds.length, 5);
      assert.equal(exported.assessment.directIdentifierFound, false);
      assert.match(exported.assessment.text, /not a patient list/);
      recordObservation(db, session(db, FIXTURES.evan), { patientId: FIXTURES.samir, code: "8480-6", value: 118, idempotencyKey: "phase20-evan-01" });
      const later = ingestAnalytics(db, priya, "phase20-ingest-02");
      assert.equal(later.copied, 2);
      assert.equal(JSON.stringify(readAnalytics(db, priya).facts).includes("fac_lakeside"), false);
      present("apps/web/app/api/analytics/ingest/route.ts");
    },
  },
  {
    name: "phase 21 population intelligence",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const priya = session(db, FIXTURES.priya);
      assert.throws(() => readPopulation(db, ctx), (error: unknown) => error instanceof ForbiddenError);
      const first = buildPopulation(db, priya, "phase21-build-01");
      assert.equal(first.state?.cohorts.find((item) => item.id === "chronic-problems")?.status, "suppressed");
      assert.equal(JSON.stringify(first).includes("E11.9"), false);
      assert.equal(JSON.stringify(first).includes("pat_elena"), false);
      for (const [index, givenName] of ["Nora", "Quinn", "Ivy"].entries()) {
        const created = createPatient(db, ctx, {
          givenName,
          familyName: "Lane",
          birthDate: `199${index + 1}-01-01`,
          sex: "female",
          idempotencyKey: `phase21-pat-${index}01`,
        });
        recordObservation(db, ctx, { patientId: created.id, code: "8480-6", value: 120 + index, idempotencyKey: `phase21-obs-${index}01` });
      }
      const released = buildPopulation(db, priya, "phase21-build-02");
      const systolic = released.state?.cohorts.find((item) => item.id === "recorded-systolic");
      assert.equal(systolic?.status, "released");
      assert.equal(systolic?.total, 5);
      assert.equal(JSON.stringify(released).includes("Nora"), false);
      assert.equal(released.state?.cohorts.find((item) => item.id === "vaccination")?.status, "not-stored");
      assert.match(released.state?.cohorts.find((item) => item.id === "facility-map")?.text ?? "", /not calculated/);
      present("apps/web/app/api/population/build/route.ts");
    },
  },
  {
    name: "phase 22 curaresearch",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      const priya = session(db, FIXTURES.priya);
      assert.throws(() => readResearch(db, ctx), (error: unknown) => error instanceof ForbiddenError);
      buildPopulation(db, priya, "phase22-pop-01");
      const opened = openResearchWorkspace(db, priya, {
        title: "Stored counts",
        protocolLabel: "local-protocol-1",
        idempotencyKey: "phase22-ws-01",
      });
      const view = readResearch(db, priya);
      assert.equal(view.workspaces[0]?.ethicsStatus, "not-reviewed");
      assert.equal(view.workspaces[0]?.purposeOfUse, "AUDIT");
      const snap = snapshotResearchDataset(db, priya, { workspaceId: opened.workspaceId, idempotencyKey: "phase22-snap-01" });
      const again = snapshotResearchDataset(db, priya, { workspaceId: opened.workspaceId, idempotencyKey: "phase22-snap-02" });
      assert.equal(again.version, snap.version);
      const requested = requestResearchExport(db, priya, { datasetId: snap.datasetId, idempotencyKey: "phase22-exp-01" });
      assert.throws(
        () => decideResearchExport(db, priya, { exportId: requested.exportId, decision: "approve", idempotencyKey: "phase22-dec-01" }),
        (error: unknown) => error instanceof ForbiddenError,
      );
      const approved = decideResearchExport(db, session(db, FIXTURES.nabil), {
        exportId: requested.exportId,
        decision: "approve",
        idempotencyKey: "phase22-dec-02",
      });
      assert.equal(approved.status, "approved");
      const released = readResearch(db, priya).workspaces[0]?.exports[0];
      assert.equal(JSON.stringify(released?.body).includes("pat_elena"), false);
      present("apps/web/app/api/research/workspace/route.ts");
    },
  },
  {
    name: "phase 23 imaging dicom foundation",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      assert.throws(() => readImaging(db, session(db, FIXTURES.priya)), (error: unknown) => error instanceof ForbiddenError);
      const started = Date.now();
      assert.throws(
        () =>
          recordImagingStudy(db, ctx, {
            patientId: FIXTURES.elena,
            accession: "ACC1001",
            modality: "CT",
            description: "A".repeat(2048),
            studyDate: "2026-10-01",
            idempotencyKey: "phase23-big-01",
          }),
        (error: unknown) => error instanceof ValidationError,
      );
      assert.ok(Date.now() - started < 1000);
      const stored = recordImagingStudy(db, ctx, {
        patientId: FIXTURES.elena,
        accession: "ACC1001",
        modality: "CT",
        description: "Chest metadata",
        studyDate: "2026-10-01",
        idempotencyKey: "phase23-study-01",
      });
      const view = readImaging(db, ctx);
      assert.equal(view.viewerNote, IMAGING_VIEWER_NOTE);
      const released = releaseImagingStudy(db, ctx, { studyId: stored.studyId, idempotencyKey: "phase23-rel-001" });
      assert.equal(released.decision, "release");
      const body = readImaging(db, ctx).studies[0]?.releases[0]?.body;
      assert.equal(JSON.stringify(body).includes("pat_elena"), false);
      present("apps/web/app/api/imaging/study/route.ts");
    },
  },
  {
    name: "phase 24 devices remote monitoring",
    check() {
      const { db, ctx } = signIn(FIXTURES.amira);
      assert.throws(() => readDevices(db, session(db, FIXTURES.priya)), (error: unknown) => error instanceof ForbiddenError);
      const registered = registerDevice(db, ctx, {
        patientId: FIXTURES.elena,
        kind: "pulse-oximeter",
        label: "Bedside",
        idempotencyKey: "phase24-reg-01",
      });
      const first = recordDeviceReading(db, ctx, {
        deviceId: registered.deviceId,
        value: 90,
        effectiveAt: "2026-10-08T10:00:00.000Z",
        idempotencyKey: "phase24-read-01",
      });
      const duplicate = recordDeviceReading(db, ctx, {
        deviceId: registered.deviceId,
        value: 90,
        effectiveAt: "2026-10-08T10:00:00.000Z",
        idempotencyKey: "phase24-read-02",
      });
      assert.equal(duplicate.readingId, first.readingId);
      const older = recordDeviceReading(db, ctx, {
        deviceId: registered.deviceId,
        value: 88,
        effectiveAt: "2026-10-08T09:00:00.000Z",
        idempotencyKey: "phase24-read-03",
      });
      assert.equal(older.order, "out-of-order");
      assert.equal(older.alertId, null);
      const view = readDevices(db, ctx);
      assert.equal(view.connectivityNote, DEVICE_CONNECTIVITY_NOTE);
      assert.equal(view.devices[0]?.alerts.length, 1);
      present("apps/web/app/api/devices/register/route.ts");
    },
  },
  {
    name: "phase 25 revenue claims insurance",
    check() {
      const { db, ctx } = signIn(FIXTURES.admin);
      assert.throws(() => readRevenue(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
      const invoice = recordInvoice(db, ctx, {
        facilityId: "fac_riverside",
        patientId: FIXTURES.elena,
        serviceLabel: "Visit record",
        amountCents: 2500,
        idempotencyKey: "phase25-inv-01",
      });
      assert.equal(invoice.status, "recorded");
      const view = readRevenue(db, ctx);
      assert.equal(view.invoiceNote, REVENUE_INVOICE_NOTE);
      assert.equal(view.reconciliation.invoiceCents, view.reconciliation.paymentCents + view.reconciliation.openCents);
      assert.equal(JSON.stringify(view).includes("E11.9"), false);
      present("apps/web/app/api/revenue/invoice/route.ts");
    },
  },
  {
    name: "phase 26 ai evaluation mlops governance",
    check() {
      const { db, ctx } = signIn(FIXTURES.priya);
      assert.throws(() => readEvaluation(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
      const registered = registerEvalDataset(db, ctx, { idempotencyKey: "phase26-set-01" });
      const run = runEvaluation(db, ctx, { datasetId: registered.datasetId, idempotencyKey: "phase26-run-01" });
      assert.equal(run.outcome, "passed");
      const view = readEvaluation(db, ctx);
      assert.equal(view.modelCard, EVAL_MODEL_CARD);
      assert.equal(view.runs[0]?.cases.every((item) => item.actual === "refused"), true);
      assert.equal(view.runs[0]?.rollback.status, "disabled");
      present("apps/web/app/api/evaluation/dataset/route.ts");
    },
  },
  {
    name: "phase 27 enterprise multi-region",
    check() {
      const { db, ctx } = signIn(FIXTURES.admin);
      assert.throws(() => readEnterprise(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
      const view = readEnterprise(db, ctx);
      assert.equal(view.region, "local-sqlite");
      assert.throws(
        () => recordResidency(db, ctx, { region: "eu-central-1", idempotencyKey: "phase27-region" }),
        (error: unknown) => error instanceof ValidationError,
      );
      const drill = recordRegionDrill(db, ctx, { idempotencyKey: "phase27-drill1" });
      assert.equal(drill.failover, "not-run");
      assert.equal(drill.schemaVersion, 30);
      assert.ok(drill.elapsedMs >= 0 && drill.elapsedMs < 5000);
      assert.equal(readEnterprise(db, ctx).rtoNote, ENTERPRISE_RTO_NOTE);
      assert.throws(() => moveTenant(db, ctx, { targetRegion: "eu-central-1", idempotencyKey: "phase27-move01" }), (error: unknown) => error instanceof ValidationError);
      present("apps/web/app/api/enterprise/residency/route.ts");
    },
  },
  {
    name: "phase 28 marketplace extension platform",
    check() {
      const { db, ctx } = signIn(FIXTURES.admin);
      assert.throws(() => readMarketplace(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
      assert.equal(readMarketplace(db, ctx).compatNote, MARKETPLACE_COMPAT_NOTE);
      assert.throws(
        () => registerListing(db, ctx, { label: "Local catalog", scope: "chart.write", idempotencyKey: "phase28-scope" }),
        (error: unknown) => error instanceof ValidationError,
      );
      const listed = registerListing(db, ctx, { label: "Local catalog", idempotencyKey: "phase28-list1" });
      assert.equal(listed.scope, "health.read");
      reviewListing(db, session(db, FIXTURES.priya), { listingId: listed.listingId, idempotencyKey: "phase28-review" });
      assert.throws(
        () => releaseListing(db, ctx, { listingId: listed.listingId, idempotencyKey: "phase28-release" }),
        (error: unknown) => error instanceof ValidationError,
      );
      assert.equal(readMarketplace(db, ctx).listings[0]?.status, "reviewed");
      present("apps/web/app/api/marketplace/listing/route.ts");
    },
  },
  {
    name: "phase 29 regulated clinical ai release train",
    check() {
      const { db, ctx } = signIn(FIXTURES.priya);
      assert.throws(() => readReleaseTrain(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
      const strategy = recordStrategy(db, ctx, { jurisdiction: "local-synthetic", idempotencyKey: "phase29-strategy" });
      assert.equal(strategy.status, "not-approved");
      const dossier = recordDossier(db, ctx, { strategyId: strategy.strategyId, label: "Refusal gate", idempotencyKey: "phase29-dossier" });
      assert.throws(
        () => recordReleaseAttempt(db, session(db, FIXTURES.nabil), { dossierId: dossier.dossierId, idempotencyKey: "phase29-early" }),
        (error: unknown) => error instanceof ValidationError,
      );
      recordValidation(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "phase29-vv" });
      assert.equal(readReleaseTrain(db, ctx).dossiers[0]?.validation, "refused");
      assert.equal(readReleaseTrain(db, ctx).attemptNote, RELEASE_ATTEMPT_NOTE);
      present("apps/web/app/api/release-train/strategy/route.ts");
    },
  },
  {
    name: "phase 30 advanced medical ai modules",
    check() {
      const { db, ctx } = signIn(FIXTURES.priya);
      assert.throws(() => readModules(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
      const view = readModules(db, ctx);
      assert.equal(view.catalog.length, MODULE_CODES.length);
      assert.equal(new Set(view.catalog.map((item) => item.intendedUse)).size, MODULE_CODES.length);
      assert.equal(new Set(view.catalog.map((item) => item.modelCard)).size, MODULE_CODES.length);
      const imaging = recordModule(db, ctx, { code: "imaging", idempotencyKey: "phase30-imaging" });
      assert.equal(imaging.status, "not-cleared");
      assert.equal(moduleIntendedUse("imaging"), view.catalog.find((item) => item.code === "imaging")?.intendedUse);
      assert.throws(() => approvePlatform(db, ctx, { codes: [...MODULE_CODES], idempotencyKey: "phase30-all" }), (error: unknown) => error instanceof ValidationError);
      const validated = recordModuleValidation(db, session(db, FIXTURES.nabil), { moduleId: imaging.moduleId, idempotencyKey: "phase30-valid" });
      assert.equal(validated.outcome, "refused");
      assert.equal(readModules(db, ctx).modules[0]?.status, "not-cleared");
      present("apps/web/app/api/modules/record/route.ts");
    },
  },
];

test("each implementation passes before the next one is accepted", () => {
  const results: { name: string; ok: boolean; detail: string }[] = [];
  for (const phase of phases) {
    try {
      phase.check();
      results.push({ name: phase.name, ok: true, detail: "passed" });
      console.log(`PASS  ${phase.name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ name: phase.name, ok: false, detail });
      console.log(`FAIL  ${phase.name}`);
      console.log(`      ${detail}`);
    }
  }
  const failed = results.filter((item) => !item.ok);
  console.log(`--- ${results.length - failed.length} passed, ${failed.length} failed ---`);
  assert.equal(
    failed.length,
    0,
    failed.map((item) => `${item.name}: ${item.detail}`).join("\n"),
  );
});
