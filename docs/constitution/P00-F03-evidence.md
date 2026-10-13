# P00-F03 evidence

Feature ID: P00-F03
Phase ID: 00
Feature owner and risk class: Owner role is product owner. Provisional risk class is low.
Intended users and intended use: RFC, ADR, and data-flow templates capture ownership, alternatives, policies, interoperability, security, and rollback. Decision records name an author and a review state.
Source v1.0 mapping and relevant ADR: Phase 00 feature "Architecture decisions and review".
Inventory findings and changed files: `docs/constitution/decisions/decision-sample.json` is `DEC-SAMPLE-001`. Templates are in `docs/constitution/templates`.
Schemas/migrations and rollback evidence: No database migration. Rollback is to remove the decision sample and `tools/constitution/validate-decision.mjs`.
API/event contracts and request/response/error examples: Not applicable.
UI routes, accessible screenshots and every relevant UX state: Not applicable.
Synthetic scenario IDs, preconditions, expected and actual oracles: The sample traces to author "CuraSphere constitution record" and review state `in-review`. Architecture, security, and clinical reviewer names are null. Setting the state to accepted without those names is rejected.
Executed test commands: `npm run constitution:phase00` on 2026-10-13. Exit code 0. 19 passed, 0 failed.
Unit/integration/contract/E2E/accessibility/load tests: The two decision checks passed. No product UI test was run.
Auth/tenant/facility/purpose/consent/audit evidence: The sample stores no patient data.
Clinical and AI safety review and evidence: No reviewer has signed the sample.
Observability/alert/runbook/degraded-mode and rollback evidence: Re-run `npm run constitution:phase00`.
Reviewed approvals: None. The workflow exists. The signatures do not.
Residual risks, blockers and decisions: An accepted architecture decision still needs named architecture, security, and clinical reviewers.
FINAL STATUS: ACCEPTED
