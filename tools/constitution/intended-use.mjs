const PHASES = {
  0: profile("product owner", "product owner", "administrative", "none", "none", "none", "low"),
  1: profile("engineering", "engineer", "administrative", "none", "none", "none", "low"),
  2: profile("security", "administrator", "administrative", "review-required", "none", "deterministic", "moderate"),
  3: profile("privacy", "administrator", "administrative", "review-required", "facility-patient", "deterministic", "high"),
  4: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "none", "high"),
  5: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "deterministic", "moderate"),
  6: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "deterministic", "moderate"),
  7: profile("clinical informatics", "clinician", "clinical-impact", "informational", "facility-patient", "deterministic", "moderate"),
  8: profile("clinical informatics", "clinician", "clinical-impact", "informational", "facility-patient", "deterministic", "high"),
  9: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "deterministic", "high"),
  10: profile("clinical informatics", "clinician", "clinical-impact", "consequential", "facility-patient", "model-pending", "high"),
  11: profile("clinical informatics", "clinician", "clinical-impact", "consequential", "facility-patient", "model-pending", "high"),
  12: profile("clinical informatics", "clinician", "clinical-impact", "consequential", "facility-patient", "model-pending", "high"),
  13: profile("clinical informatics", "clinician", "clinical-impact", "consequential", "facility-patient", "model-pending", "high"),
  14: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "deterministic", "high"),
  15: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "deterministic", "high"),
  16: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "none", "high"),
  17: profile("clinical informatics", "patient", "clinical-impact", "review-required", "facility-patient", "none", "high"),
  18: profile("operations", "administrator", "administrative", "informational", "none", "deterministic", "moderate"),
  19: profile("operations", "administrator", "administrative", "consequential", "none", "model-pending", "high"),
  20: profile("privacy", "auditor", "administrative", "review-required", "de-identified-group", "deterministic", "high"),
  21: profile("privacy", "auditor", "administrative", "review-required", "de-identified-group", "deterministic", "high"),
  22: profile("privacy", "auditor", "administrative", "review-required", "de-identified-group", "none", "high"),
  23: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "none", "high"),
  24: profile("clinical informatics", "clinician", "clinical-impact", "review-required", "facility-patient", "deterministic", "high"),
  25: profile("finance", "administrator", "administrative", "review-required", "none", "deterministic", "moderate"),
  26: profile("quality", "auditor", "administrative", "review-required", "none", "model-pending", "high"),
  27: profile("engineering", "administrator", "administrative", "review-required", "none", "none", "moderate"),
  28: profile("engineering", "administrator", "administrative", "review-required", "none", "none", "moderate"),
  29: profile("quality", "clinician", "clinical-impact", "consequential", "facility-patient", "none", "high"),
  30: profile("clinical informatics", "clinician", "clinical-impact", "consequential", "facility-patient", "model-pending", "high"),
};

const OVERRIDES = {
  "P02-F05": { riskClass: "high", decisionImpact: "consequential" },
  "P17-F04": { automationLevel: "model-pending", decisionImpact: "consequential" },
};

const REQUIRED = ["featureId", "name", "ownerRole", "intendedUser", "intendedUse", "decisionImpact", "patientPopulation", "automationLevel", "jurisdiction", "regulatoryClassification", "riskClass", "prohibitedClaims"];
const DECISION = new Set(["none", "informational", "review-required", "consequential"]);
const POPULATION = new Set(["none", "facility-patient", "de-identified-group"]);
const AUTOMATION = new Set(["none", "deterministic", "model-pending"]);
const RISK = new Set(["low", "moderate", "high"]);

function profile(ownerRole, intendedUser, workflowClass, decisionImpact, patientPopulation, automationLevel, riskClass) {
  return { ownerRole, intendedUser, workflowClass, decisionImpact, patientPopulation, automationLevel, riskClass };
}

export function defaultClassification() {
  return "pending";
}

export function classifyFeature(feature) {
  const base = PHASES[feature.phase];
  if (!base) throw new Error(`No constitution profile for phase ${feature.phase}.`);
  const chosen = { ...base, ...OVERRIDES[feature.feature_id] };
  return {
    featureId: feature.feature_id,
    name: feature.name,
    ownerRole: chosen.ownerRole,
    ownerName: null,
    intendedUser: chosen.intendedUser,
    intendedUse: `Provide ${feature.name} for the ${chosen.intendedUser}. This feature does not diagnose or recommend treatment.`,
    decisionImpact: chosen.decisionImpact,
    patientPopulation: chosen.patientPopulation,
    automationLevel: chosen.automationLevel,
    jurisdiction: "pending",
    regulatoryClassification: defaultClassification(),
    riskClass: chosen.riskClass,
    riskClassBasis: "Provisional class from the phase scope. Not a validated clinical risk score.",
    workflowClass: chosen.workflowClass,
    prohibitedClaims: ["A diagnosis.", "A treatment recommendation.", "Regulatory clearance.", "Clinical validation."],
  };
}

export function buildRegistry(features) {
  return {
    id: "intended-use-2026.10",
    classificationDefault: defaultClassification(),
    entries: features.map(classifyFeature),
  };
}

export function validateEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== "object") return ["An intended-use entry must be an object."];
  for (const field of REQUIRED) {
    if (entry[field] == null || entry[field] === "") errors.push(`${entry.featureId ?? "entry"} is missing ${field}.`);
  }
  if (typeof entry.intendedUse === "string" && entry.intendedUse.trim().length < 8) errors.push(`${entry.featureId} has no intended use.`);
  if (!DECISION.has(entry.decisionImpact)) errors.push(`${entry.featureId} has no decision impact.`);
  if (!POPULATION.has(entry.patientPopulation)) errors.push(`${entry.featureId} has no patient population.`);
  if (!AUTOMATION.has(entry.automationLevel)) errors.push(`${entry.featureId} has no automation level.`);
  if (entry.regulatoryClassification === "unregulated") errors.push(`${entry.featureId} cannot default to unregulated.`);
  if (entry.regulatoryClassification !== "pending" && entry.regulatoryClassification !== "assessed") {
    errors.push(`${entry.featureId} needs a pending or assessed classification.`);
  }
  if (!RISK.has(entry.riskClass)) errors.push(`${entry.featureId} has no risk class.`);
  if (!Array.isArray(entry.prohibitedClaims) || entry.prohibitedClaims.length === 0) errors.push(`${entry.featureId} needs prohibited claims.`);
  if (entry.ownerName != null && (typeof entry.ownerName !== "string" || !entry.ownerName.trim())) errors.push(`${entry.featureId} has an empty owner name.`);
  return errors;
}

export function validateRegistry(registry, features) {
  const errors = [];
  if (registry?.classificationDefault === "unregulated") errors.push("The classification default cannot be unregulated.");
  if (registry?.classificationDefault !== "pending" && registry?.classificationDefault !== "assessed") {
    errors.push("The classification default must be pending or assessed.");
  }
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  const expected = new Set(features.map((feature) => feature.feature_id));
  const seen = new Set();
  for (const entry of entries) {
    errors.push(...validateEntry(entry));
    if (seen.has(entry.featureId)) errors.push(`${entry.featureId} is duplicated.`);
    seen.add(entry.featureId);
    if (!expected.has(entry.featureId)) errors.push(`${entry.featureId} is not a registered feature.`);
  }
  for (const featureId of expected) {
    if (!seen.has(featureId)) errors.push(`${featureId} has no intended-use entry.`);
  }
  return errors;
}
