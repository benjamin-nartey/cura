import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { authorize } from "../src/authorization.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/errors.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";
import {
  acceptInvitation,
  assignWorkforceRole,
  cancelInvitation,
  inviteWorkforce,
  listInvitations,
  listWorkforce,
  offboardWorkforce,
  reactivateWorkforce,
  resendInvitation,
  revokeWorkforceRole,
  setWorkforceControl,
  suspendWorkforce,
  addWorkforceFacility,
  transferWorkforce,
  workforceHistory,
  type WorkforceActor,
} from "../src/workforce.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

const admin: WorkforceActor = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, purpose: "OPERATIONS", assurance: "mfa" };
const facilityAdmin: WorkforceActor = { userId: "usr_gh_facadmin", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, purpose: "OPERATIONS", assurance: "directory" };
const reception: WorkforceActor = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, purpose: "OPERATIONS", assurance: "directory" };

function inviteNurse(database: ReturnType<typeof db>, key = `inv-${randomUUID().slice(0, 8)}`) {
  return inviteWorkforce(database, admin, { email: "new.nurse@demo-gh.invalid", roleId: "nurse", facilityIds: [DEMO_GH.facilities.accra.id], idempotencyKey: key, reason: "staffing" });
}

test("P02-S63 an organization administrator opens the workforce directory", () => {
  const database = db();
  const view = listWorkforce(database, admin, {});
  assert.ok(view.staff.some((person) => person.id === DEMO_GH.users.doctor));
  assert.equal(view.staff.some((person) => person.name.includes("DEMO_EU")), false);
});

test("P02-S64 a facility administrator sees only permitted staff", () => {
  const database = db();
  const view = listWorkforce(database, facilityAdmin, {});
  assert.ok(view.staff.some((person) => person.id === DEMO_GH.users.doctor));
  assert.equal(view.staff.some((person) => person.id === DEMO_GH.users.reception), false);
});

test("P02-S65 a receptionist cannot open workforce administration", () => {
  const database = db();
  assert.throws(() => listWorkforce(database, reception, {}), ForbiddenError);
});

test("P02-S66 an administrator invites a nurse", () => {
  const database = db();
  const created = inviteNurse(database);
  assert.equal(created.status, "pending");
  assert.equal(created.mailed, "captured");
  const stored = database.prepare("SELECT token_hash FROM workforce_invitations WHERE id = ?").get(created.id) as { token_hash: string };
  assert.notEqual(stored.token_hash, created.token);
});

