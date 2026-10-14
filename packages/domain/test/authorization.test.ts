import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assignRole,
  authorizationCount,
  authorize,
  decisionStatus,
  effectivePermissions,
  latestDecision,
  revokeRole,
  setAuthorizationDependency,
} from "../src/authorization.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError } from "../src/errors.ts";
import { openSession } from "../src/session.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, listTenancy, seedDemoTenants, switchFacility } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

const standard = { sensitivity: "standard" as const };
const treatment = { purpose: "TREATMENT", assurance: "directory", sessionActive: true };

test("P02-S37 an organization administrator can read organization settings", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.admin, accountActive: true }, "organization.read", { type: "Organization", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "OPERATIONS", assurance: "directory", sessionActive: true });
  assert.equal(decision.allow, true);
  assert.equal(decisionStatus(decision), 200);
  assert.equal(latestDecision(database, DEMO_GH.users.admin)?.decision, "allow");
});

test("P02-S38 a receptionist cannot administer security roles", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.reception, accountActive: true }, "security.role.manage", { type: "Role", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.eastLegon.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "permission");
  assert.equal(decisionStatus(decision), 403);
});

test("P02-S39 a doctor can read a permitted synthetic clinical resource", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, true);
});

test("P02-S40 a nurse cannot perform a privileged security action", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.nurse, accountActive: true }, "security.role.manage", { type: "Role", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "permission");
});

test("P02-S41 a laboratory user cannot adjust billing", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.laboratory, accountActive: true }, "billing.adjust", { type: "Billing", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.madina.id, ...standard }, { purpose: "PAYMENT", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.madina.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "unimplemented");
});

test("P02-S42 a single-facility staff member cannot read another facility", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.reception, accountActive: true }, "facility.read", { type: "Facility", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { purpose: "OPERATIONS", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.eastLegon.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "facility");
});

test("P02-S43 a multi-facility nurse sees only the facility after an authorized switch", () => {
  const database = db();
  const sessionId = openSession(database, DEMO_GH.users.nurse).sessionId;
  const current = listTenancy(database, sessionId, new Headers());
  const moved = switchFacility(database, sessionId, DEMO_GH.facilities.eastLegon.id, current.version);
  assert.equal(moved.facilityId, DEMO_GH.facilities.eastLegon.id);
  const allowed = authorize(database, { principalId: DEMO_GH.users.nurse, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, ...standard }, { ...treatment, activeFacilityId: moved.facilityId });
  const third = authorize(database, { principalId: DEMO_GH.users.nurse, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.madina.id, ...standard }, { ...treatment, activeFacilityId: moved.facilityId });
  assert.equal(allowed.allow, true);
  assert.equal(third.allow, false);
  assert.equal(third.reason, "facility");
});

test("P02-S44 a Ghana user guessing a European resource gets a generic denial", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "tenant");
  assert.equal(decisionStatus(decision, "object"), 404);
  const evidence = latestDecision(database, DEMO_GH.users.doctor);
  assert.equal(evidence?.scope_organization_id, null);
  assert.equal(JSON.stringify(evidence).includes(DEMO_EU.organizationId), false);
});

test("P02-S45 a forged role name does not grant authority", () => {
  const database = db();
  const before = effectivePermissions(database, DEMO_GH.users.reception, DEMO_GH.organizationId, DEMO_GH.facilities.eastLegon.id);
  const decision = authorize(database, { principalId: DEMO_GH.users.reception, accountActive: true }, "security.role.manage", { type: "Role", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "ADMINISTRATION", assurance: "mfa", sessionActive: true });
  assert.equal(before.roles.includes("platform-administrator"), false);
  assert.equal(decision.allow, false);
});

test("P02-S46 a user cannot assign a higher role to themselves", () => {
  const database = db();
  const actor = { sessionId: "ses_test", userId: DEMO_GH.users.admin, displayName: "Ama Mensah", role: "admin" as const, purposeOfUse: "OPERATIONS" as const, organizationId: DEMO_GH.organizationId, organizationName: "DEMO_GH", facilityId: DEMO_GH.facilities.accra.id, facilityName: "Accra Central Medical Centre" };
  assert.throws(() => assignRole(database, actor, { principalId: actor.userId, roleId: "platform-administrator", expectedVersion: 0 }), ForbiddenError);
});

test("P02-S47 a revoked role stops working in the same session", () => {
  const database = db();
  revokeRole(database, "test", DEMO_GH.users.doctor, "doctor", DEMO_GH.organizationId, DEMO_GH.facilities.accra.id);
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "permission");
});

test("P02-S48 an explicit deny overrides a granted permission", () => {
  const database = db();
  database.prepare(
    `INSERT INTO authorization_policies (id, version, scope, conditions_json, effect, status, approved_at, effective_from, effective_until)
     VALUES ('p02-deny-medication', 1, 'organization', ?, 'deny', 'active', NULL, ?, NULL)`,
  ).run(JSON.stringify({ principalId: DEMO_GH.users.doctor, action: "medication.read" }), new Date().toISOString());
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "medication.read", { type: "Medication", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "deny-override");
});

test("P02-S49 an unapproved purpose fails closed", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { purpose: "RESEARCH", assurance: "mfa", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "purpose-denied");
});

test("P02-S50 role administration without MFA is denied", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.admin, accountActive: true }, "security.role.manage", { type: "Role", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { purpose: "ADMINISTRATION", assurance: "password", sessionActive: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "assurance-required");
});

test("P02-S51 a confidential resource is denied without confidential authorization", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "confidential" }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "confidential");
});

