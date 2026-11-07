import { SOURCE_MAPPING_VERSION } from "./fhir-source-map";
import { createHash } from "node:crypto";
import { CONFORMANCE_VERSION,PROFILE_ARTIFACTS,ARTIFACT_BASE,integrationContractCatalog,legacyCapabilities,sourceCapabilities,legacyOperations } from "@curasphere/fhir";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { smartOrigin,smartConfiguration } from "./smart";
import { NotFoundError } from "./errors";
function artifacts(){const origin=smartOrigin();return [...Object.values(PROFILE_ARTIFACTS),...legacyOperations(),legacyCapabilities(origin),sourceCapabilities(origin)] as Array<Record<string,unknown>>;}
export const conformanceDigest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function readConformanceArtifact(id:string){assertLocalHealthcareSandbox();const found=artifacts().find(a=>a.id===id);if(!found)throw new NotFoundError("That published conformance artifact does not exist.");return structuredClone(found);}
export function readConformanceCatalog(){assertLocalHealthcareSandbox();const origin=smartOrigin();return {...integrationContractCatalog(origin),mappingVersion:SOURCE_MAPPING_VERSION,profileVersion:"1.0.0",artifacts:artifacts().map(a=>({id:String(a.id),resourceType:String(a.resourceType),canonical:String(a.url),version:String(a.version),download:`${origin}${ARTIFACT_BASE}/${a.id}`,sha256:conformanceDigest(a)}))};}
export function readSourceCapabilities(){assertLocalHealthcareSandbox();return sourceCapabilities(smartOrigin());}
export function readLegacyCapabilities(){assertLocalHealthcareSandbox();return legacyCapabilities(smartOrigin());}
export function readConformanceDiscovery(){assertLocalHealthcareSandbox();return {conformanceVersion:CONFORMANCE_VERSION,capabilities:readSourceCapabilities(),smart:smartConfiguration()};}
