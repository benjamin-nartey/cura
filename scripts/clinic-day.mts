import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.DATABASE_PATH = path.resolve("data", "curasphere.sqlite");

const domain = await import(pathToFileURL(path.resolve("packages/domain/src/index.ts")).href);

const db = domain.getDb();

function session(userId: string) {
  const opened = domain.openSession(db, userId);
  const ctx = domain.readSession(db, opened.sessionId);
  if (!ctx) throw new Error(`session missing for ${userId}`);
  return ctx;
}

function step(name: string, run: () => unknown) {
  try {
    const value = run();
    console.log(`ok ${name} ${JSON.stringify(value)}`);
    return value as Record<string, string | null | undefined> | undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`skip ${name} ${message}`);
    return undefined;
  }
}

const amira = session("usr_amira");
const jordan = session("usr_jordan");
const lea = session("usr_lea");
const evan = session("usr_evan");
const admin = session("usr_admin");
const priya = session("usr_priya");

step("board", () => domain.ensureClinicBoard(db));

const jonahRx = step("prescribe jonah furosemide", () =>
  domain.prescribeMedication(db, amira, {
    patientId: "pat_jonah",
    formularyId: "frm_furosemide",
    dose: "20 mg daily",
    idempotencyKey: "cd20261008-rx-jonah-furosemide",
  }),
);
if (jonahRx?.orderId) {
  step("activate jonah furosemide", () =>
    domain.activateRxOrder(db, amira, { orderId: jonahRx.orderId!, idempotencyKey: "cd20261008-rx-jonah-activate" }),
  );
  step("dispense jonah furosemide", () =>
    domain.dispenseRx(db, jordan, { orderId: jonahRx.orderId!, quantity: 30, idempotencyKey: "cd20261008-rx-jonah-dispense" }),
  );
  step("administer jonah furosemide", () =>
    domain.administerRx(db, jordan, { orderId: jonahRx.orderId!, idempotencyKey: "cd20261008-rx-jonah-give" }),
  );
}

step("dispense walter furosemide", () =>
  domain.dispenseRx(db, jordan, { orderId: "rx_sim_furosemide", quantity: 30, idempotencyKey: "cd20261008-rx-walter-dispense" }),
);
step("administer walter furosemide", () =>
  domain.administerRx(db, jordan, { orderId: "rx_sim_furosemide", idempotencyKey: "cd20261008-rx-walter-give" }),
);
step("dispense elena amoxicillin", () =>
  domain.dispenseRx(db, jordan, { orderId: "rxo_414f2403-7473-4926-a031-b8a61a4573a1", quantity: 21, idempotencyKey: "cd20261008-rx-elena-dispense" }),
);

const farahRx = step("prescribe farah furosemide", () =>
  domain.prescribeMedication(db, lea, {
    patientId: "pat_farah",
    formularyId: "frm_furosemide",
    dose: "20 mg daily",
    idempotencyKey: "cd20261008-rx-farah-furosemide",
  }),
);
if (farahRx?.orderId) {
  step("activate farah furosemide", () =>
    domain.activateRxOrder(db, lea, { orderId: farahRx.orderId!, idempotencyKey: "cd20261008-rx-farah-activate" }),
  );
  step("dispense farah furosemide", () =>
    domain.dispenseRx(db, lea, { orderId: farahRx.orderId!, quantity: 30, idempotencyKey: "cd20261008-rx-farah-dispense" }),
  );
}

const graceRx = step("prescribe grace furosemide", () =>
  domain.prescribeMedication(db, evan, {
    patientId: "pat_grace",
    formularyId: "frm_furosemide",
    dose: "20 mg daily",
    idempotencyKey: "cd20261008-rx-grace-furosemide",
  }),
);
if (graceRx?.orderId) {
  step("activate grace furosemide", () =>
    domain.activateRxOrder(db, evan, { orderId: graceRx.orderId!, idempotencyKey: "cd20261008-rx-grace-activate" }),
  );
  step("dispense grace furosemide", () =>
    domain.dispenseRx(db, evan, { orderId: graceRx.orderId!, quantity: 30, idempotencyKey: "cd20261008-rx-grace-dispense" }),
  );
}

