# P01-F01 evidence

Feature ID: P01-F01
Phase ID: 01
Feature owner and risk class: Owner role is engineering. Provisional risk class is low. That class is not a validated clinical risk score.
Intended users and intended use: An engineer boots the existing web, mobile, and foundation workspaces and the new AI scaffold and FHIR profile pin. The scaffold does not diagnose or recommend treatment.
Source v1.0 mapping and relevant ADR: Phase 01 scope item for the polyglot monorepo. `docs/adr/ADR-0050-monorepo-boundaries.md`. The source docx is not in this checkout.
Inventory findings and changed files: apps/web, apps/mobile, services/foundation, packages/contracts, packages/design-system, and packages/domain already existed. Added `@curasphere/fhir`, `ai/gateway`, `fixtures/platform/ghana-organizations.json`, and `infra/README.md`. Mobile stays outside the npm workspaces. AsyncStorage stays `^2.2.0`.
Schemas/migrations and rollback evidence: No database migration. The Ghana organizations are not inserted into the chart seed. Rollback removes the files listed in the feature register.
API/event contracts and request/response/error examples: `GET /health` returns `{ status: ok, service: ai-gateway, clinicalGeneration: refused }`. `POST /v1/generate` returns 403 `clinical-generation-refused` and does not echo the request body.
UI routes, accessible screenshots and every relevant UX state: Not applicable. No product screen was added. The existing web and mobile shells were left in place.
Synthetic scenario IDs, preconditions, expected and actual oracles: `fixtures/platform/ghana-organizations.json` labels SYNTHETIC, country GH, two fictional organizations, no patients. The checker rejects a patient shape in the FHIR package. No S01–S20 clinical scenario applies.
Executed test commands: `npm install` exit 0. `npm run platform:skeleton` exit 0 (2 workspace tests passed; typecheck passed for contracts, domain, fhir, web, and mobile). `ai/gateway/.venv/Scripts/python.exe -m unittest test_app.py` exit 0 (2 passed). `bash services/foundation/run.sh compileKotlin --no-daemon` exit 0, BUILD SUCCESSFUL.
Unit/integration/contract/E2E/accessibility/load tests: The commands above were executed. No browser test was run because no screen changed.
Auth/tenant/facility/purpose/consent/audit evidence: The generate route refuses every caller. It does not read a tenant from the client.
Clinical and AI safety review and evidence: Clinical generation stays refused. No model is selected. Classification stays pending.
Observability/alert/runbook/degraded-mode and rollback evidence: Health is the only signal in this feature. Metrics belong to P01-F05.
Reviewed approvals: None. This feature did not require a new human signature.
Residual risks, blockers and decisions: `npm audit` reported 1 moderate and 1 high vulnerability and 0 critical. Those findings are not cleared. Infra manifests are not in this feature.
FINAL STATUS: ACCEPTED
