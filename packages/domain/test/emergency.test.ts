import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import test from "node:test";
import { Secret, TOTP } from "otpauth";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { authorize, setAuthorizationDependency } from "../src/authorization.ts";
import { createDatabase } from "../src/db.ts";
import {
  activateEmergency,
  assignEmergencyReview,
  currentEmergencyGrant,
  disposeEmergencyReview,
  emergencyEligibility,
  emergencyHistory,
  emergencyView,
  escalateEmergencyReview,
  listEmergencyReviews,
  readEmergencyReview,
  readSyntheticEmergency,
  requestEmergency,
  retryEmergencyAlert,
  revokeEmergencyForSession,
  revokeEmergencyGrant,
  setEmergencyControl,
  SYNTHETIC_RESOURCE_ID,
  verifyEmergencyPasskey,
  verifyEmergencyTotp,
} from "../src/emergency.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../src/errors.ts";
import { confirmTotp, enrollTotp } from "../src/identity.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";
import { beginPasskeyAuthentication } from "../src/webauthn.ts";
import { get, run } from "../src/db.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const doctor = {
  userId: DEMO_GH.users.doctor,
  sessionId: "ses_emergency_doctor",
  organizationId: DEMO_GH.organizationId,
  facilityId: DEMO_GH.facilities.accra.id,
};
const reviewer = { ...doctor, userId: "usr_gh_reviewer", sessionId: "ses_emergency_reviewer", facilityId: null as string | null };

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

