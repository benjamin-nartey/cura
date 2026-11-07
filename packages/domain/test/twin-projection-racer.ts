import "./fixture-clock.ts";
import { readFileSync } from "node:fs";
import { createDatabase } from "../src/db";
import { rebuildTwinProjection } from "../src/twin-projection";
const [file,context]=process.argv.slice(2),db=createDatabase(file);try{const r=rebuildTwinProjection(db,JSON.parse(readFileSync(context,'utf8')),'pat_gh_kofi_a','competing-state-key');process.stdout.write(JSON.stringify({id:r.build!.id,replayed:r.replayed}));}finally{db.close();}
