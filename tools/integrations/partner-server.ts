import { createServer } from "node:http";
import { createHash,timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname,resolve } from "node:path";
import { assertLocalHealthcareSandbox,parseIntegrationObservation,signIntegrationMessage } from "@curasphere/domain";
assertLocalHealthcareSandbox();
const connectionId=process.env.CURASPHERE_PARTNER_CONNECTION,secret=process.env.CURASPHERE_PARTNER_SECRET,port=Number(process.env.CURASPHERE_PARTNER_PORT??19291);
if(!connectionId||!secret||!/^[a-f0-9]{64}$/.test(secret)||!Number.isSafeInteger(port)||port<1024||[3000,8081,8082,15556].includes(port))throw new Error("Configure a registered synthetic partner connection, signing key and dedicated port.");
const file=resolve(process.env.CURASPHERE_PARTNER_DATABASE??"data/partner-simulation.sqlite");mkdirSync(dirname(file),{recursive:true});const db=new DatabaseSync(file);db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS receipts(connection_id TEXT,message_id TEXT,body_hash TEXT,payload TEXT,PRIMARY KEY(connection_id,message_id))");
const server=createServer(async(request,response)=>{const reply=(status:number)=>{response.writeHead(status,{"cache-control":"no-store"});response.end();};try{
 if(request.method!=="POST"||request.url!=="/curasphere/webhook"){reply(404);return;}let size=0;const parts:Buffer[]=[];for await(const chunk of request){size+=chunk.length;if(size>65536){reply(413);return;}parts.push(Buffer.from(chunk));}
 const body=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts)),id=String(request.headers["x-curasphere-message"]??""),timestamp=String(request.headers["x-curasphere-timestamp"]??""),signature=String(request.headers["x-curasphere-signature"]??"");
 if(request.headers.cookie||request.headers.origin||request.headers["x-curasphere-connection"]!==connectionId||!/^[\w.-]{1,80}$/.test(id)||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(signIntegrationMessage(secret,connectionId,id,timestamp,body),"hex"))){reply(403);return;}
 parseIntegrationObservation(body);const hash=createHash("sha256").update(body).digest("hex");db.exec("BEGIN IMMEDIATE");try{const prior=db.prepare("SELECT body_hash FROM receipts WHERE connection_id=? AND message_id=?").get(connectionId,id) as {body_hash:string}|undefined;if(prior&&prior.body_hash!==hash){db.exec("ROLLBACK");reply(409);return;}db.prepare("INSERT OR IGNORE INTO receipts VALUES(?,?,?,?)").run(connectionId,id,hash,body);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}reply(204);
 }catch{reply(422);}});
server.requestTimeout=5000;server.headersTimeout=5000;server.listen(port,"127.0.0.1",()=>process.stdout.write(`Synthetic partner receiver ready on loopback port ${port}.\n`));
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{server.closeAllConnections();server.close(()=>{db.close();process.exit(0);});});
