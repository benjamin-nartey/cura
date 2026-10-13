# P00-F02 evidence

Feature ID: P00-F02
Phase ID: 00
Feature owner and risk class: Owner role is product owner. Provisional risk class is low. That class is not a validated clinical risk score.
Intended users and intended use: The registry records an owner role, intended user, intended use, decision impact, patient population, automation level, jurisdiction, regulatory classification, risk class, and prohibited claims for every feature in the feature register.
Source v1.0 mapping and relevant ADR: Phase 00 feature "Intended-use registry".
Inventory findings and changed files: `docs/constitution/intended-use-registry.json` has 158 entries, one per feature id. `ownerName` is null on every entry. Jurisdiction and regulatory classification are pending.
Schemas/migrations and rollback evidence: No database migration. Rollback is to remove the registry and `tools/constitution/intended-use.mjs`.
API/event contracts and request/response/error examples: Not applicable.
UI routes, accessible screenshots and every relevant UX state: Not applicable.
Synthetic scenario IDs, preconditions, expected and actual oracles: No S01–S20 scenario applies. The checker rejects a missing intended use, an omitted classification, and the value `unregulated`. Omitting the classification does not fill it with `unregulated`.
Executed test commands: `npm run constitution:phase00` on 2026-10-13. Exit code 0. 19 passed, 0 failed.
Unit/integration/contract/E2E/accessibility/load tests: The four registry checks passed. No product UI test was run.
Auth/tenant/facility/purpose/consent/audit evidence: Not applicable to this document.
Clinical and AI safety review and evidence: No classification is marked assessed. No clinical validation is claimed.
Observability/alert/runbook/degraded-mode and rollback evidence: Re-run `npm run constitution:phase00`.
Reviewed approvals: None beyond the charter approval. This feature's evidence did not require a separate human signature.
Residual risks, blockers and decisions: Owner names are unset. The risk class is a provisional phase class.
FINAL STATUS: ACCEPTED
