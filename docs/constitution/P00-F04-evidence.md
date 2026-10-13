# P00-F04 evidence

Feature ID: P00-F04
Phase ID: 00
Feature owner and risk class: Owner role is product owner. The sample risk is high and blocked.
Intended users and intended use: The risk record stores scenario, severity, likelihood, mitigations, residual risk, owner role, approval, and validation evidence. The AI record stores model, dataset, prompt, and classification.
Source v1.0 mapping and relevant ADR: Phase 00 feature "Clinical and AI risk governance".
Inventory findings and changed files: `docs/constitution/risk-governance.json`. `RISK-SAMPLE-HIGH-001` and `AI-RISK-SAMPLE-001` are blocked. Approval, validation evidence, and release approval are null.
Schemas/migrations and rollback evidence: No database migration. Rollback is to remove the risk file and `tools/constitution/validate-risk.mjs`.
API/event contracts and request/response/error examples: Not applicable.
UI routes, accessible screenshots and every relevant UX state: Not applicable.
Synthetic scenario IDs, preconditions, expected and actual oracles: A release approval added to the blocked high-risk sample is rejected. An AI classification of `unregulated` is rejected.
Executed test commands: `npm run constitution:phase00` on 2026-10-13. Exit code 0. 19 passed, 0 failed.
Unit/integration/contract/E2E/accessibility/load tests: The three risk checks passed. No product UI test was run.
Auth/tenant/facility/purpose/consent/audit evidence: Not applicable.
Clinical and AI safety review and evidence: No clinical validation evidence is recorded. The model, dataset, and prompt are `not-selected`.
Observability/alert/runbook/degraded-mode and rollback evidence: Re-run `npm run constitution:phase00`.
Reviewed approvals: None. The sample cannot be released.
Residual risks, blockers and decisions: Residual risk on the sample remains high.
FINAL STATUS: ACCEPTED
