const STATES = new Set(["draft", "in-review", "accepted", "rejected"]);
const REVIEWERS = ["architecture", "security", "clinical"];

export function validateDecision(decision) {
  const errors = [];
  if (!decision || typeof decision !== "object") return ["A decision must be an object."];
  for (const field of ["id", "title", "author", "authoredAt", "reviewState", "reviewers", "alternatives", "decision", "ownership", "policies", "interoperability", "security", "rollback"]) {
    if (decision[field] == null || decision[field] === "") errors.push(`Missing ${field}.`);
  }
  if (!STATES.has(decision.reviewState)) errors.push("Review state must be draft, in-review, accepted, or rejected.");
  if (!Array.isArray(decision.alternatives) || decision.alternatives.length === 0) errors.push("Record at least one alternative.");
  if (!Array.isArray(decision.policies) || decision.policies.length === 0) errors.push("Record at least one policy.");
  const roles = new Set(Array.isArray(decision.reviewers) ? decision.reviewers.map((reviewer) => reviewer.role) : []);
  for (const role of REVIEWERS) {
    if (!roles.has(role)) errors.push(`Missing ${role} reviewer.`);
  }
  for (const reviewer of decision.reviewers ?? []) {
    if (reviewer.signedAt && (typeof reviewer.name !== "string" || !reviewer.name.trim())) {
      errors.push(`${reviewer.role} cannot be signed without a name.`);
    }
  }
  if (decision.reviewState === "accepted") {
    for (const role of REVIEWERS) {
      const reviewer = (decision.reviewers ?? []).find((item) => item.role === role);
      if (!reviewer?.name || !reviewer.signedAt) errors.push(`${role} has not signed this decision.`);
    }
  }
  return errors;
}

export function traceDecision(decision) {
  return { id: decision.id, author: decision.author, reviewState: decision.reviewState };
}
