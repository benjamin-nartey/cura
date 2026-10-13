# Observability scaffold

The AI gateway writes one JSON log line per request. The fields are level, service, message, correlation id, trace id, method, route, and status. The line does not include the request body, the authorization header, or the local token.

`GET /health` remains the liveness response and includes `clinicalGeneration`. `GET /ready` uses the same dependency check and returns status `ready` when the process can serve. `GET /metrics` exposes `curasphere_http_requests_total`.

To send traces to the local collector, set `CURASPHERE_OTEL_ENDPOINT=http://127.0.0.1:14317` and run the gateway with the virtualenv in `ai/gateway/.venv`. The collector must already be up from `bash infra/local/up.sh`. Its debug exporter prints the span. Match `traceId` in the gateway log to `Trace ID` in `docker compose -f infra/local/compose.yaml logs otel`.

The Grafana seed is `infra/observability/grafana/ai-gateway.json`. The scrape file is `infra/observability/prometheus.yml`. Neither service is running in Compose. The kind cluster was not rebuilt for this feature, so its probe remains `GET /health`.

A failed request logs `request failed` with the same allow-listed fields. If the collector is down, `tools/platform/observe-trace.py` exits 1 and prints `trace export failed`.
