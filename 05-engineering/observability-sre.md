# SRE and Observability

Telemetry uses OpenTelemetry semantic conventions where possible. Each user journey gets SLI/SLO, error budget, runbook, dashboard and paging policy. Avoid alerting on every error; alert on user/safety impact.

Track RED/USE metrics plus domain metrics: chart-open latency, result-delivery delay, note-save success, AI grounding rate, model fallback rate, human override rate, tool-call failure, queue age and stale-twin rate.

Run quarterly disaster-recovery exercises and routine game days for dependency, zone, database, queue and AI-provider failures.
