# P01-F02 evidence

Feature ID: P01-F02
Phase ID: 01
Feature owner and risk class: Owner role is engineering. Provisional risk class is low.
Intended users and intended use: An engineer starts the local infrastructure with one command. The stack does not store patients and does not diagnose.
Source v1.0 mapping and relevant ADR: Phase 01 local platform. `docs/adr/ADR-0051-local-stack.md`. The source docx is not in this checkout.
Inventory findings and changed files: The foundation service already uses PostgreSQL on 127.0.0.1:5432. This stack uses other loopback ports so that database is left in place.
Schemas/migrations and rollback evidence: No application migration. `bash infra/local/reset.sh` removes only the `curasphere-local` volumes.
API/event contracts and request/response/error examples: Smoke checks Postgres readiness, an absent `patients` table, Redis `PONG`, Kafka API versions, Temporal `SERVING`, MinIO-compatible live health, the Dex discovery document, and the collector health endpoint.
UI routes, accessible screenshots and every relevant UX state: Not applicable. No product screen was added.
Synthetic scenario IDs, preconditions, expected and actual oracles: The chart database starts empty. Stopping Kafka makes `bash infra/local/smoke.sh` exit 1 with `stack smoke failed: kafka`. Starting Kafka again makes the same command exit 0 with `local stack smoke passed`.
Executed test commands: `node --test tools/platform/compose-contract.test.mjs` exit 0, 1 passed. `bash infra/local/up.sh` exit 0 on 2026-10-13 and printed `local stack smoke passed`. The Kafka stop and start checks above were executed the same day.
Unit/integration/contract/E2E/accessibility/load tests: The contract test and the live smoke were executed. No browser test was run.
Auth/tenant/facility/purpose/consent/audit evidence: Dex serves a local issuer for `engineer@adom.invalid`. The static password hash is the Dex sample hash of `password`. The client secret is `local-test-only`. No tenant data is loaded.
Clinical and AI safety review and evidence: Not a clinical release. No model is selected.
Observability/alert/runbook/degraded-mode and rollback evidence: Collector health is part of smoke. Kafka outage is visible as `stack smoke failed: kafka`. Runbook: `docs/platform/local-stack.md`.
Reviewed approvals: None. This feature did not require a new human signature.
Residual risks, blockers and decisions: `minio/minio` and `quay.io/minio/minio` refused anonymous pulls. Object storage is `pgsty/silo` pinned by digest. Docker Desktop had to be started before the engine would answer.
FINAL STATUS: ACCEPTED
