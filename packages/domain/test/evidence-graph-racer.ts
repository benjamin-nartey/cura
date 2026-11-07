import "./fixture-clock.ts";
import {readFileSync} from "node:fs";
import {createDatabase} from "../src/db";
import {recordGraphClaim} from "../src/evidence-graph";
const db=createDatabase(process.argv[2]);try{const r=recordGraphClaim(db,JSON.parse(readFileSync(process.argv[3],'utf8')),JSON.parse(readFileSync(process.argv[4],'utf8')));process.stdout.write(JSON.stringify({id:r.claim.id,version:r.claim.version,replayed:r.replayed}));}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='conflict')process.stdout.write(JSON.stringify({error:'conflict'}));else throw error;}finally{db.close();}
