import "./fixture-clock";
import {readFileSync} from "node:fs";
import {createDatabase} from "../src/db";
import {claimTwinRefresh} from "../src/twin-refresh";
const db=createDatabase(process.argv[2]),ctx=JSON.parse(readFileSync(process.argv[3],'utf8'));const c=claimTwinRefresh(db,ctx,'pat_gh_kofi_a');process.stdout.write(JSON.stringify({claimed:!!c}));db.close();
