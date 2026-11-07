import "./fixture-clock.ts";
import { writeFileSync,readFileSync } from "node:fs";
import { createDatabase } from "../src/db";
import { processTimelineProjection } from "../src/timeline-projection";
const [file,contextFile,mode,marker]=process.argv.slice(2),ctx=JSON.parse(readFileSync(contextFile,"utf8")),db=createDatabase(file);
if(mode==="crash"){const prepare=db.prepare.bind(db);db.prepare=((sql:string)=>{const statement=prepare(sql);if(sql.startsWith("INSERT INTO timeline_projection_events")){const execute=statement.run.bind(statement);statement.run=((...args:Parameters<typeof execute>)=>{const result=execute(...args);writeFileSync(marker,"uncommitted-derived-row");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);return result;}) as typeof statement.run;}return statement;}) as typeof db.prepare;}
try{const result=processTimelineProjection(db,ctx,"pat_gh_kofi_a",{action:mode==="crash"?"rebuild":"process",commandKey:mode==="crash"?"crash-command-001":"race-command-001",limit:50});process.stdout.write(JSON.stringify(result)+"\n");}finally{db.close();}
