# P00-F01 evidence

Feature ID: P00-F01
Phase ID: 00
Feature owner and risk class: Owner role is product owner. Provisional risk class is low. That class is not a validated clinical risk score.
Intended users and intended use: The charter lists five personas and eight capabilities. Each capability has an intended use. Regulatory classification is pending.
Source v1.0 mapping and relevant ADR: Phase 00 scope item "Product charter and market boundaries". `docs/adr/ADR-0049-product-charter.md`. The source docx is not in this checkout.
Inventory findings and changed files: `docs/constitution/product-charter.json` status is approved. The pending draft remains in `approvalHistory`.
Schemas/migrations and rollback evidence: No database migration. Rollback is to remove `docs/constitution`, `tools/constitution`, and the `constitution:phase00` script.
API/event contracts and request/response/error examples: Not applicable. Phase 00 adds no product API.
UI routes, accessible screenshots and every relevant UX state: Not applicable. No product screen was added.
Synthetic scenario IDs, preconditions, expected and actual oracles: No S01–S20 scenario applies. The checker rejects a missing persona, an unregulated default, and an approval whose document version is not `charter-2026.10`. Production jurisdiction is null.
Executed test commands: `npm run constitution:phase00` on 2026-10-13. Exit code 0. 19 passed, 0 failed.
Unit/integration/contract/E2E/accessibility/load tests: The charter checks passed, including the named approval. No product UI test was run.
Auth/tenant/facility/purpose/consent/audit evidence: The approval history keeps the pending draft and the approved record.
Clinical and AI safety review and evidence: Not a clinical release. Classification stays pending.
Observability/alert/runbook/degraded-mode and rollback evidence: Re-run `npm run constitution:phase00`. No service to degrade.
Reviewed approvals: Benjamin Tetteh Nartey, product owner, approved `charter-2026.10` on 2026-10-13T13:26:00Z. No architecture, security, clinical, or regulatory approval is recorded.
Residual risks, blockers and decisions: The source docx is missing from this checkout. No production jurisdiction is selected.
FINAL STATUS: ACCEPTED
