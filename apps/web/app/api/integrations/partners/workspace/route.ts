import { AppError,createIntegrationSubscription,deliverIntegrationMessage,disableIntegrationConnection,exportIntegrationObservation,getDb,linkIntegrationPatient,listIntegrationWorkspace,readIntegrationImport,registerIntegrationConnection,revealIntegrationKey,reviewIntegrationImport,transitionIntegrationSubscription } from "@curasphere/domain";
import { terminologyCaller } from "@/lib/terminology-registry";
import { integrationFailure,integrationJson,integrationLiveSession,integrationRawBody,integrationSameOrigin } from "@/lib/integrations";
export async function GET(request:Request){try{if(!integrationSameOrigin(request))throw new AppError("forbidden","Use this workspace origin.");const ctx=await terminologyCaller();if(!ctx)throw new AppError("signin","Sign in to manage partner exchange.");const query=new URL(request.url).searchParams;if(query.size){if(query.size!==1||query.getAll("import").length!==1)throw new AppError("invalid","Select one import.");return integrationJson(readIntegrationImport(getDb(),ctx,query.get("import")!));}return integrationJson(listIntegrationWorkspace(getDb(),ctx));}catch(error){return integrationFailure(error);}}
export async function POST(request:Request){try{if(!integrationSameOrigin(request))throw new AppError("forbidden","Use this workspace origin.");const ctx=await terminologyCaller();if(!ctx)throw new AppError("signin","Sign in to manage partner exchange.");let input:Record<string,unknown>;try{input=JSON.parse(await integrationRawBody(request));}catch(error){if(error instanceof AppError)throw error;throw new AppError("invalid","Provide a JSON command.");}if(!input||typeof input!=="object"||Array.isArray(input))throw new AppError("invalid","Provide a JSON command.");
 const fields:Record<string,string[]>={register:["name","endpoint","idempotencyKey"],key:["id"],disable:["id","version"],link:["connectionId","externalPatient","externalEncounter","patientId","encounterId"],review:["id","approve"],subscribe:["connectionId","patientId"],transition:["id","version","status"],export:["subscriptionId","sourceId"],deliver:["id"]};
 const action=String(input.action);if(!Object.hasOwn(fields,action)||Object.keys(input).some(k=>k!=="action"&&!fields[action].includes(k))||fields[action].some(k=>!(k in input)))throw new AppError("invalid","Use the documented command fields.");
 const text=(name:string)=>{if(typeof input[name]!=="string")throw new AppError("invalid","Command fields have invalid types.");return input[name] as string;};
 const version=()=>{if(!Number.isSafeInteger(input.version)||Number(input.version)<1)throw new AppError("invalid","Provide the current record version.");return Number(input.version);};
 const db=getDb();let result:unknown;
 switch(action){
 case "register":result=registerIntegrationConnection(db,ctx,{name:text("name"),endpoint:text("endpoint"),idempotencyKey:text("idempotencyKey")});break;
 case "key":result=revealIntegrationKey(db,ctx,text("id"));break;
 case "disable":result=disableIntegrationConnection(db,ctx,text("id"),version());break;
 case "link":result=linkIntegrationPatient(db,ctx,{connectionId:text("connectionId"),externalPatient:text("externalPatient"),externalEncounter:text("externalEncounter"),patientId:text("patientId"),encounterId:text("encounterId")});break;
 case "review":if(typeof input.approve!=="boolean")throw new AppError("invalid","Choose approve or reject.");result=reviewIntegrationImport(db,ctx,text("id"),input.approve);break;
 case "subscribe":result=createIntegrationSubscription(db,ctx,text("connectionId"),text("patientId"));break;
 case "transition":result=transitionIntegrationSubscription(db,ctx,text("id"),version(),text("status"));break;
 case "export":result=exportIntegrationObservation(db,ctx,text("subscriptionId"),text("sourceId"));break;
 case "deliver":{const id=text("id"),workspace=listIntegrationWorkspace(db,ctx);if(!workspace.deliveries.some(item=>item.id===id))throw new AppError("notfound","That delivery is unavailable.");result=await deliverIntegrationMessage(db,id,await integrationLiveSession(id));break;}
 }
 return integrationJson(result);
 }catch(error){return integrationFailure(error);}}
