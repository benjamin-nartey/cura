const WORKFLOW = new Set(["administrative", "clinical-impact"]);

export function validateCharter(charter) {
  const errors = [];
  if (!charter || typeof charter !== "object") return ["The charter must be an object."];
  for (const field of ["id", "title", "customers", "jurisdictions", "personas", "valuePropositions", "exclusions", "nonGoals", "successTargets", "capabilities", "approval"]) {
    if (charter[field] == null) errors.push(`Missing ${field}.`);
  }
  if (!Array.isArray(charter.customers) || charter.customers.length === 0) errors.push("Name at least one intended customer.");
  if (!charter.jurisdictions || !("production" in charter.jurisdictions)) errors.push("Record the production jurisdiction, or null when it is not selected.");
  const personas = new Set(Array.isArray(charter.personas) ? charter.personas.map((persona) => persona.id) : []);
  if (personas.size === 0) errors.push("Name at least one persona.");
  for (const list of ["valuePropositions", "exclusions", "nonGoals", "successTargets"]) {
    if (!Array.isArray(charter[list]) || charter[list].length === 0) errors.push(`Record at least one ${list} entry.`);
  }
  if (!Array.isArray(charter.capabilities) || charter.capabilities.length === 0) errors.push("Record at least one capability.");
  for (const capability of charter.capabilities ?? []) {
    if (!capability.id) errors.push("A capability is missing an id.");
    if (!Array.isArray(capability.personaIds) || capability.personaIds.length === 0) errors.push(`${capability.id ?? "capability"} has no persona.`);
    for (const personaId of capability.personaIds ?? []) {
      if (!personas.has(personaId)) errors.push(`${capability.id} names an unknown persona ${personaId}.`);
    }
    if (typeof capability.intendedUse !== "string" || capability.intendedUse.trim().length < 8) {
      errors.push(`${capability.id} has no intended use.`);
    }
    if (!WORKFLOW.has(capability.workflowClass)) errors.push(`${capability.id} must be administrative or clinical-impact.`);
    if (capability.regulatoryClassification === "unregulated") {
      errors.push(`${capability.id} cannot default to unregulated.`);
    }
    if (capability.regulatoryClassification !== "pending" && capability.regulatoryClassification !== "assessed") {
      errors.push(`${capability.id} needs a pending or assessed classification.`);
    }
  }
  if (!charter.approval || charter.approval.requiredRole !== "product owner") errors.push("The charter requires product-owner approval.");
  if (!charter.approval || (charter.approval.status !== "pending" && charter.approval.status !== "approved")) {
    errors.push("Approval status must be pending or approved.");
  }
  if (charter.approval?.status === "approved") {
    if (typeof charter.approval.approverName !== "string" || !charter.approval.approverName.trim() || !charter.approval.approvedAt) {
      errors.push("An approved charter needs the product owner's name and the approval date.");
    }
    if (charter.approval.documentVersion !== charter.id) {
      errors.push("Approval must name the charter version.");
    }
  }
  if (!Array.isArray(charter.approvalHistory) || charter.approvalHistory.length === 0) {
    errors.push("Approval history is required.");
  } else {
    const pending = charter.approvalHistory.find((entry) => entry.status === "pending");
    if (!pending || pending.approverName !== null || pending.approvedAt !== null) {
      errors.push("The pending draft must remain in the approval history.");
    }
    if (charter.approval?.status === "approved") {
      const recorded = charter.approvalHistory.find((entry) => entry.status === "approved" && entry.approverName === charter.approval.approverName && entry.approvedAt === charter.approval.approvedAt && entry.documentVersion === charter.id);
      if (!recorded) errors.push("The approval history must record the same name, date and charter version.");
    }
  }
  return errors;
}

export function acceptanceBlockers(charter) {
  const errors = validateCharter(charter);
  if (errors.length > 0) return errors;
  if (charter.approval.status !== "approved") return ["The product owner has not approved this charter."];
  return [];
}