test("P02-S52 bulk enumeration is denied", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.admin, accountActive: true }, "organization.read", { type: "Organization", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "OPERATIONS", assurance: "directory", sessionActive: true, bulk: true });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "bulk");
});

test("P02-S53 a forged service delegation is rejected", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.servicePrincipalId, accountActive: true }, "organization.read", { type: "Organization", organizationId: DEMO_EU.organizationId, ...standard }, { purpose: "ADMINISTRATION", assurance: "service", sessionActive: true, forwardedUserId: DEMO_EU.users.admin });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "delegation");
  const own = authorize(database, { principalId: DEMO_GH.servicePrincipalId, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "ADMINISTRATION", assurance: "service", sessionActive: true });
  assert.equal(own.allow, false);
});

test("P02-S54 an unavailable policy store fails closed", () => {
  const database = db();
  setAuthorizationDependency(database, "unavailable");
  try {
    const decision = authorize(database, { principalId: DEMO_GH.users.admin, accountActive: true }, "organization.read", { type: "Organization", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "OPERATIONS", assurance: "mfa", sessionActive: true });
    assert.equal(decision.allow, false);
    assert.equal(decision.reason, "policy-unavailable");
  } finally {
    setAuthorizationDependency(database, "available");
  }
});

test("P02-S55 concurrent role changes conflict on version", () => {
  const database = db();
  const actor = { sessionId: "ses_test", userId: DEMO_GH.users.admin, displayName: "Ama Mensah", role: "admin" as const, purposeOfUse: "OPERATIONS" as const, organizationId: DEMO_GH.organizationId, organizationName: "DEMO_GH", facilityId: DEMO_GH.facilities.accra.id, facilityName: "Accra" };
  assignRole(database, actor, { principalId: DEMO_GH.users.reception, roleId: "billing-officer", facilityId: DEMO_GH.facilities.eastLegon.id, expectedVersion: 0 });
  assert.throws(() => assignRole(database, actor, { principalId: DEMO_GH.users.reception, roleId: "billing-officer", facilityId: DEMO_GH.facilities.eastLegon.id, expectedVersion: 0 }), ConflictError);
});

test("P02-S56 a stale permission cache cannot restore a revoked grant", () => {
  const database = db();
  const principal = DEMO_GH.users.doctor;
  authorize(database, { principalId: principal, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  revokeRole(database, "test", principal, "doctor", DEMO_GH.organizationId, DEMO_GH.facilities.accra.id);
  database.prepare(`INSERT INTO authorization_cache (cache_key, assignment_version, permissions_json) VALUES (?, 1, ?)`).run(
    `${principal}|${DEMO_GH.organizationId}|${DEMO_GH.facilities.accra.id}`,
    JSON.stringify(["clinical.read"]),
  );
  const decision = authorize(database, { principalId: principal, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
});

test("P02-S57 a denial records safe evidence", () => {
  const database = db();
  authorize(database, { principalId: DEMO_GH.users.reception, accountActive: true }, "security.role.read", { type: "Role", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, ...standard }, { purpose: "OPERATIONS", assurance: "directory", sessionActive: true, activeFacilityId: DEMO_GH.facilities.eastLegon.id });
  const evidence = latestDecision(database, DEMO_GH.users.reception);
  assert.equal(evidence?.decision, "deny");
  assert.equal(evidence?.reason, "permission");
  assert.equal(evidence?.policy_id, "p02-rbac-2026.10");
  assert.ok(authorizationCount(database, "deny") >= 1);
});

test("P02-S60 authorization survives a reopened database", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-authz-"));
  const file = path.join(dir, "authz.sqlite");
  const first = createDatabase(file);
  seed(first);
  seedDemoTenants(first);
  first.close();
  const second = createDatabase(file);
  const decision = authorize(second, { principalId: DEMO_GH.users.admin, accountActive: true }, "organization.manage", { type: "Organization", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "OPERATIONS", assurance: "directory", sessionActive: true });
  assert.equal(decision.allow, true);
  second.close();
});

test("P02-S61 an unimplemented clinical signature stays denied", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.sign", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, assurance: "mfa", activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "unimplemented");
});

test("P02-S62 emergency elevation is rejected", () => {
  const database = db();
  const decision = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard }, { ...treatment, emergency: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "emergency-disabled");
});

test("P02-F03 missing classification, relationship, integrity, and evaluation latency", () => {
  const database = db();
  const missing = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: null }, { ...treatment, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(missing.reason, "classification-missing");
  const unrelated = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard, relationship: "required" }, { ...treatment, relationshipAssigned: false, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(unrelated.reason, "relationship-required");
  const related = authorize(database, { principalId: DEMO_GH.users.doctor, accountActive: true }, "clinical.read", { type: "ClinicalNote", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, ...standard, relationship: "required" }, { ...treatment, relationshipAssigned: true, activeFacilityId: DEMO_GH.facilities.accra.id });
  assert.equal(related.allow, true);
  assert.throws(() => database.prepare(`INSERT INTO authorization_role_permissions (role_id, permission_id) VALUES ('doctor', 'not-a-permission')`).run());
  const started = Date.now();
  for (let i = 0; i < 100; i += 1) {
    authorize(database, { principalId: DEMO_GH.users.admin, accountActive: true }, "organization.read", { type: "Organization", organizationId: DEMO_GH.organizationId, ...standard }, { purpose: "OPERATIONS", assurance: "directory", sessionActive: true });
  }
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `authorization loop took ${elapsed}ms`);
});
