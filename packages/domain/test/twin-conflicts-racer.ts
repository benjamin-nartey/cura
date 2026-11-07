import "./fixture-clock";
import {readFileSync} from "node:fs";
import {createDatabase} from "../src/db";
import {requestTwinSourceReview} from "../src/twin-conflicts";
const db=createDatabase(process.argv[2]),c=JSON.parse(readFileSync(process.argv[3],'utf8'));
const result=requestTwinSourceReview(db,c.actor,'pat_gh_kofi_a',{build:c.build,issue:c.issue,commandKey:'race-review-command'});
process.stdout.write(JSON.stringify({id:result.review.id,replayed:result.replayed}));db.close();
