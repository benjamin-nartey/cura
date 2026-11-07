import { mkdir, writeFile } from "node:fs/promises";
const root="https://curasphere.local/fhir/StructureDefinition/";
const destination=new URL("../../packages/fhir/profiles/",import.meta.url);
await mkdir(destination,{recursive:true});
const save=async(name,value)=>writeFile(new URL(`StructureDefinition-${name}.json`,destination),JSON.stringify(value,null,2)+"\n");
const base={resourceType:"StructureDefinition",version:"1.0.0",status:"draft",experimental:true,date:"2026-11-03",publisher:"CuraSphere engineering",fhirVersion:"4.0.1",abstract:false,derivation:"constraint"};
await save("source-context",{...base,id:"source-context",url:`${root}source-context`,name:"CuraSphereSourceContext",kind:"complex-type",type:"Extension",baseDefinition:"http://hl7.org/fhir/StructureDefinition/Extension",context:[{type:"element",expression:"DomainResource"}],
  description:"Versioned source-only provenance for lossless local synthetic mapping. Not an executable instruction or an import authorization.",
  differential:{element:[{id:"Extension",path:"Extension"},{id:"Extension.extension",path:"Extension.extension",max:"0"},{id:"Extension.url",path:"Extension.url",fixedUri:`${root}source-context`},{id:"Extension.value[x]",path:"Extension.value[x]",min:1,type:[{code:"string"}]}]}});
const requirements={Patient:["identifier","identifier.system","identifier.value","name","name.family","name.given","birthDate"],Encounter:["subject"],Condition:["code","subject","encounter","verificationStatus","recordedDate"],AllergyIntolerance:["code","patient","encounter","verificationStatus","recordedDate"],Observation:["code","subject","encounter","effective[x]","issued"],ServiceRequest:["code","subject","encounter","priority","occurrence[x]","authoredOn"],MedicationRequest:["medication[x]","subject","encounter","authoredOn","dosageInstruction"]};
for(const [type,paths] of Object.entries(requirements)) {
  const element=[{id:type,path:type},{id:`${type}.id`,path:`${type}.id`,min:1},
    {id:`${type}.extension`,path:`${type}.extension`,min:1,slicing:{discriminator:[{type:"value",path:"url"}],rules:"open"}},
    {id:`${type}.extension:sourceContext`,path:`${type}.extension`,sliceName:"sourceContext",min:1,max:"1",type:[{code:"Extension",profile:[`${root}source-context|1.0.0`]}]},
    ...paths.map(path=>({id:`${type}.${path}`,path:`${type}.${path}`,min:1}))];
  if(["ServiceRequest","MedicationRequest"].includes(type))element.push({id:`${type}.intent`,path:`${type}.intent`,fixedCode:"proposal"});
  await save(`curasphere-source-${type}`,{...base,id:`curasphere-source-${type}`,url:`${root}source-${type}`,name:`CuraSphereSource${type}`,title:`CuraSphere synthetic source ${type}`,description:"Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",kind:"resource",type,baseDefinition:`http://hl7.org/fhir/StructureDefinition/${type}`,differential:{element}});
}
