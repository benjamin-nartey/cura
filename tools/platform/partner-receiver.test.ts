import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn,type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync,readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { signIntegrationMessage } from "@curasphere/domain";
test("shipped partner receiver persists deduplication across actual process restart",async()=>{
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,"127.0.0.1",resolve));const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const file=join(mkdtempSync(join(tmpdir(),"cura-partner-receiver-")),"receiver.sqlite"),connection="icn_synthetic_receiver",secret="a".repeat(64),body=readFileSync(new URL("../integrations/fixtures/temperature.json",import.meta.url),"utf-8"),env={...process.env,CURASPHERE_ENV:"local",CURASPHERE_DEV_DIRECTORY:"local-test",CURASPHERE_DATA_CLASS:"synthetic",CURASPHERE_LOCAL_PHASE_OVERRIDE:"true",CURASPHERE_PARTNER_CONNECTION:connection,CURASPHERE_PARTNER_SECRET:secret,CURASPHERE_PARTNER_PORT:String(port),CURASPHERE_PARTNER_DATABASE:file};
 async function start(){const child=spawn(process.execPath,["--import","tsx",fileURLToPath(new URL("../integrations/partner-server.ts",import.meta.url))],{env,windowsHide:true});await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(new Error("Receiver startup timeout"));},45000);child.stdout.on("data",chunk=>{if(String(chunk).includes("receiver ready")){clearTimeout(timeout);resolve();}});child.on("error",reject);child.on("exit",()=>{clearTimeout(timeout);reject(new Error("Receiver exited before startup"));});});return child;}
 async function stop(child:ChildProcess){const ended=once(child,"exit");child.kill();await ended;}
 async function send(raw=body,signed=true){const timestamp=String(Date.now()),message="receiver-message-1";return fetch(`http://127.0.0.1:${port}/curasphere/webhook`,{method:"POST",headers:{"content-type":"application/json","x-curasphere-connection":connection,"x-curasphere-message":message,"x-curasphere-timestamp":timestamp,"x-curasphere-signature":signed?signIntegrationMessage(secret,connection,message,timestamp,raw):"0".repeat(64)},body:raw,signal:AbortSignal.timeout(3000)});}
 let child=await start();try{assert.equal((await send(body,false)).status,403);assert.equal((await send()).status,204);assert.equal((await send()).status,204);await stop(child);child=await start();assert.equal((await send()).status,204);assert.equal((await send(body.replace('37.3','37.4'))).status,409);}finally{await stop(child);}const db=new DatabaseSync(file);assert.equal((db.prepare("SELECT COUNT(*) n FROM receipts").get() as {n:number}).n,1);assert.equal((db.prepare("SELECT payload FROM receipts").get() as {payload:string}).payload,body);db.close();
});
