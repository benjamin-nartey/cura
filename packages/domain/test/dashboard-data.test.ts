import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, get, run } from "../src/db.ts";
import { seed } from "../src/seed.ts";
import { DEMO_GH, DEMO_EU, seedDemoTenants } from "../src/tenancy.ts";
import { openSession, readSession } from "../src/session.ts";
import { ForbiddenError } from "../src/errors.ts";
import { readDashboard } from "../src/dashboard.ts";
import { listMasterPatients } from "../src/master-records.ts";

function workspace(userId = DEMO_GH.users.doctor) {
  const db = createDatabase(":memory:");
  seed(db);
  seedDemoTenants(db);
  const ctx = readSession(db, openSession(db, userId).sessionId)!;
  return { db, ctx };
}

test("dashboard counts the same patient records as the directory and links to their charts", () => {
  const { db, ctx } = workspace();
  try {
    const view = readDashboard(db, ctx);
    const patients = listMasterPatients(db, ctx);
    assert.ok(patients.length > 0);
    assert.equal(view.metrics.find(m => m.label === "Patients")?.count, patients.length);
    assert.deepEqual(view.rows.map(r => r.id).sort(), patients.map(p => p.id).sort());
    assert.ok(view.rows.every(r => r.href === `/patients/${r.id}/chart`));
    assert.ok(view.rows.every(r => !r.id.startsWith("pat_eu_")));
    const observations = get<{ c: number }>(db, "SELECT COUNT(*) c FROM source_observations WHERE organization_id = ? AND facility_id = ? AND status != 'entered-in-error'", ctx.organizationId, ctx.facilityId)!.c;
    assert.equal(view.metrics.find(m => m.label === "Results")?.count, Number(observations));
    assert.ok(!view.metrics.some(m => m.label === "Charges"));
  } finally { db.close(); }
});

test("dashboard aggregates current visit records without mixing foundation or legacy encounters", () => {
  const { db, ctx } = workspace();
  try {
    const expected = get<{ c: number }>(db, "SELECT COUNT(*) c FROM visit_encounters WHERE organization_id = ? AND facility_id = ? AND status = 'in-progress'", ctx.organizationId, ctx.facilityId)!.c;
    assert.equal(readDashboard(db, ctx).metrics.find(m => m.label === "Open encounters")?.count, Number(expected));
    const other = readSession(db, openSession(db, DEMO_EU.users.doctor).sessionId)!;
    assert.ok(readDashboard(db, other).rows.every(r => !r.id.startsWith("pat_gh_")));
    run(db, "UPDATE users SET account_status = 'suspended' WHERE id = ?", ctx.userId);
    assert.throws(() => readDashboard(db, ctx), ForbiddenError);
  } finally { db.close(); }
});
