import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assertLocalHealthcareSandbox,signIntegrationMessage,signIntegrationBatch } from "@curasphere/domain";
assertLocalHealthcareSandbox();const origin=new URL(process.env.CURASPHERE_PARTNER_TARGET??"http://127.0.0.1:3000");if(origin.origin!==origin.href.slice(0,-1)||origin.hostname!=="127.0.0.1"||origin.protocol!=="http:")throw new Error("Use the isolated local workspace origin.");
const id=process.env.CURASPHERE_PARTNER_CONNECTION,secret=process.env.CURASPHERE_PARTNER_SECRET,file=process.argv[2];if(!id||!secret||!file)throw new Error("Configure connection/key and supply the synthetic JSON file.");
const raw=readFileSync(file,"utf-8");if(Buffer.byteLength(raw)>65536)throw new Error("Message exceeds 64 KiB.");const timestamp=String(Date.now()),messageId=process.env.CURASPHERE_PARTNER_MESSAGE??`partner-${randomUUID()}`;
const batch=process.env.CURASPHERE_PARTNER_BATCH==="true";
const response=await fetch(`${origin.origin}/api/integrations/partners/${encodeURIComponent(id)}/${batch?"batches":"messages"}`,{method:"POST",headers:{"content-type":"application/json","x-curasphere-message":messageId,"x-curasphere-timestamp":timestamp,"x-curasphere-signature":(batch?signIntegrationBatch:signIntegrationMessage)(secret,id,messageId,timestamp,raw)},body:raw,signal:AbortSignal.timeout(5000),redirect:"error"});const result=await response.json();process.stdout.write(JSON.stringify({httpStatus:response.status,...result})+"\n");if(!response.ok)process.exitCode=1;