function codeFor(secret: string) {
  return new TOTP({ issuer: "CuraSphere", label: "workforce", algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
}

function enroll(database: ReturnType<typeof db>, userId: string) {
  const enrolled = enrollTotp(database, userId);
  confirmTotp(database, userId, codeFor(enrolled.secret));
  return enrolled.secret;
}

function ask(database: ReturnType<typeof db>, person: typeof doctor | { userId: string; sessionId: string; organizationId: string; facilityId: string | null } = doctor, key = `idem_${randomBytes(8).toString("hex")}`) {
  return requestEmergency(database, person, {
    resourceId: SYNTHETIC_RESOURCE_ID,
    reasonCategory: "emergency-treatment",
    justification: "Unconscious patient needs the restricted synthetic record.",
    durationSeconds: 120,
    idempotencyKey: key,
  }) as { id: string; status: string };
}

function ready(database: ReturnType<typeof db>, person = doctor) {
  const secret = enroll(database, person.userId);
  const request = ask(database, person);
  verifyEmergencyTotp(database, person, request.id, codeFor(secret));
  return request;
}

test("P02-S99 an eligible clinician can start an emergency request", () => {
  const database = db();
  const eligibility = emergencyEligibility(database, doctor, SYNTHETIC_RESOURCE_ID);
  assert.equal(eligibility.eligible, true);
  const request = ask(database);
  assert.equal(request.status, "challenge_required");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM emergency_grants WHERE request_id = ?`, request.id), undefined);
});

test("P02-S100 a receptionist cannot request emergency elevation", () => {
  const database = db();
  const reception = { ...doctor, userId: DEMO_GH.users.reception, facilityId: DEMO_GH.facilities.eastLegon.id };
  assert.equal(emergencyEligibility(database, reception, SYNTHETIC_RESOURCE_ID).eligible, false);
  assert.throws(() => ask(database, reception), ForbiddenError);
});

test("P02-S101 a suspended workforce user cannot request emergency access", () => {
  const database = db();
  run(database, `UPDATE organization_memberships SET status = 'suspended' WHERE user_id = ?`, doctor.userId);
  assert.throws(() => ask(database), ForbiddenError);
});

test("P02-S102 an expired session cannot request emergency access", () => {
  const database = db();
  run(
    database,
    `INSERT INTO auth_sessions (id, session_id, user_id, issuer, subject, assurance, created_at, absolute_expires_at, idle_expires_at)
     VALUES ('as_expired', ?, ?, 'local', 'subject', 'directory', ?, ?, ?)`,
    doctor.sessionId,
    doctor.userId,
    new Date().toISOString(),
    new Date(Date.now() - 1000).toISOString(),
    new Date(Date.now() - 1000).toISOString(),
  );
  assert.throws(() => ask(database), ForbiddenError);
});

test("P02-S103 a request without justification is rejected", () => {
  const database = db();
  assert.throws(
    () =>
      requestEmergency(database, doctor, {
        resourceId: SYNTHETIC_RESOURCE_ID,
        reasonCategory: "emergency-treatment",
        justification: "short",
        durationSeconds: 120,
        idempotencyKey: "idem_short_1",
      }),
    ValidationError,
  );
});

test("P02-S104 an unapproved resource scope is rejected", () => {
  const database = db();
  assert.throws(
    () =>
      requestEmergency(database, doctor, {
        resourceId: "syn_other",
        reasonCategory: "emergency-treatment",
        justification: "Unconscious patient needs the restricted synthetic record.",
        durationSeconds: 120,
        idempotencyKey: "idem_scope_1",
      }),
    ForbiddenError,
  );
});

test("P02-S105 a valid TOTP step-up authorizes the request without a grant", () => {
  const database = db();
  const secret = enroll(database, doctor.userId);
  const request = ask(database);
  const verified = verifyEmergencyTotp(database, doctor, request.id, codeFor(secret));
  assert.equal(verified.status, "authorized");
  assert.equal(get(database, `SELECT id FROM emergency_grants WHERE request_id = ?`, request.id), undefined);
});

test("P02-S106 an invalid TOTP challenge fails", () => {
  const database = db();
  enroll(database, doctor.userId);
  const request = ask(database);
  assert.throws(() => verifyEmergencyTotp(database, doctor, request.id, "000000"), ValidationError);
  assert.equal(get<{ status: string }>(database, `SELECT status FROM emergency_requests WHERE id = ?`, request.id)?.status, "challenge_required");
});

test("P02-S107 a valid passkey step-up authorizes the request", async () => {
  const database = db();
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x ?? "", "base64url");
  const y = Buffer.from(jwk.y ?? "", "base64url");
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);
  const credentialId = randomBytes(16).toString("base64url");
  run(
    database,
    `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports, status) VALUES ('pk1', ?, ?, ?, 0, 'internal', 'active')`,
    doctor.userId,
    credentialId,
    cose.toString("base64url"),
  );
  const begun = await beginPasskeyAuthentication(database, doctor.userId);
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: begun.options.challenge, origin: "http://localhost:3000", crossOrigin: false }));
  const rpHash = createHash("sha256").update("localhost").digest();
  const authenticatorData = Buffer.concat([rpHash, Buffer.from([0x05, 0x00, 0x00, 0x00, 0x00])]);
  const signature = sign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]), privateKey);
  const response: AuthenticationResponseJSON = {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientData.toString("base64url"),
      authenticatorData: authenticatorData.toString("base64url"),
      signature: signature.toString("base64url"),
    },
  };
  const request = ask(database);
  const verified = await verifyEmergencyPasskey(database, doctor, request.id, begun.challengeId, response);
  assert.equal(verified.status, "authorized");
});

test("P02-S108 a replayed or expired step-up cannot activate a grant", () => {
  const database = db();
  const secret = enroll(database, doctor.userId);
  const request = ask(database);
  verifyEmergencyTotp(database, doctor, request.id, codeFor(secret));
  assert.throws(() => verifyEmergencyTotp(database, doctor, request.id, codeFor(secret)), ConflictError);
  run(database, `UPDATE emergency_challenges SET consumed_at = ? WHERE request_id = ?`, new Date(Date.now() - 10 * 60 * 1000).toISOString(), request.id);
  assert.throws(() => activateEmergency(database, doctor, request.id), ForbiddenError);
});

test("P02-S109 a grant permits only the exact synthetic read", () => {
  const database = db();
  const request = ready(database);
  const grant = activateEmergency(database, doctor, request.id) as { id: string; action: string; resource_id: string };
  const allowed = readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID);
  assert.match(allowed.summary, /not a diagnosis/);
  assert.throws(() => readSyntheticEmergency(database, doctor, "syn_other"), ForbiddenError);
  const other = authorize(
    database,
    { principalId: doctor.userId },
    "synthetic.read",
    { type: "SyntheticRestrictedRecord", id: "syn_other", organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "standard", relationship: "required" },
    { purpose: "TREATMENT", relationshipAssigned: false, sessionId: doctor.sessionId },
  );
  assert.equal(other.allow, false);
  assert.equal(grant.action, "synthetic.read");
  assert.equal(grant.resource_id, SYNTHETIC_RESOURCE_ID);
});

test("P02-S110 an emergency grant cannot authorize prescribing or signing", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  for (const action of ["medication.prescribe", "clinical.sign"]) {
    const decision = authorize(
      database,
      { principalId: doctor.userId },
      action,
      { type: "MedicationRequest", id: SYNTHETIC_RESOURCE_ID, organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "standard" },
      { purpose: "TREATMENT", sessionId: doctor.sessionId },
    );
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "unimplemented");
  }
});

test("P02-S111 cross-tenant emergency access is rejected", () => {
  const database = db();
  const foreign = { ...doctor, organizationId: DEMO_EU.organizationId };
  assert.equal(emergencyEligibility(database, foreign, SYNTHETIC_RESOURCE_ID).eligible, false);
});

test("P02-S112 unauthorized cross-facility access is rejected", () => {
  const database = db();
  const east = { ...doctor, facilityId: DEMO_GH.facilities.eastLegon.id };
  assert.equal(emergencyEligibility(database, east, SYNTHETIC_RESOURCE_ID).eligible, false);
});

test("P02-S113 a forged emergency flag is ignored", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const decision = authorize(
    database,
    { principalId: doctor.userId },
    "synthetic.read",
    { type: "SyntheticRestrictedRecord", id: SYNTHETIC_RESOURCE_ID, organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "standard", relationship: "required" },
    { purpose: "TREATMENT", relationshipAssigned: false, sessionId: doctor.sessionId, emergency: true },
  );
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "emergency-disabled");
});

test("P02-S114 a hard deny overrides attempted emergency elevation", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const decision = authorize(
    database,
    { principalId: doctor.userId },
    "synthetic.read",
    { type: "SyntheticRestrictedRecord", id: SYNTHETIC_RESOURCE_ID, organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "confidential", relationship: "required" },
    { purpose: "TREATMENT", relationshipAssigned: false, sessionId: doctor.sessionId },
  );
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "confidential");
});

test("P02-S115 a disabled emergency policy prevents grant issuance", () => {
  const database = db();
  run(database, `UPDATE emergency_policies SET status = 'disabled' WHERE id = 'pol_demo_gh_synthetic'`);
  assert.throws(() => ask(database), ForbiddenError);
});

test("P02-S116 ordinary permissions stay unchanged", () => {
  const database = db();
  const decision = authorize(
    database,
    { principalId: doctor.userId },
    "clinical.read",
    { type: "ClinicalNote", organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "standard", relationship: "assigned" },
    { purpose: "TREATMENT", relationshipAssigned: true, sessionId: doctor.sessionId },
  );
  assert.equal(decision.allow, true);
  assert.equal(decision.reason, "permit");
});

test("P02-S117 activating the same request twice returns one grant", () => {
  const database = db();
  const request = ready(database);
  const first = activateEmergency(database, doctor, request.id) as { id: string };
  const second = activateEmergency(database, doctor, request.id) as { id: string };
  assert.equal(first.id, second.id);
});

test("P02-S118 an active grant does not permit bulk export", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const decision = authorize(
    database,
    { principalId: doctor.userId },
    "clinical.export",
    { type: "ClinicalNote", organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "standard" },
    { purpose: "TREATMENT", sessionId: doctor.sessionId, bulk: true },
  );
  assert.equal(decision.allow, false);
});

test("P02-S119 an expired grant stops access", () => {
  const database = db();
  const grant = activateEmergency(database, doctor, ready(database).id) as { id: string };
  run(database, `UPDATE emergency_grants SET expires_at = ? WHERE id = ?`, new Date(Date.now() - 1000).toISOString(), grant.id);
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
  assert.equal(currentEmergencyGrant(database, doctor), null);
});

test("P02-S120 revocation removes access immediately", () => {
  const database = db();
  const grant = activateEmergency(database, doctor, ready(database).id) as { id: string };
  revokeEmergencyGrant(database, doctor, grant.id);
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S121 a revoked membership invalidates emergency access", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  run(database, `UPDATE organization_memberships SET status = 'revoked' WHERE user_id = ? AND organization_id = ?`, doctor.userId, doctor.organizationId);
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S122 logout invalidates the session-bound grant", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  revokeEmergencyForSession(database, doctor.sessionId);
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S123 a facility change cannot carry the emergency scope", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const moved = { ...doctor, facilityId: DEMO_GH.facilities.eastLegon.id };
  assert.throws(() => readSyntheticEmergency(database, moved, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S124 a revoked grant stays revoked after another read", () => {
  const database = db();
  const grant = activateEmergency(database, doctor, ready(database).id) as { id: string };
  revokeEmergencyGrant(database, doctor, grant.id);
  const again = get<{ status: string }>(database, `SELECT status FROM emergency_grants WHERE id = ?`, grant.id);
  assert.equal(again?.status, "revoked");
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S125 the expiry boundary is server time", () => {
  const database = db();
  const grant = activateEmergency(database, doctor, ready(database).id) as { id: string };
  run(database, `UPDATE emergency_grants SET expires_at = ? WHERE id = ?`, new Date().toISOString(), grant.id);
  const decision = authorize(
    database,
    { principalId: doctor.userId },
    "synthetic.read",
    { type: "SyntheticRestrictedRecord", id: SYNTHETIC_RESOURCE_ID, organizationId: doctor.organizationId, facilityId: doctor.facilityId, sensitivity: "standard", relationship: "required" },
    { purpose: "TREATMENT", relationshipAssigned: false, sessionId: doctor.sessionId },
  );
  assert.equal(decision.allow, false);
});

test("P02-S126 a grant creates review and alert evidence", () => {
  const database = db();
  const request = ready(database);
  activateEmergency(database, doctor, request.id);
  assert.equal(get<{ status: string }>(database, `SELECT status FROM emergency_reviews WHERE request_id = ?`, request.id)?.status, "pending_review");
  assert.equal(get<{ status: string; recipient_id: string }>(database, `SELECT a.status, a.recipient_id FROM emergency_alerts a JOIN emergency_events e ON e.id = a.event_id WHERE e.request_id = ?`, request.id)?.recipient_id, "usr_gh_reviewer");
});

test("P02-S127 each protected read records evidence", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID);
  const row = get<{ action: string; outcome: string }>(database, `SELECT action, outcome FROM emergency_events WHERE event_type = 'resource-accessed'`);
  assert.equal(row?.action, "synthetic.read");
  assert.equal(row?.outcome, "allowed");
});

test("P02-S128 the reviewer alert is captured in the local sandbox", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const alert = get<{ status: string; channel: string }>(database, `SELECT status, channel FROM emergency_alerts`);
  assert.equal(alert?.status, "captured");
  assert.equal(alert?.channel, "local-sandbox");
});

test("P02-S129 a sandbox outage is visible and can be retried", () => {
  const database = db();
  setEmergencyControl(database, "delivery", "fail");
  activateEmergency(database, doctor, ready(database).id);
  const alert = get<{ id: string; status: string }>(database, `SELECT id, status FROM emergency_alerts`);
  assert.equal(alert?.status, "failed");
  setEmergencyControl(database, "delivery", "sandbox");
  const retried = retryEmergencyAlert(database, alert?.id ?? "") as { status: string };
  assert.equal(retried.status, "retried");
});

test("P02-S130 the requester cannot review their own emergency access", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const review = get<{ id: string }>(database, `SELECT id FROM emergency_reviews`);
  assert.throws(() => disposeEmergencyReview(database, doctor, review?.id ?? "", "closed_appropriate", "This access was appropriate."), ForbiddenError);
});

test("P02-S131 an independent reviewer can record a disposition", () => {
  const database = db();
  const request = ready(database);
  activateEmergency(database, doctor, request.id);
  const review = get<{ id: string }>(database, `SELECT id FROM emergency_reviews`);
  const closed = disposeEmergencyReview(database, reviewer, review?.id ?? "", "closed_appropriate", "Access matched the recorded justification.");
  assert.equal(closed?.status, "closed_appropriate");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM emergency_grants WHERE request_id = ?`, request.id)?.status, "active");
});

