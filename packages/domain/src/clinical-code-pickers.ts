import type { SessionContext } from "@curasphere/contracts";
import type { AppDatabase } from "./db";
import { listSourceCatalog } from "./clinical-source";
import { listWorkCatalog } from "./work";
import { catalogForOrder, listFacilityCatalog } from "./facility-catalogs";
import { assertTerminologyAccess } from "./code-system-registry";
import { codingDefinition, codingRevision, workCodingDefinition, type CodingDefinition, type CodingKind } from "./clinical-coding";
import { ValidationError } from "./errors";
export type ClinicalCodeChoice={id:string;code:string;display:string;system:string;version:string;revision:string;unitLabel:string;provenanceUrl:string};
function choice(kind:CodingKind,definition:CodingDefinition,id=definition.code):ClinicalCodeChoice {
 const components=definition.components as {unit:string}[]|undefined;const units=components?[...new Set(components.map(c=>c.unit))].join(", "):typeof definition.unit==="string"?definition.unit:"Not applicable";
 return {id,code:definition.code,display:definition.display,system:definition.system,version:definition.version,revision:codingRevision(kind,definition),unitLabel:units,provenanceUrl:`/terminology/coding?kind=${kind}&code=${encodeURIComponent(definition.code)}`};
}
export function getClinicalCodeChoices(db:AppDatabase,ctx:SessionContext,kind:string){
 assertTerminologyAccess(db,ctx,"terminology.read");const catalog=listSourceCatalog();
 if(kind==="condition")return catalog.conditions.map(c=>choice(kind,codingDefinition(kind,c)));
 if(kind==="allergy")return catalog.allergies.map(c=>choice(kind,codingDefinition(kind,c)));
 if(kind==="observation")return [...catalog.quantities,catalog.pressure].map(c=>choice(kind,codingDefinition(kind,c,catalog.unitSystem)));
 if(kind==="medication-order")return catalog.medications.map(c=>choice(kind,codingDefinition(kind,c,catalog.unitSystem)));
 if(kind==="work-order")return listWorkCatalog().orders.map(c=>choice(kind,workCodingDefinition(c)));
 throw new ValidationError("invalid","Choose a supported clinical workflow.");
}
export function getWorkCatalogCodeChoices(db:AppDatabase,ctx:SessionContext){
 return listFacilityCatalog(db,ctx).filter(row=>row.available && row.item?.kind!=="drug").map(row=>{
  const catalog=catalogForOrder(db,ctx,row.item!.id),item=catalog.item,definition=workCodingDefinition({code:item.code,system:item.system,version:item.code_system_version,display:item.display,category:item.order_category},catalog.snapshot);
  return {...choice("work-order",definition,item.id),provenanceUrl:`/terminology/catalogs/${item.id}`};
 });
}
