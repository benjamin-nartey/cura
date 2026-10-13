# P01-F05 evidence

Feature ID: P01-F05
Phase ID: 01
Feature owner and risk class: Owner role is engineering. Provisional risk class is low.
Intended users and intended use: An engineer traces a platform request across the AI gateway scaffold and the local collector. The scaffold does not diagnose.
Source v1.0 mapping and relevant ADR: Phase 01 observability. `docs/adr/ADR-0054-observability-scaffold.md`. The source docx is not in this checkout.
Inventory findings and changed files: The collector already existed in Compose. This feature adds gateway logs, spans, metrics, `/ready`, and a Grafana seed. The running kind image was not rebuilt.
Schemas/migrations and rollback evidence: No database migration. Rollback removes `ai/gateway/observe.py`, the middleware, `/ready`, `/metrics`, `infra/observability`, and returns the collector verbosity to `basic`.
API/event contracts and request/response/error examples: `GET /ready` status 200 with `status` and `service`. `POST /v1/generate` stays status 403. The observed log line was `{"level":"INFO","service":"ai-gateway","message":"request","correlationId":"req-synthetic-01","traceId":"90df13d99c343fb8eb9db13146aa8583","method":"POST","route":"/v1/generate","status":403}`.
UI routes, accessible screenshots and every relevant UX state: Not applicable. Grafana was not started. The seed file is `infra/observability/grafana/ai-gateway.json`.
Synthetic scenario IDs, preconditions, expected and actual oracles: Request id `req-synthetic-01` and prompt `diagnose this cough` with header `authorization: Bearer local-sim-token`. Expected: the trace id appears in the collector, and `cough`, `local-sim-token`, and `Bearer` do not.

Executed test commands:

- `ai/gateway/.venv/Scripts/python.exe -m pip install -r ai/gateway/requirements.txt` exit 0. Installed `opentelemetry-api==1.31.1`, `opentelemetry-sdk==1.31.1`, `opentelemetry-exporter-otlp-proto-grpc==1.31.1`, and `prometheus-client==0.21.1`.
- `ai/gateway/.venv/Scripts/python.exe -m unittest test_app.py` exit 0. 7 passed.
- `node --test tools/platform/contract-compat.test.mjs` exit 0. 2 passed.
- `docker compose -f infra/local/compose.yaml up -d --force-recreate --no-deps otel` exit 0. A following curl of `http://127.0.0.1:13133/` returned status 200 and `Server available`.
- `ai/gateway/.venv/Scripts/python.exe tools/platform/observe-trace.py` exit 0.
- `docker compose -f infra/local/compose.yaml logs otel --since 3m` exit 0.

Observed trace: collector span name `POST /v1/generate`, trace id `90df13d99c343fb8eb9db13146aa8583`, attribute `correlation.id` `req-synthetic-01`, `http.status_code` 403, service `ai-gateway`. The strings `cough`, `local-sim-token`, and `Bearer` appeared zero times in those logs.

Unit/integration/contract/E2E/accessibility/load tests: The commands above were executed on this machine. Prometheus and Grafana processes were not started. No browser test was run.

Auth/tenant/facility/purpose/consent/audit evidence: The request carries no tenant. The authorization header is not logged.

Clinical and AI safety review and evidence: Generation remains status 403. The prompt was not copied into the log or the span.

Observability/alert/runbook/degraded-mode and rollback evidence: `docs/platform/observability.md`. The first collector recreate needed a second health check before curl succeeded. The trace export after that check succeeded.

Reviewed approvals: None.

Residual risks, blockers and decisions: The kind cluster still serves the P01-F04 image, whose probe is `/health`. The Helm chart was left on that path. Grafana and Prometheus were not run. Risk owner is the engineering role.

FINAL STATUS: ACCEPTED
