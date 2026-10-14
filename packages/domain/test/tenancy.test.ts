import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/errors.ts";
import { createDatabase } from "../src/db.ts";
import { openSession } from "../src/session.ts";
import {
  DEMO_EU,
  DEMO_GH,
  disableOrganization,
  listTenancy,
  readServicePrincipal,
  readTenantOrganization,
  seedDemoTenants,
  setTenancyDependency,
  switchFacility,
} from "../src/tenancy.ts";

function workspace() {
  const db = createDatabase(":memory:");
  seedDemoTenants(db);
  return db;
}

function sign(db: ReturnType<typeof workspace>, userId: string) {
  return openSession(db, userId).sessionId;
}

test("P02-S01 a Ghana administrator sees only DEMO_GH facilities", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_GH.users.admin);
  const view = listTenancy(db, sessionId, new Headers());
  assert.equal(view.organizationId, DEMO_GH.organizationId);
  assert.deepEqual(
    view.facilities.map((facility) => facility.name),
    ["Accra Central Medical Centre"],
  );
  assert.equal(view.organizations.some((org) => org.id === DEMO_EU.organizationId), false);
});

test("P02-S02 a user with no active membership sees an empty directory", () => {
  const db = createDatabase(":memory:");
  db.exec(
    `INSERT INTO organizations (id, name, status) VALUES ('org_empty', 'Empty', 'active');
     INSERT INTO users (id, organization_id, facility_id, display_name, role)
     VALUES ('usr_empty', 'org_empty', NULL, 'Empty Admin', 'admin');
     INSERT INTO organization_memberships (id, organization_id, user_id, status, version)
     VALUES ('om_empty', 'org_empty', 'usr_empty', 'revoked', 1);`,
  );
  const sessionId = sign(db, "usr_empty");
  assert.throws(() => listTenancy(db, sessionId, new Headers()), NotFoundError);
  const names = db.prepare("SELECT name FROM organizations").all() as Array<{ name: string }>;
  assert.deepEqual(names.map((row) => row.name), ["Empty"]);
});

test("P02-S03 a blank facility id is rejected", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_GH.users.nurse);
  const view = listTenancy(db, sessionId, new Headers());
  assert.throws(() => switchFacility(db, sessionId, "  ", view.version), /Choose a facility/);
});

test("P02-S04 guessing the other tenant returns no metadata", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_GH.users.doctor);
  assert.throws(() => readTenantOrganization(db, sessionId, DEMO_EU.organizationId), (error: unknown) => {
    assert.ok(error instanceof NotFoundError);
    assert.equal(error.message.includes("Northbridge"), false);
    assert.equal(error.message.includes(DEMO_EU.organizationId), false);
    assert.equal(error.message.includes("Riverside"), false);
    return true;
  });
  assert.throws(() => readServicePrincipal(db, sessionId, DEMO_EU.servicePrincipalId), NotFoundError);
  const view = listTenancy(db, sessionId, new Headers());
  assert.throws(() => switchFacility(db, sessionId, DEMO_EU.facilities.riverside.id, view.version), (error: unknown) => {
    assert.ok(error instanceof NotFoundError);
    assert.equal(error.message.includes("Riverside"), false);
    return true;
  });
  const leaked = db.prepare("SELECT COUNT(*) AS c FROM audit_events WHERE resource_id = ?").get(DEMO_EU.organizationId) as { c: number };
  assert.equal(leaked.c, 0);
});

test("P02-S05 a tampered organization header is ignored and denied", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_GH.users.admin);
  const headers = new Headers({ "x-organization-id": DEMO_EU.organizationId });
  assert.throws(() => listTenancy(db, sessionId, headers), (error: unknown) => {
    assert.ok(error instanceof ForbiddenError);
    assert.equal(error.message.includes(DEMO_EU.organizationId), false);
    return true;
  });
});

test("P02-S06 the same facility switch is idempotent and a stale version conflicts", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_GH.users.nurse);
  const first = listTenancy(db, sessionId, new Headers());
  const again = switchFacility(db, sessionId, first.facilityId ?? "", first.version);
  assert.equal(again.version, first.version);
  assert.throws(() => switchFacility(db, sessionId, DEMO_GH.facilities.eastLegon.id, first.version - 1), ConflictError);
  const moved = switchFacility(db, sessionId, DEMO_GH.facilities.eastLegon.id, first.version);
  assert.equal(moved.facilityId, DEMO_GH.facilities.eastLegon.id);
  assert.equal(moved.facilityName, "East Legon Family Clinic");
});

test("P02-S07 a directory outage fails closed and then recovers", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_EU.users.admin);
  setTenancyDependency(db, "unavailable");
  assert.throws(() => listTenancy(db, sessionId, new Headers()), ForbiddenError);
  setTenancyDependency(db, null);
  const view = listTenancy(db, sessionId, new Headers());
  assert.equal(view.organizationName, "DEMO_EU");
});

test("P02-S08 a disabled organization cannot stay active", () => {
  const db = workspace();
  const sessionId = sign(db, DEMO_GH.users.admin);
  listTenancy(db, sessionId, new Headers());
  disableOrganization(db, DEMO_GH.organizationId);
  assert.throws(() => listTenancy(db, sessionId, new Headers()), ForbiddenError);
});

test("P02-S09 context survives a reopened database file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-tenancy-"));
  const file = path.join(dir, "tenancy.sqlite");
  const first = createDatabase(file);
  seedDemoTenants(first);
  const sessionId = sign(first, DEMO_EU.users.nurse);
  listTenancy(first, sessionId, new Headers());
  first.close();
  const second = createDatabase(file);
  const view = listTenancy(second, sessionId, new Headers());
  assert.equal(view.facilityName, "Riverside Specialist Clinic");
  assert.equal(view.organizations.some((org) => org.name === "DEMO_GH"), false);
  second.close();
});