step("result elena potassium", () =>
  domain.recordLabResult(db, amira, { orderId: "lab_sim_k", value: 3.8, idempotencyKey: "cd20261008-lab-elena-k" }),
);
step("collect walter bnp", () => domain.collectLabSpecimen(db, jordan, { orderId: "lab_sim_bnp", idempotencyKey: "cd20261008-lab-walter-collect" }));
step("result walter bnp", () => domain.recordLabResult(db, amira, { orderId: "lab_sim_bnp", value: 240, idempotencyKey: "cd20261008-lab-walter-bnp" }));

const owenLab = step("order owen glucose", () =>
  domain.placeLabOrder(db, amira, { patientId: "pat_owen", code: "2345-7", idempotencyKey: "cd20261008-lab-owen-order" }),
);
if (owenLab?.orderId) {
  step("collect owen glucose", () =>
    domain.collectLabSpecimen(db, jordan, { orderId: owenLab.orderId!, idempotencyKey: "cd20261008-lab-owen-collect" }),
  );
  step("result owen glucose", () =>
    domain.recordLabResult(db, amira, { orderId: owenLab.orderId!, value: 158, idempotencyKey: "cd20261008-lab-owen-result" }),
  );
}

const walterPlan = step("plan walter", () =>
  domain.draftCarePlan(db, amira, {
    patientId: "pat_walter",
    goal: "Daily weight stays on the chart, and the furosemide dose is reviewed at the next heart failure visit.",
    idempotencyKey: "cd20261008-plan-walter",
  }),
);
if (walterPlan?.planId) {
  step("activate walter plan", () => domain.activateCarePlan(db, amira, { planId: walterPlan.planId!, idempotencyKey: "cd20261008-plan-walter-on" }));
}
const elenaPlan = step("plan elena", () =>
  domain.draftCarePlan(db, amira, {
    patientId: "pat_elena",
    goal: "Heart failure and diabetes follow-up stay on one chart, with the next visit booked.",
    idempotencyKey: "cd20261008-plan-elena",
  }),
);
if (elenaPlan?.planId) {
  step("activate elena plan", () => domain.activateCarePlan(db, amira, { planId: elenaPlan.planId!, idempotencyKey: "cd20261008-plan-elena-on" }));
}

const followUp = step("follow-up walter", () =>
  domain.createFollowUp(db, amira, {
    patientId: "pat_walter",
    dueOn: "2026-10-22",
    reason: "Heart failure visit",
    idempotencyKey: "cd20261008-task-walter",
  }),
);
if (followUp?.taskId) {
  step("complete walter follow-up", () => domain.completeCareTask(db, amira, { taskId: followUp.taskId!, idempotencyKey: "cd20261008-task-walter-done" }));
}
step("follow-up elena", () =>
  domain.createFollowUp(db, amira, {
    patientId: "pat_elena",
    dueOn: "2026-10-15",
    reason: "Review potassium after today's result",
    idempotencyKey: "cd20261008-task-elena",
  }),
);

step("outreach elena", () =>
  domain.setOutreachPreference(db, amira, {
    patientId: "pat_elena",
    locale: "en",
    channel: "portal",
    consent: "granted",
    idempotencyKey: "cd20261008-outreach-elena",
  }),
);
step("message elena follow-up", () =>
  domain.sendOutreach(db, amira, { patientId: "pat_elena", templateId: "tpl_followup", idempotencyKey: "cd20261008-outreach-elena-send" }),
);

const referral = step("refer sofia", () =>
  domain.createReferral(db, amira, {
    patientId: "pat_sofia",
    toFacilityId: "fac_east",
    reason: "Allergy follow-up at East Annex",
    idempotencyKey: "cd20261008-referral-sofia",
  }),
);
if (referral?.referralId) {
  step("accept sofia referral", () =>
    domain.decideReferral(db, lea, { referralId: referral.referralId!, decision: "accepted", idempotencyKey: "cd20261008-referral-sofia-yes" }),
  );
}

const walterChart = domain.getChart(db, amira, "pat_walter");
const gap = walterChart ? domain.buildPatientState(walterChart).careGaps[0] : undefined;
if (gap) {
  const gapTask = step("gap walter", () =>
    domain.openGapTask(db, amira, { patientId: "pat_walter", sourceId: gap.sourceId, idempotencyKey: "cd20261008-gap-walter" }),
  );
  if (gapTask?.taskId) {
    step("claim gap", () => domain.claimCareTask(db, jordan, { taskId: gapTask.taskId!, idempotencyKey: "cd20261008-gap-claim" }));
  }
}

