import "./fixture-clock.ts";
import { createDatabase } from "../src/db.ts";
import { readSession } from "../src/session.ts";
import { exchangeSmartCode } from "../src/smart.ts";
process.env.CURASPHERE_ENV="local";process.env.CURASPHERE_DEV_DIRECTORY="local-test";process.env.CURASPHERE_DATA_CLASS="synthetic";process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="true";
const [file,sid,code,client,proof]=process.argv.slice(2),db=createDatabase(file),ctx=readSession(db,sid);
try{exchangeSmartCode(db,ctx,{grant_type:"authorization_code",code,client_id:client,redirect_uri:"http://127.0.0.1:3000/interop/apps/callback",code_verifier:proof});process.stdout.write("issued");}catch{process.stdout.write("rejected");}finally{db.close();}
