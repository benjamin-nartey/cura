import { readFileSync,writeFileSync,readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { legacyCapabilities,sourceCapabilities,legacyOperations } from "../../packages/fhir/src/conformance.ts";
const root=new URL("../../",import.meta.url),check=process.argv.includes("--check");
function output(relative:string,text:string){const path=fileURLToPath(new URL(relative,root));if(check){if(readFileSync(path,"utf8")!==text)throw new Error(`Generated conformance drift: ${relative}`);}else writeFileSync(path,text);}
const directory=new URL("packages/fhir/profiles/",root),profiles=Object.fromEntries(readdirSync(directory).filter(name=>name.endsWith(".json")).sort().map(name=>[name.slice(0,-5),JSON.parse(readFileSync(new URL(name,directory),"utf8"))]));
output("packages/fhir/src/artifacts.generated.ts","// Generated from versioned source profiles. Run npm run conformance:generate.\nexport const PROFILE_ARTIFACTS: Record<string, Record<string, unknown>> = "+JSON.stringify(profiles,null,2)+";\n");
for(const [name,value] of [["capability-legacy",legacyCapabilities()],["capability-source",sourceCapabilities()],...legacyOperations().map(op=>[op.id,op])] as const)output(`packages/fhir/validation/${name}.json`,JSON.stringify(value,null,2)+"\n");
process.stdout.write(check?"Conformance artifacts match their sources.\n":"Conformance artifacts generated.\n");
