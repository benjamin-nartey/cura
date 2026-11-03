import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError } from "../src/errors.ts";
import { submitOrder } from "../src/work.ts";

const [file, actorId, key, encounterId] = process.argv.slice(2);
const actor = {
  userId: actorId,
  organizationId: "org_demo_gh",
  facilityId: "fac_gh_accra",
  sessionId: `ses_${actorId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
};
const db = createDatabase(file);
db.exec("PRAGMA busy_timeout = 5000");
try {
  submitOrder(db, actor, {
    patientId: "pat_gh_kofi_a",
    encounterId,
    practitionerId: "pr_gh_kwame",
    code: "syn-cbc",
    departmentId: "dep_gh_madina_lab",
    priority: "routine",
    dueOn: "2026-10-22",
    idempotencyKey: key,
  });
  process.exitCode = 0;
} catch (error) {
  process.exitCode = error instanceof ConflictError ? 2 : 1;
  if (process.exitCode === 1) console.error(error);
} finally {
  db.close();
}