const elenaPortal = domain.readPatientSession(db, domain.openPatientSession(db, "pac_elena").sessionId);
if (elenaPortal) {
  step("elena message", () =>
    domain.sendPatientMessage(db, elenaPortal, {
      body: "Please confirm the time of my visit today.",
      idempotencyKey: "cd20261008-portal-elena-msg",
    }),
  );
  step("reply elena", () =>
    domain.replyToPatient(db, amira, {
      patientId: "pat_elena",
      body: "Your heart failure visit is booked for 13:20 UTC today.",
      idempotencyKey: "cd20261008-portal-elena-reply",
    }),
  );
  step("elena coverage", () =>
    domain.storeCoverage(db, elenaPortal, {
      payerName: "Harborlight Mutual",
      memberId: "HL-44021",
      idempotencyKey: "cd20261008-portal-elena-cover",
    }),
  );
  step("elena payment", () =>
    domain.recordPatientPayment(db, elenaPortal, {
      description: "Visit copay",
      amountCents: 2500,
      idempotencyKey: "cd20261008-portal-elena-pay",
    }),
  );
  step("elena question", () =>
    domain.storePatientQuestion(db, elenaPortal, {
      text: "What medications are on my chart?",
      idempotencyKey: "cd20261008-portal-elena-ask",
    }),
  );
  const request = step("elena request", () =>
    domain.requestAppointment(db, elenaPortal, {
      reason: "Blood pressure check next week",
      idempotencyKey: "cd20261008-portal-elena-req",
    }),
  );
  if (request?.requestId) {
    step("accept elena request", () =>
      domain.decideAppointmentRequest(db, amira, {
        requestId: request.requestId!,
        decision: "accepted",
        startsAt: "2026-10-15T14:00:00.000Z",
        endsAt: "2026-10-15T14:20:00.000Z",
        idempotencyKey: "cd20261008-portal-elena-book",
      }),
    );
  }
}

const jonahCuff = step("jonah cuff", () =>
  domain.registerDevice(db, amira, {
    patientId: "pat_jonah",
    kind: "blood-pressure-cuff",
    label: "Home cuff",
    idempotencyKey: "cd20261008-dev-jonah-cuff",
  }),
);
if (jonahCuff?.deviceId) {
  step("jonah pressure", () =>
    domain.recordDeviceReading(db, jordan, {
      deviceId: jonahCuff.deviceId!,
      value: 152,
      effectiveAt: "2026-10-08T09:10",
      idempotencyKey: "cd20261008-dev-jonah-read",
    }),
  );
}

const walterCuff = step("walter cuff", () =>
  domain.registerDevice(db, amira, {
    patientId: "pat_walter",
    kind: "blood-pressure-cuff",
    label: "Ward cuff",
    idempotencyKey: "cd20261008-dev-walter-cuff",
  }),
);
const walterOx = step("walter oximeter", () =>
  domain.registerDevice(db, amira, {
    patientId: "pat_walter",
    kind: "pulse-oximeter",
    label: "Ward oximeter",
    idempotencyKey: "cd20261008-dev-walter-ox",
  }),
);
const walterMeter = step("walter meter", () =>
  domain.registerDevice(db, amira, {
    patientId: "pat_walter",
    kind: "glucose-meter",
    label: "Ward meter",
    idempotencyKey: "cd20261008-dev-walter-meter",
  }),
);
if (walterCuff?.deviceId) {
  step("walter pressure", () =>
    domain.recordDeviceReading(db, jordan, {
      deviceId: walterCuff.deviceId!,
      value: 168,
      effectiveAt: "2026-10-08T11:30",
      idempotencyKey: "cd20261008-dev-walter-sbp",
    }),
  );
}
if (walterOx?.deviceId) {
  step("walter oxygen", () =>
    domain.recordDeviceReading(db, jordan, {
      deviceId: walterOx.deviceId!,
      value: 91,
      effectiveAt: "2026-10-08T11:32",
      idempotencyKey: "cd20261008-dev-walter-spo2",
    }),
  );
}
if (walterMeter?.deviceId) {
  step("walter glucose", () =>
    domain.recordDeviceReading(db, jordan, {
      deviceId: walterMeter.deviceId!,
      value: 210,
      effectiveAt: "2026-10-08T11:34",
      idempotencyKey: "cd20261008-dev-walter-glu",
    }),
  );
}
if (walterCuff?.deviceId) {
  step("walter pressure held", () =>
    domain.recordDeviceReading(db, jordan, {
      deviceId: walterCuff.deviceId!,
      value: 174,
      effectiveAt: "2026-10-08T11:40",
      idempotencyKey: "cd20261008-dev-walter-sbp2",
    }),
  );
}

