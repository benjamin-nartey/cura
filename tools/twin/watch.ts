import {execFile} from "node:child_process";
import {promisify} from "node:util";
// Bounded local owner/patient worker. Each child rechecks live identity/coverage.
const run=promisify(execFile);let failures=0;
for(let pass=0;pass<120;pass++){
 try{const {stdout}=await run(process.execPath,['--import','tsx','tools/twin/worker.ts'],{windowsHide:true,timeout:60000,env:process.env});const value=JSON.parse(stdout);failures=0;if(value.processed||value.scheduled)process.stdout.write(JSON.stringify(value)+'\n');}
 catch{failures++;process.stderr.write('Twin refresh pass unavailable; evidence retained.\n');if(failures>=3){process.exitCode=1;break;}}
 if(pass<119)await new Promise(resolve=>setTimeout(resolve,30000));
}
process.stdout.write('Bounded Twin watcher stopped; inspect authority and restart explicitly when needed.\n');
