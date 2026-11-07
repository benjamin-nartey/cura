import { getDb,integrationSessionForDelivery,listIntegrationDeliveryCandidates,deliverIntegrationMessage,readSession } from "@curasphere/domain";
import { readFoundationSession } from "../../apps/web/lib/foundation.ts";
// One bounded batch. An operator may schedule this command; no implicit background process.
const db=getDb();let processed=0;const statuses:Record<string,number>={};
try{for(const id of listIntegrationDeliveryCandidates(db)){const sessionId=integrationSessionForDelivery(db,id);const ctx=!sessionId?null:sessionId.startsWith("ses_")?await readFoundationSession(sessionId):readSession(db,sessionId);const result=await deliverIntegrationMessage(db,id,ctx);statuses[result.status]=(statuses[result.status]??0)+1;processed++;}process.stdout.write(JSON.stringify({processed,statuses})+"\n");}catch{process.stderr.write("Partner worker unavailable. Restore dependencies and inspect the scoped queue.\n");process.exitCode=1;}finally{db.close();}
