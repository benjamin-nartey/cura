# P01-F03 evidence

Feature ID: P01-F03
Phase ID: 01
Feature owner and risk class: Owner role is engineering. Provisional risk class is low.
Intended users and intended use: An engineer changes a shared platform route only when the compatibility check accepts it. The check does not diagnose.
Source v1.0 mapping and relevant ADR: Phase 01 contracts and supply-chain controls. `docs/adr/ADR-0052-platform-contract.md`. The source docx is not in this checkout.
Inventory findings and changed files: Clinical contracts already lived in `@curasphere/contracts`. This feature adds a versioned platform route contract and a generator for `packages/contracts/src/platform.ts`. CI already existed and now runs the new checks.
Schemas/migrations and rollback evidence: No database migration. Rollback removes the contract, the checker, the pre-commit script, and the three CI steps.
API/event contracts and request/response/error examples: `GET /health` stays status 200 with `status`, `service`, and `clinicalGeneration`. `POST /v1/generate` stays status 403 with `code` and `message`. Removing `clinicalGeneration` or changing 403 to 200 is rejected.
UI routes, accessible screenshots and every relevant UX state: Not applicable. No product screen was added.
Synthetic scenario IDs, preconditions, expected and actual oracles: The compatibility test builds that broken contract and expects both error strings. The committed contract matches the generated module.
Executed test commands: `npm run platform:contracts` exit 0, 2 passed, 0 failed. `npm run typecheck --workspace @curasphere/contracts` exit 0. `bash tools/platform/pre-commit.sh` exit 0, 2 passed. `npm audit --audit-level=critical` exit 0. `npm sbom --sbom-format cyclonedx` exit 0 and emitted CycloneDX 1.5.
Unit/integration/contract/E2E/accessibility/load tests: Those commands were executed. No GitHub Actions run was observed because this change was not pushed. No browser test was run.
Auth/tenant/facility/purpose/consent/audit evidence: Not applicable. The contract does not accept a client tenant.
Clinical and AI safety review and evidence: Generation remains status 403. No classification was marked assessed.
Observability/alert/runbook/degraded-mode and rollback evidence: Re-run `npm run platform:contracts`. A git hook was not installed.
Reviewed approvals: None.
Residual risks, blockers and decisions: `npm audit` still reports 1 high and 1 moderate finding in postcss through next. Those are not critical and are not cleared. Branch protection was not checked.
FINAL STATUS: ACCEPTED