test("P02-S132 escalation preserves the original history", () => {
  const database = db();
  const request = ready(database);
  activateEmergency(database, doctor, request.id);
  const before = database.prepare(`SELECT id FROM emergency_events WHERE request_id = ?`).all(request.id).length;
  const review = get<{ id: string }>(database, `SELECT id FROM emergency_reviews`);
  escalateEmergencyReview(database, reviewer, review?.id ?? "", "Suspicious repeated access.");
  const after = database.prepare(`SELECT id FROM emergency_events WHERE request_id = ?`).all(request.id).length;
  assert.ok(after > before);
  assert.ok(before > 0);
});

test("P02-S133 another tenant cannot view the review", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const foreign = { ...reviewer, organizationId: DEMO_EU.organizationId };
  assert.throws(() => listEmergencyReviews(database, foreign), ForbiddenError);
});

test("P02-S134 missing reviewer coverage blocks the grant", () => {
  const database = db();
  setEmergencyControl(database, "reviewer", "missing");
  assert.throws(() => ask(database), ForbiddenError);
});

test("P02-S135 a failed commit does not leave an active grant", () => {
  const database = db();
  const request = ready(database);
  setEmergencyControl(database, "commit", "fail");
  assert.throws(() => activateEmergency(database, doctor, request.id), ConflictError);
  assert.equal(get(database, `SELECT id FROM emergency_grants WHERE request_id = ?`, request.id), undefined);
  assert.equal(get(database, `SELECT id FROM emergency_reviews WHERE request_id = ?`, request.id), undefined);
});

