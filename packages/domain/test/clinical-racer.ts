import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError } from "../src/errors.ts";
import { correctObservation } from "../src/clinical-source.ts";

const [file, id, actorId, key, value] = process.argv.slice(2);
const actor = {
  userId: actorId,
  organizationId: "org_demo_gh",
  facilityId: "fac_gh_accra",
  sessionId: `ses_${actorId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
};
const db = createDatabase(file);
db.exec("PRAGMA busy_timeout = 5000");
try {
  correctObservation(db, actor, id, { expectedVersion: 1, valueQuantity: Number(value), reason: "entry-error", idempotencyKey: key });
  process.exitCode = 0;
} catch (error) {
  process.exitCode = error instanceof ConflictError ? 2 : 1;
  if (process.exitCode === 1) console.error(error);
} finally {
  db.close();
}
