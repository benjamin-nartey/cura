import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError } from "../src/errors.ts";
import { arriveAppointment, cancelAppointment, requestAppointment, startVisitEncounter } from "../src/scheduling.ts";

const [file, op, actorId, key, extra = ""] = process.argv.slice(2);
const actor = {
  userId: actorId,
  organizationId: "org_demo_gh",
  facilityId: "fac_gh_accra",
  sessionId: `ses_${actorId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
};
const db = createDatabase(file);
db.exec("PRAGMA busy_timeout = 5000");
try {
  if (op === "request") {
    const startsAt = extra;
    requestAppointment(db, actor, {
      patientId: "pat_gh_kofi_a",
      practitionerId: "pr_gh_kwame",
      category: "follow-up",
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 20 * 60 * 1000).toISOString(),
      resourceId: "room_fac_gh_accra",
      idempotencyKey: key,
    });
  } else if (op === "start") startVisitEncounter(db, actor, extra, 3, key);
  else if (op === "arrive") arriveAppointment(db, actor, extra, 2);
  else if (op === "cancel") cancelAppointment(db, actor, extra, 2, "patient-request");
  else throw new Error("unknown");
  process.exitCode = 0;
} catch (error) {
  process.exitCode = error instanceof ConflictError ? 2 : 1;
} finally {
  db.close();
}
