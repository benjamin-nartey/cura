# ADR-0065 — Privacy telemetry and scrubbing

Status: Proposed as an engineering record. This is not a privacy, security, or architecture approval.

## Decision

Ordinary telemetry is minimized before it is emitted, and the local OpenTelemetry Collector applies a second allowlist and redaction step before the debug exporter. Collector scrubbing is not permission to log protected values at the application boundary.

The domain sanitizer keeps an allowlisted set of operational fields. Unknown keys are dropped. Keys that name notes, tokens, cookies, prompts, bodies, or justifications are dropped. Values that match secret, phone, email, or callback patterns are replaced with `[REDACTED]`. If sanitization throws, or the encoded result still matches a sensitive pattern, the original event is not stored. A minimal failure event is stored and `sig.sanitizer.failure` is raised.

Security alerts are separate rows. They store a rule id, category, severity, status, source reference, and actor id. They do not store clinical notes, credentials, or export file contents. Thresholds on the seeded rules are engineering simulation values with approval state `pending_policy_approval`. They are not statutory breach-notification thresholds.

The access ledger remains the protected audit channel. New ledger metadata is rejected when it matches the same sensitive pattern. Historical ledger rows are not rewritten.

## Consequences

Production and staging keep the canary console disabled. Mandatory scrubbing cannot be turned off, including by a privacy engineer. Grafana and Prometheus are not part of the running local Compose stack, so the Next.js privacy screens are the verified local view. This record does not claim that every log on the platform is free of PHI.