test("P02-S136 a policy dependency failure does not authorize access", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  setAuthorizationDependency(database, "unavailable");
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S137 step-up fails closed when no authenticator is enrolled", () => {
  const database = db();
  const request = ask(database);
  assert.throws(() => verifyEmergencyTotp(database, doctor, request.id, "123456"), ValidationError);
  assert.equal(get(database, `SELECT id FROM emergency_grants`), undefined);
});

test("P02-S138 revocation during a protected read is denied", () => {
  const database = db();
  const grant = activateEmergency(database, doctor, ready(database).id) as { id: string };
  revokeEmergencyGrant(database, reviewer, grant.id);
  assert.throws(() => readSyntheticEmergency(database, doctor, SYNTHETIC_RESOURCE_ID), ForbiddenError);
});

test("P02-S139 ended access clears protected content", () => {
  assert.equal(emergencyView(false, "Kojo Agyeman"), null);
  assert.match(emergencyView(true, "Synthetic restricted test record") ?? "", /Synthetic/);
});

test("P02-S140 events do not store the free-text justification", () => {
  const database = db();
  const request = ask(database);
  const stored = get<{ justification: string }>(database, `SELECT justification FROM emergency_requests WHERE id = ?`, request.id);
  const leaked = database.prepare(`SELECT reason_code FROM emergency_events`).all() as Array<{ reason_code: string }>;
  assert.ok(stored?.justification.includes("Unconscious"));
  assert.equal(leaked.some((row) => row.reason_code.includes("Unconscious")), false);
});

