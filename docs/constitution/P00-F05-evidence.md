# P00-F05 evidence

Feature ID: P00-F05
Phase ID: 00
Feature owner and risk class: Owner role is product owner. Provisional risk class is low.
Intended users and intended use: The release constitution defines feature and phase gates, an acceptance manifest, break-glass review, clinical sign-off, change control, and post-release surveillance.
Source v1.0 mapping and relevant ADR: Phase 00 feature "Release and DoD constitution".
Inventory findings and changed files: `docs/constitution/release-constitution.json` and `docs/constitution/templates/gate-manifest.md`.
Schemas/migrations and rollback evidence: No database migration. Rollback is to remove the constitution file and `tools/constitution/validate-gates.mjs`.
API/event contracts and request/response/error examples: Not applicable.
UI routes, accessible screenshots and every relevant UX state: Not applicable.
Synthetic scenario IDs, preconditions, expected and actual oracles: The administrative sample manifest passes. An empty test list, a missing rollback, a clinical-impact manifest without a named sign-off, and a break-glass review without an approver are rejected. `completedStudy` is null.
Executed test commands: `npm run constitution:phase00` on 2026-10-13. Exit code 0. 19 passed, 0 failed.
Unit/integration/contract/E2E/accessibility/load tests: The four gate checks passed. No product UI test was run.
Auth/tenant/facility/purpose/consent/audit evidence: The sample records that the checker output is the audit for this documentation gate.
Clinical and AI safety review and evidence: No clinical sign-off is recorded. A clinical-impact manifest cannot pass without one.
Observability/alert/runbook/degraded-mode and rollback evidence: Re-run `npm run constitution:phase00`. Surveillance says to re-run the checker when a manifest changes. No completed surveillance study is claimed.
Reviewed approvals: None for this feature. The charter approval does not sign a clinical release.
Residual risks, blockers and decisions: A later clinical-impact release still needs a named clinical sign-off.
FINAL STATUS: ACCEPTED
