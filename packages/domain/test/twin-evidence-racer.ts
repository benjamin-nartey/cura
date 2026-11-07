import "./fixture-clock.ts";
import { readFileSync } from "node:fs";
import { createDatabase } from "../src/db";
import { captureTwinEvidence } from "../src/twin-evidence";
const [file,context]=process.argv.slice(2),db=createDatabase(file);try{const result=captureTwinEvidence(db,JSON.parse(readFileSync(context,'utf8')),'pat_gh_kofi_a','concurrent-twin-capture');process.stdout.write(JSON.stringify({id:result.manifest!.id,replayed:result.replayed}));}finally{db.close();}