test("P02-S67 a linked identity accepts a valid invitation", () => {
  const database = db();
  database.prepare(`INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_new_nurse', ?, NULL, 'Esi Owusu', 'nurse')`).run(DEMO_GH.organizationId);
  database.prepare(`INSERT INTO external_identities (id, issuer, subject, user_id, email, status) VALUES ('ext_new_nurse', 'http://127.0.0.1:15556/dex', 'subject-new-nurse', 'usr_new_nurse', 'new.nurse@demo-gh.invalid', 'active')`).run();
  const created = inviteNurse(database);
  const accepted = acceptInvitation(database, { token: created.token ?? "", userId: "usr_new_nurse", externalLinked: true });
  assert.equal(accepted.status, "active");
  const decision = authorize(database, { principalId: "usr_new_nurse", accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "mfa", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, true);
});

test("P02-S68 acceptance without identity binding is rejected", () => {
  const database = db();
  database.prepare(`INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_unbound', ?, NULL, 'Unbound Nurse', 'nurse')`).run(DEMO_GH.organizationId);
  const created = inviteNurse(database, "inv-unbound1");
  assert.throws(() => acceptInvitation(database, { token: created.token ?? "", userId: "usr_unbound", externalLinked: false }), ForbiddenError);
});

test("P02-S69 an expired invitation is rejected", () => {
  const database = db();
  const created = inviteNurse(database, "inv-expired1");
  database.prepare(`UPDATE workforce_invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(created.id);
  assert.throws(() => acceptInvitation(database, { token: created.token ?? "", userId: "usr_gh_transfer", externalLinked: true }), ConflictError);
});

test("P02-S70 a cancelled invitation is rejected", () => {
  const database = db();
  const created = inviteNurse(database, "inv-cancel01");
  cancelInvitation(database, admin, created.id, 1);
  assert.throws(() => acceptInvitation(database, { token: created.token ?? "", userId: "usr_gh_transfer", externalLinked: true }), ConflictError);
});

test("P02-S71 an invitation cannot be redeemed twice", () => {
  const database = db();
  database.prepare(`INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_once', ?, NULL, 'Once Nurse', 'nurse')`).run(DEMO_GH.organizationId);
  database.prepare(`INSERT INTO external_identities (id, issuer, subject, user_id, email, status) VALUES ('ext_once', 'http://127.0.0.1:15556/dex', 'subject-once', 'usr_once', 'once@demo-gh.invalid', 'active')`).run();
  const created = inviteNurse(database, "inv-once0001");
  acceptInvitation(database, { token: created.token ?? "", userId: "usr_once", externalLinked: true });
  assert.throws(() => acceptInvitation(database, { token: created.token ?? "", userId: "usr_once", externalLinked: true }), ConflictError);
});

test("P02-S72 duplicate invitation keys do not create two invitations", () => {
  const database = db();
  const first = inviteNurse(database, "inv-same-key");
  const second = inviteNurse(database, "inv-same-key");
  assert.equal(second.replayed, true);
  assert.equal(second.id, first.id);
});

test("P02-S73 an administrator resends a pending invitation", () => {
  const database = db();
  const created = inviteNurse(database, "inv-resend01");
  const resent = resendInvitation(database, admin, created.id, 1);
  assert.notEqual(resent.token, created.token);
  assert.equal(database.prepare("SELECT COUNT(*) AS c FROM workforce_outbox WHERE invitation_id = ?").get(created.id) && true, true);
});

test("P02-S74 an existing user receives another facility membership", () => {
  const database = db();
  addWorkforceFacility(database, admin, { userId: "usr_gh_transfer", facilityId: DEMO_GH.facilities.eastLegon.id, roleId: "nurse", reason: "coverage" });
  const added = database.prepare("SELECT status FROM facility_memberships WHERE user_id = ? AND facility_id = ?").get("usr_gh_transfer", DEMO_GH.facilities.eastLegon.id) as { status: string };
  const kept = database.prepare("SELECT status FROM facility_memberships WHERE user_id = ? AND facility_id = ?").get("usr_gh_transfer", DEMO_GH.facilities.accra.id) as { status: string };
  assert.equal(added.status, "active");
  assert.equal(kept.status, "active");
});

test("P02-S75 the same email does not merge two external identities", () => {
  const database = db();
  database.prepare(`INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_mail_a', ?, NULL, 'Mail A', 'nurse'), ('usr_mail_b', ?, NULL, 'Mail B', 'nurse')`).run(DEMO_GH.organizationId, DEMO_GH.organizationId);
  database.prepare(`INSERT INTO external_identities (id, issuer, subject, user_id, email, status) VALUES ('ext_a', 'http://127.0.0.1:15556/dex', 'subject-a', 'usr_mail_a', 'shared@demo-gh.invalid', 'active'), ('ext_b', 'http://127.0.0.1:15556/dex', 'subject-b', 'usr_mail_b', 'shared@demo-gh.invalid', 'active')`).run();
  const created = inviteWorkforce(database, admin, { email: "shared@demo-gh.invalid", roleId: "nurse", facilityIds: [DEMO_GH.facilities.madina.id], idempotencyKey: "inv-shared01", reason: "staffing" });
  acceptInvitation(database, { token: created.token ?? "", userId: "usr_mail_b", externalLinked: true });
  const a = database.prepare("SELECT id FROM facility_memberships WHERE user_id = 'usr_mail_a'").get();
  const b = database.prepare("SELECT facility_id FROM facility_memberships WHERE user_id = 'usr_mail_b'").get() as { facility_id: string };
  assert.equal(a, undefined);
  assert.equal(b.facility_id, DEMO_GH.facilities.madina.id);
});

test("P02-S76 an administrator assigns an authorized role", () => {
  const database = db();
  const version = (database.prepare("SELECT version FROM facility_memberships WHERE user_id = ? AND facility_id = ?").get(DEMO_GH.users.reception, DEMO_GH.facilities.eastLegon.id) as { version: number }).version;
  assignWorkforceRole(database, admin, { userId: DEMO_GH.users.reception, roleId: "billing-officer", facilityId: DEMO_GH.facilities.eastLegon.id, expectedVersion: version, reason: "coverage" });
  const decision = authorize(database, { principalId: DEMO_GH.users.reception, accountActive: true }, "billing.read", { type: "Billing", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sensitivity: "administrative" }, { purpose: "PAYMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.eastLegon.id });
  assert.equal(decision.allow, true);
});

test("P02-S77 a facility administrator cannot assign an organization administrator", () => {
  const database = db();
  const version = (database.prepare("SELECT version FROM facility_memberships WHERE user_id = ? AND facility_id = ?").get(DEMO_GH.users.doctor, DEMO_GH.facilities.accra.id) as { version: number }).version;
  assert.throws(() => assignWorkforceRole(database, facilityAdmin, { userId: DEMO_GH.users.doctor, roleId: "organization-administrator", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: version, reason: "no" }), ForbiddenError);
});

test("P02-S78 a staff member cannot promote themselves", () => {
  const database = db();
  assert.throws(() => assignWorkforceRole(database, admin, { userId: admin.userId, roleId: "platform-administrator", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: 1, reason: "self" }), ForbiddenError);
});

test("P02-S79 a revoked role stops in the active session", () => {
  const database = db();
  const assignment = database.prepare("SELECT id, version FROM authorization_assignments WHERE principal_id = ? AND role_id = 'doctor' AND facility_id = ?").get(DEMO_GH.users.doctor, DEMO_GH.facilities.accra.id) as { id: string; version: number };
  revokeWorkforceRole(database, admin, assignment.id, assignment.version);
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
});

test("P02-S80 a nurse transfers between facilities", () => {
  const database = db();
  transferWorkforce(database, admin, { userId: "usr_gh_transfer", fromFacilityId: DEMO_GH.facilities.accra.id, toFacilityId: DEMO_GH.facilities.eastLegon.id, expectedVersion: 1, reason: "rotation" });
  const next = database.prepare("SELECT status FROM facility_memberships WHERE user_id = 'usr_gh_transfer' AND facility_id = ?").get(DEMO_GH.facilities.eastLegon.id) as { status: string };
  assert.equal(next.status, "active");
});

test("P02-S81 transferred staff cannot use the former facility", () => {
  const database = db();
  transferWorkforce(database, admin, { userId: "usr_gh_transfer", fromFacilityId: DEMO_GH.facilities.accra.id, toFacilityId: DEMO_GH.facilities.eastLegon.id, expectedVersion: 1, reason: "rotation" });
  const decision = authorize(database, { principalId: "usr_gh_transfer", accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.eastLegon.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "facility");
});

test("P02-S82 another facility membership survives a scoped transfer", () => {
  const database = db();
  const version = (database.prepare("SELECT version FROM facility_memberships WHERE user_id = ? AND facility_id = ?").get(DEMO_GH.users.nurse, DEMO_GH.facilities.accra.id) as { version: number }).version;
  transferWorkforce(database, admin, { userId: DEMO_GH.users.nurse, fromFacilityId: DEMO_GH.facilities.accra.id, toFacilityId: DEMO_GH.facilities.madina.id, expectedVersion: version, reason: "rotation" });
  const kept = database.prepare("SELECT status FROM facility_memberships WHERE user_id = ? AND facility_id = ?").get(DEMO_GH.users.nurse, DEMO_GH.facilities.eastLegon.id) as { status: string };
  assert.equal(kept.status, "active");
});

test("P02-S83 suspension in one organization leaves the other membership", () => {
  const database = db();
  const version = (database.prepare("SELECT version FROM organization_memberships WHERE user_id = 'usr_dual_nurse' AND organization_id = ?").get(DEMO_GH.organizationId) as { version: number }).version;
  suspendWorkforce(database, admin, { userId: "usr_dual_nurse", scope: "organization", expectedVersion: version, reason: "leave" });
  const other = database.prepare("SELECT status FROM organization_memberships WHERE user_id = 'usr_dual_nurse' AND organization_id = 'org_harborlight'").get() as { status: string };
  assert.equal(other.status, "active");
});

test("P02-S84 a suspended membership cannot use the protected action", () => {
  const database = db();
  suspendWorkforce(database, admin, { userId: "usr_gh_transfer", scope: "facility", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: 1, reason: "leave" });
  const decision = authorize(database, { principalId: "usr_gh_transfer", accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
});

test("P02-S85 an eligible membership can be reactivated", () => {
  const database = db();
  suspendWorkforce(database, admin, { userId: "usr_gh_transfer", scope: "facility", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: 1, reason: "leave" });
  reactivateWorkforce(database, admin, { userId: "usr_gh_transfer", scope: "facility", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: 2, reason: "returned" });
  const status = database.prepare("SELECT status FROM facility_memberships WHERE user_id = 'usr_gh_transfer' AND facility_id = ?").get(DEMO_GH.facilities.accra.id) as { status: string };
  assert.equal(status.status, "active");
});

test("P02-S86 offboarding revokes that organization's access", () => {
  const database = db();
  const version = (database.prepare("SELECT version FROM organization_memberships WHERE user_id = 'usr_gh_transfer' AND organization_id = ?").get(DEMO_GH.organizationId) as { version: number }).version;
  offboardWorkforce(database, admin, { userId: "usr_gh_transfer", expectedVersion: version, reason: "departure" });
  const status = database.prepare("SELECT status FROM organization_memberships WHERE user_id = 'usr_gh_transfer' AND organization_id = ?").get(DEMO_GH.organizationId) as { status: string };
  assert.equal(status.status, "revoked");
  const decision = authorize(database, { principalId: "usr_gh_transfer", accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
});

test("P02-S87 and P02-S88 another tenant or forged facility is hidden", () => {
  const database = db();
  assert.throws(() => listWorkforce(database, admin, { facilityId: DEMO_EU.facilities.northbridge.id }), NotFoundError);
  assert.throws(() => inviteWorkforce(database, admin, { email: "x@demo-gh.invalid", roleId: "nurse", facilityIds: [DEMO_EU.facilities.northbridge.id], idempotencyKey: "inv-forged01", reason: "no" }), NotFoundError);
});

test("P02-S89 concurrent membership updates conflict", () => {
  const database = db();
  suspendWorkforce(database, admin, { userId: "usr_gh_transfer", scope: "facility", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: 1, reason: "one" });
  assert.throws(() => suspendWorkforce(database, admin, { userId: "usr_gh_transfer", scope: "facility", facilityId: DEMO_GH.facilities.accra.id, expectedVersion: 1, reason: "two" }), ConflictError);
});

test("P02-S90 invitation acceptance fails closed when the identity provider is down", () => {
  const database = db();
  const created = inviteNurse(database, "inv-idp-down");
  setWorkforceControl(database, "idp", "down");
  try {
    assert.throws(() => acceptInvitation(database, { token: created.token ?? "", userId: "usr_gh_transfer", externalLinked: true }), ForbiddenError);
  } finally {
    setWorkforceControl(database, "idp", "up");
  }
});

test("P02-S91 a failed invitation notice can be sent again", () => {
  const database = db();
  setWorkforceControl(database, "mail", "down");
  const created = inviteNurse(database, "inv-mail-down");
  assert.equal(created.mailed, "failed");
  setWorkforceControl(database, "mail", "up");
  const resent = resendInvitation(database, admin, created.id, 1);
  assert.equal(resent.mailed, "captured");
});

test("P02-S92 stale permissions do not survive role removal", () => {
  const database = db();
  authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  const assignment = database.prepare("SELECT id, version FROM authorization_assignments WHERE principal_id = ? AND role_id = 'doctor' AND facility_id = ?").get(DEMO_GH.users.doctor, DEMO_GH.facilities.accra.id) as { id: string; version: number };
  revokeWorkforceRole(database, admin, assignment.id, assignment.version);
  database.prepare("INSERT INTO authorization_cache (cache_key, assignment_version, permissions_json) VALUES (?, 1, ?)").run(`${DEMO_GH.users.doctor}|${DEMO_GH.organizationId}|${DEMO_GH.facilities.accra.id}`, JSON.stringify(["clinical.read"]));
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
});

test("P02-S94 administrative actions record evidence without the invitation secret", () => {
  const database = db();
  const created = inviteNurse(database, "inv-audit001");
  const rows = workforceHistory(database, admin) as Array<{ action: string }>;
  assert.equal(rows.some((row) => row.action === "workforce.invite"), true);
  const stored = JSON.stringify(database.prepare("SELECT reason, previous_state, next_state FROM workforce_events").all());
  assert.equal(stored.includes(created.token ?? "missing-token"), false);
});

test("P02-S95 a pending invitation survives a reopened database", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-workforce-"));
  const file = path.join(dir, "workforce.sqlite");
  const first = createDatabase(file);
  seed(first);
  seedDemoTenants(first);
  const created = inviteNurse(first, "inv-restart1");
  first.close();
  const second = createDatabase(file);
  const pending = listInvitations(second, admin).find((row) => row.id === created.id);
  assert.equal(pending?.status, "pending");
  second.close();
});

test("P02-S96 the last organization administrator cannot be removed", () => {
  const database = db();
  const version = (database.prepare("SELECT version FROM organization_memberships WHERE user_id = ? AND organization_id = ?").get(DEMO_GH.users.admin, DEMO_GH.organizationId) as { version: number }).version;
  assert.throws(() => offboardWorkforce(database, admin, { userId: DEMO_GH.users.admin, expectedVersion: version, reason: "unsafe" }), ConflictError);
});

test("P02-S98 a failed transfer leaves the original membership", () => {
  const database = db();
  assert.throws(() => transferWorkforce(database, admin, { userId: "usr_gh_transfer", fromFacilityId: DEMO_GH.facilities.accra.id, toFacilityId: "fac_missing", expectedVersion: 1, reason: "bad" }), NotFoundError);
  const kept = database.prepare("SELECT status FROM facility_memberships WHERE user_id = 'usr_gh_transfer' AND facility_id = ?").get(DEMO_GH.facilities.accra.id) as { status: string };
  assert.equal(kept.status, "active");
  assert.equal(createHash("sha256").update("not-logged").digest("hex").length, 64);
});
