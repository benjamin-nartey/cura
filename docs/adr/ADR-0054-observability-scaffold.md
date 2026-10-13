# ADR-0054: Platform traces stay on the local collector

Status: Accepted
Date: 2026-10-13

## Context
P01-F05 requires structured logs, correlation IDs, OpenTelemetry traces, Prometheus metrics, a Grafana seed dashboard, and health and readiness. The Compose collector already receives OTLP on `127.0.0.1:14317` and was exporting traces at basic verbosity. The kind cluster still runs the P01-F04 gateway image, which has no `/ready` route.

## Decision
Instrument the AI gateway scaffold in process. Logs are JSON with an allow-list of fields: level, service, message, correlation id, trace id, method, route, and status. A request id is accepted only when it matches `[A-Za-z0-9_-]{8,80}`; otherwise the process generates one. Spans go to `CURASPHERE_OTEL_ENDPOINT` when that variable is set. The collector debug exporter is `detailed`. `/metrics` exposes `curasphere_http_requests_total`. `/ready` follows the same dependency check as `/health`. The Grafana file `infra/observability/grafana/ai-gateway.json` is a seed. Grafana and Prometheus are not added to the running Compose project. The Helm readiness probe stays on `/health` until a newly built image is deployed.

## Consequences
A local request can be matched from the gateway log to a collector span without the prompt or the token. Rollback is to remove `ai/gateway/observe.py`, the middleware, `/ready`, `/metrics`, and the observability files, and to set the collector verbosity back to `basic`. No database migration is involved. No clinical approval is claimed.

## Revisit trigger
Point the Helm readiness probe at `/ready` only after the deployed image includes that route. Start Prometheus or Grafana only with loopback ports and a memory limit, and update the Compose contract test in the same change.