const study = step("walter chest study", () =>
  domain.recordImagingStudy(db, amira, {
    patientId: "pat_walter",
    accession: "RIV-XR-2005",
    modality: "CR",
    description: "Chest radiograph, two views",
    studyDate: "2026-10-08",
    idempotencyKey: "cd20261008-img-walter",
  }),
);
if (study?.studyId) {
  step("walter chest report", () =>
    domain.recordImagingReport(db, amira, {
      studyId: study.studyId!,
      text: "Chest radiograph, two views, 8 October 2026. The cardiac silhouette is enlarged. No focal airspace opacity is described.",
      idempotencyKey: "cd20261008-img-walter-report",
    }),
  );
}

step("inventory furosemide", () =>
  domain.recordInventory(db, amira, { label: "Furosemide 20 mg tablets", onHand: 240, idempotencyKey: "cd20261008-ops-furosemide" }),
);
step("inventory tubes", () =>
  domain.recordInventory(db, amira, { label: "Potassium specimen tubes", onHand: 80, idempotencyKey: "cd20261008-ops-tubes" }),
);
step("inventory east", () =>
  domain.recordInventory(db, lea, { label: "Amlodipine 5 mg tablets", onHand: 120, idempotencyKey: "cd20261008-ops-east-amlo" }),
);
step("staffing hold", () =>
  domain.overrideOperations(db, amira, {
    kind: "staffing",
    reason: "Jordan Hale is on the day shift. No extra nurse is scheduled.",
    idempotencyKey: "cd20261008-ops-staffing",
  }),
);
step("rebuild operations", () => domain.rebuildOperations(db, amira, "cd20261008-ops-rebuild"));
step("rebuild facility", () => domain.rebuildFacility(db, amira, "cd20261008-fac-rebuild"));

const elenaInvoice = step("invoice elena", () =>
  domain.recordInvoice(db, admin, {
    facilityId: "fac_riverside",
    patientId: "pat_elena",
    serviceLabel: "Heart failure follow-up",
    amountCents: 18500,
    idempotencyKey: "cd20261008-inv-elena",
  }),
);
if (elenaInvoice?.invoiceId) {
  step("payment elena", () =>
    domain.recordRevenuePayment(db, admin, { invoiceId: elenaInvoice.invoiceId!, amountCents: 5000, idempotencyKey: "cd20261008-pay-elena" }),
  );
  const claim = step("claim elena", () =>
    domain.draftClaim(db, admin, { invoiceId: elenaInvoice.invoiceId!, idempotencyKey: "cd20261008-claim-elena" }),
  );
  if (claim?.claimId) {
    step("claim attempt elena", () => domain.submitClaim(db, admin, { claimId: claim.claimId!, idempotencyKey: "cd20261008-claim-elena-try" }));
  }
}
step("invoice owen", () =>
  domain.recordInvoice(db, admin, {
    facilityId: "fac_riverside",
    patientId: "pat_owen",
    serviceLabel: "Diabetes follow-up",
    amountCents: 14500,
    idempotencyKey: "cd20261008-inv-owen",
  }),
);
step("eligibility elena", () =>
  domain.recordEligibility(db, admin, {
    facilityId: "fac_riverside",
    patientId: "pat_elena",
    payerLabel: "Harborlight Mutual",
    idempotencyKey: "cd20261008-elig-elena",
  }),
);
step("subscription", () => domain.recordSubscription(db, admin, { planLabel: "Harborlight clinic", idempotencyKey: "cd20261008-sub-harborlight" }));

step("population tag", () =>
  domain.recordPopulationJurisdiction(db, priya, { tag: "local-synthetic", idempotencyKey: "cd20261008-pop-tag" }),
);
step("population build", () => domain.buildPopulation(db, priya, "cd20261008-pop-build"));
step("analytics ingest", () => domain.ingestAnalytics(db, priya, "cd20261008-analytics"));

for (const ctx of [amira, jordan, lea, evan, admin, priya]) domain.closeSession(db, ctx.sessionId);

console.log("clinic day recorded");
