const SEVERITY = new Set(["low", "moderate", "high"]);
const LIKELIHOOD = new Set(["rare", "possible", "likely"]);

export function validateRisk(risk) {
  const errors = [];
  if (!risk || typeof risk !== "object") return ["A risk must be an object."];
  for (const field of ["id", "scenario", "severity", "likelihood", "mitigations", "residualRisk", "ownerRole", "status"]) {
    if (risk[field] == null || risk[field] === "") errors.push(`Missing ${field}.`);
  }
  if (!SEVERITY.has(risk.severity)) errors.push("Severity must be low, moderate, or high.");
  if (!LIKELIHOOD.has(risk.likelihood)) errors.push("Likelihood must be rare, possible, or likely.");
  if (!SEVERITY.has(risk.residualRisk)) errors.push("Residual risk must be low, moderate, or high.");
  if (!Array.isArray(risk.mitigations) || risk.mitigations.length === 0) errors.push("Record at least one mitigation.");
  if (risk.approval != null && (typeof risk.approval.approverName !== "string" || !risk.approval.approverName.trim() || !risk.approval.approvedAt)) {
    errors.push("A risk approval needs a name and a date.");
  }
  if (risk.validationEvidence != null && (typeof risk.validationEvidence !== "string" || !risk.validationEvidence.trim())) {
    errors.push("Validation evidence must be a non-empty statement.");
  }
  return errors;
}

export function validateAiRisk(risk) {
  const errors = [];
  for (const field of ["id", "model", "dataset", "prompt", "regulatoryClassification", "status"]) {
    if (risk?.[field] == null || risk[field] === "") errors.push(`Missing ${field}.`);
  }
  if (risk?.regulatoryClassification === "unregulated") errors.push("An AI risk cannot default to unregulated.");
  if (risk?.regulatoryClassification !== "pending" && risk?.regulatoryClassification !== "assessed") {
    errors.push("An AI risk needs a pending or assessed classification.");
  }
  return errors;
}

export function releaseBlockers(risk) {
  const errors = validateRisk(risk);
  if (risk?.status === "blocked" || (risk?.severity === "high" && !risk?.approval?.approverName)) {
    errors.push("A blocked high-risk item cannot receive release approval.");
  }
  if ((risk?.status === "blocked" || !risk?.approval?.approverName) && risk?.releaseApproval) {
    errors.push("Release approval cannot be recorded on a blocked risk.");
  }
  return errors;
}
