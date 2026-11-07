import "./fixture-clock.ts";
import { createDatabase,get } from "../src/db.ts";
import { readSession } from "../src/session.ts";
import { processIntegrationBatch } from "../src/integration-batches.ts";
process.env.CURASPHERE_ENV="local";process.env.CURASPHERE_DEV_DIRECTORY="local-test";process.env.CURASPHERE_DATA_CLASS="synthetic";process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="true";
const [file,sid,id,mode,version,manifestHash]=process.argv.slice(2),db=createDatabase(file),ctx=readSession(db,sid)!;
if(mode==="crash"){const exec=db.exec.bind(db);db.exec=(sql:string)=>{exec(sql);if(sql==="COMMIT"&&get<{cursor:number}>(db,"SELECT cursor FROM integration_batches WHERE id=?",id)?.cursor===1){process.stdout.write("committed-one");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);}};}
try{processIntegrationBatch(db,ctx,{id,version:Number(version),cursor:0,limit:3,commandKey:mode==="crash"?"crash-page":`race-page-${process.pid}`,manifestHash,attested:true});process.stdout.write("processed");}catch{if(mode==="crash")process.exitCode=1;else process.stdout.write("conflict");}finally{db.close();}
