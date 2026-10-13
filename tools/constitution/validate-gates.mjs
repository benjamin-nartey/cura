const REQUIRED = ["featureId", "ownerRole", "intendedUser", "intendedUse", "riskClass", "workflowClass", "tests", "rollback", "audit", "changeControl", "surveillance"];

export function validateGateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["A gate manifest must be an object."];
  for (const field of REQUIRED) {
    if (manifest[field] == null || manifest[field] === "") errors.push(`Missing ${field}.`);
  }
  if (Array.isArray(manifest.tests) && manifest.tests.length === 0) errors.push("Record the tests that were run.");
  if (!Array.isArray(manifest.tests)) errors.push("Record the tests that were run.");
  for (const field of ["rollback", "audit"]) {
    if (typeof manifest[field] === "string" && manifest[field].trim().length < 8) errors.push(`${field} is incomplete.`);
  }
  if (manifest.changeControl) {
    for (const field of ["version", "reason", "authorRole"]) {
      if (!manifest.changeControl[field]) errors.push(`Change control is missing ${field}.`);
    }
  }
  if (manifest.surveillance) {
    for (const field of ["watch", "ownerRole"]) {
      if (!manifest.surveillance[field]) errors.push(`Surveillance is missing ${field}.`);
    }
  }
  if (manifest.workflowClass === "clinical-impact") {
    const signoff = manifest.clinicalSignoff;
    if (!signoff?.approverName || !signoff.approvedAt) errors.push("Clinical sign-off is required and has not been recorded.");
  }
  if (manifest.breakGlass) {
    for (const field of ["reason", "scope", "expiresAt", "approverName"]) {
      if (!manifest.breakGlass[field]) errors.push(`Break-glass review is missing ${field}.`);
    }
  }
  return errors;
}
