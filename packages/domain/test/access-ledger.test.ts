import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { SessionContext } from "@curasphere/contracts";
import { appendAccessLedger, LEDGER_ROLLBACK, listAccessLedger, metadataHash, verifyAccessLedger } from "../src/access-ledger.ts";
import { writeAudit } from "../src/audit.ts";
import { createDatabase } from "../src/db.ts";
import { emergencyEligibility, SYNTHETIC_RESOURCE_ID } from "../src/emergency.ts";
import { ForbiddenError, ValidationError } from "../src/errors.ts";
import { healthcheck } from "../src/chart.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const reviewer = {
  userId: "usr_gh_reviewer",
  organizationId: DEMO_GH.organizationId,
  facilityId: null as string | null,
};
const doctor = {
  userId: DEMO_GH.users.doctor,
  organizationId: DEMO_GH.organizationId,
  facilityId: DEMO_GH.facilities.accra.id,
};

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

function entry(organizationId: string, action: string) {
  return {
    organizationId,
    facilityId: DEMO_GH.facilities.accra.id,
    actorId: reviewer.userId,
    subjectId: "syn_kojo_agyeman",
    action,
    resourceType: "SyntheticRestrictedRecord",
    resourceId: SYNTHETIC_RESOURCE_ID,
    purpose: "AUDIT",
    outcome: "success",
    correlationId: "corr_ledger",
    before: null,
    after: { resourceType: "SyntheticRestrictedRecord", resourceId: SYNTHETIC_RESOURCE_ID, version: "1", fields: ["outcome"] },
  };
}

test("P03-S01 a new database carries the sealed access ledger", () => {
  const database = db();
  assert.equal(healthcheck(database).schemaVersion, 43);
  const first = appendAccessLedger(database, entry(DEMO_GH.organizationId, "synthetic.read"));
  const second = appendAccessLedger(database, entry(DEMO_GH.organizationId, "ai.tool"));
  assert.equal(first.previousHash, "ledger-genesis");
  assert.equal(second.previousHash, first.entryHash);
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  assert.equal(JSON.stringify(first).includes("Kojo"), false);
});

test("P03-S02 alteration is rejected and a removed seal is detectable", () => {
  const database = db();
  const first = appendAccessLedger(database, entry(DEMO_GH.organizationId, "synthetic.read"));
  assert.throws(() => database.prepare("UPDATE access_ledger SET outcome = 'denied' WHERE id = ?").run(first.id), /ledger-sealed/);
  assert.throws(() => database.prepare("DELETE FROM access_ledger WHERE id = ?").run(first.id), /ledger-sealed/);
  database.exec("DROP TRIGGER access_ledger_no_update");
  database.prepare("UPDATE access_ledger SET outcome = 'denied' WHERE id = ?").run(first.id);
  const verified = verifyAccessLedger(database, DEMO_GH.organizationId);
  assert.equal(verified.intact, false);
  assert.equal(verified.sequence, 1);
});

test("P03-S03 ledger queries respect audit privilege and tenant boundaries", () => {
  const database = db();
  appendAccessLedger(database, entry(DEMO_GH.organizationId, "synthetic.read"));
  appendAccessLedger(database, { ...entry(DEMO_EU.organizationId, "synthetic.read"), facilityId: DEMO_EU.facilities.northbridge.id, actorId: DEMO_EU.users.admin });
  const visible = listAccessLedger(database, reviewer);
  assert.equal(visible.intact, true);
  assert.equal(visible.entries.every((item) => item.organizationId === DEMO_GH.organizationId), true);
  assert.throws(() => listAccessLedger(database, doctor), ForbiddenError);
  assert.throws(() => listAccessLedger(database, { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: null }), ForbiddenError);
  assert.throws(() => listAccessLedger(database, { ...reviewer, organizationId: DEMO_EU.organizationId }), ForbiddenError);
});

test("P03-S04 descriptive text and names stay out of the ledger", () => {
  const database = db();
  assert.throws(
    () => metadataHash({ resourceType: "Observation", resourceId: "obs_1", version: "1", fields: ["chest pain"] }),
    ValidationError,
  );
  assert.throws(
    () => appendAccessLedger(database, { ...entry(DEMO_GH.organizationId, "patient.read"), subjectId: "Kojo Agyeman" }),
    ValidationError,
  );
  const ctx: SessionContext = {
    sessionId: "ses_ledger",
    userId: reviewer.userId,
    displayName: "Esi Boateng",
    role: "auditor",
    purposeOfUse: "AUDIT",
    organizationId: DEMO_GH.organizationId,
    organizationName: "DEMO_GH",
    facilityId: null,
    facilityName: null,
  };
  writeAudit(database, ctx, { action: "audit.read", resourceType: "AuditEvent", resourceId: null, outcome: "success" });
  const stored = JSON.stringify(database.prepare("SELECT * FROM access_ledger").all());
  assert.equal(stored.includes("Esi Boateng"), false);
  assert.equal(stored.includes("chest pain"), false);
});

test("P03-S05 the local override does not grant audit access or production emergency access", () => {
  const database = db();
  process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE = "true";
  process.env.CURASPHERE_ENV = "local";
  process.env.CURASPHERE_DATA_CLASS = "synthetic";
  assert.throws(() => listAccessLedger(database, doctor), ForbiddenError);
  process.env.CURASPHERE_ENV = "production";
  try {
    assert.equal(
      emergencyEligibility(database, { userId: doctor.userId, sessionId: "ses_ledger", organizationId: doctor.organizationId, facilityId: doctor.facilityId }, SYNTHETIC_RESOURCE_ID).eligible,
      false,
    );
  } finally {
    delete process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE;
    delete process.env.CURASPHERE_ENV;
    delete process.env.CURASPHERE_DATA_CLASS;
  }
});

test("P03-S06 ledger rollback returns to schema 32 and the next open upgrades again", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-ledger-"));
  const file = path.join(dir, "chart.sqlite");
  const database = createDatabase(file);
  database.exec(LEDGER_ROLLBACK);
  const rolled = database.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: number };
  assert.equal(rolled.version, 32);
  database.close();
  const upgraded = createDatabase(file);
  assert.equal(healthcheck(upgraded).schemaVersion, 43);
  assert.equal(verifyAccessLedger(upgraded, DEMO_GH.organizationId).intact, true);
  upgraded.close();
});