test("P02-S141 the synthetic record is isolated from a clinical chart", () => {
  const database = db();
  const row = get<{ summary: string }>(database, `SELECT summary FROM emergency_resources WHERE id = ?`, SYNTHETIC_RESOURCE_ID);
  assert.match(row?.summary ?? "", /not a diagnosis/);
  const history = emergencyHistory(database, doctor) as Array<{ id: string }>;
  assert.equal(history.length, 0);
});

test("P02-S142 production mode cannot activate emergency access", () => {
  const database = db();
  const previous = process.env.CURASPHERE_ENV;
  process.env.CURASPHERE_ENV = "production";
  try {
    assert.equal(emergencyEligibility(database, doctor, SYNTHETIC_RESOURCE_ID).eligible, false);
    assert.throws(() => ask(database), ForbiddenError);
  } finally {
    if (previous === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = previous;
  }
});

test("P02-S143 staging mode cannot activate emergency access", () => {
  const database = db();
  const previous = process.env.CURASPHERE_ENV;
  process.env.CURASPHERE_ENV = "staging";
  try {
    assert.equal(emergencyEligibility(database, doctor, SYNTHETIC_RESOURCE_ID).eligible, false);
    assert.throws(() => ask(database), ForbiddenError);
  } finally {
    if (previous === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = previous;
  }
});

test("a reviewer can be assigned without receiving the synthetic record", () => {
  const database = db();
  activateEmergency(database, doctor, ready(database).id);
  const review = get<{ id: string }>(database, `SELECT id FROM emergency_reviews`);
  assignEmergencyReview(database, reviewer, review?.id ?? "", "usr_gh_reviewer");
  assert.throws(() => readSyntheticEmergency(database, reviewer, SYNTHETIC_RESOURCE_ID), ForbiddenError);
  const detail = readEmergencyReview(database, reviewer, review?.id ?? "");
  assert.equal(detail.request?.reason_category, "emergency-treatment");
});
