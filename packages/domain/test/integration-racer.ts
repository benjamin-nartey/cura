import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { readSession } from "../src/session.ts";
import { reviewIntegrationImport } from "../src/integrations.ts";
process.env.CURASPHERE_ENV="local";process.env.CURASPHERE_DEV_DIRECTORY="local-test";process.env.CURASPHERE_DATA_CLASS="synthetic";process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="true";
const [file,sessionId,receipt]=process.argv.slice(2),db=createDatabase(file),ctx=readSession(db,sessionId);if(!ctx)throw new Error("Missing synthetic session");const result=reviewIntegrationImport(db,ctx,receipt,true);process.stdout.write(result.idempotent?"replayed":"applied");db.close();
