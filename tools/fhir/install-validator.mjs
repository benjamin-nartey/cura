import { mkdir, rename, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { lock, verifyValidator } from "./validate.mjs";
const directory=new URL("../../artifacts/governance-v2/fhir-validator/",import.meta.url);
await mkdir(directory,{recursive:true});
const target=fileURLToPath(new URL(`validator-${lock.version}.jar`,directory));
let exists=false;try{exists=(await stat(target)).isFile();}catch(error){if(error.code!=="ENOENT")throw error;}
if(exists){await verifyValidator(target);process.stdout.write(`Verified cached validator ${lock.version}.\n`);}
else {
 const temporary=`${target}.${randomUUID()}.partial`;
 try{
  const response=await fetch(lock.url,{signal:AbortSignal.timeout(15*60*1000)});
  if(!response.ok||!response.body)throw new Error(`Validator download failed (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary,{flags:"wx"}));
  await verifyValidator(temporary);await rename(temporary,target);
  process.stdout.write(`Installed and verified validator ${lock.version}.\n`);
 }finally{await rm(temporary,{force:true});}
}
