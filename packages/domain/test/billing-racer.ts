import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { createCharge } from "../src/billing.ts";
import { DEMO_GH } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const [, , file, actorId, key, encounterId] = process.argv;
const db = createDatabase(file!);
db.exec("PRAGMA busy_timeout=5000");
createCharge(db, { userId: actorId!, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: `ses_race_${process.pid}` }, {
  patientId: "pat_gh_kofi_a",
  encounterId: encounterId!,
  catalogId: "cat_gh_consultation",
  quantity: 1,
  idempotencyKey: key!,
});
db.close();
process.exit(0);
