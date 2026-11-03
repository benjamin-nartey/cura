import { ValidationError, type CodingSelection } from "@curasphere/domain";
export function codingSelectionFromForm(form:FormData):CodingSelection {
 const system=form.get("codingSystem"),version=form.get("codingVersion"),revision=form.get("codingRevision");
 if(typeof system!=="string"||!system||system.length>300||typeof version!=="string"||!version||version.length>100||typeof revision!=="string"||!/^[a-f0-9]{64}$/.test(revision))throw new ValidationError("code","Reload the code picker and choose an exact versioned definition.");
 return {system,version,revision};
}
export function codingCommandKey(form:FormData){const key=form.get("codingCommandKey");if(typeof key!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(key))throw new ValidationError("invalid","Reload the clinical form before recording.");return key;}
