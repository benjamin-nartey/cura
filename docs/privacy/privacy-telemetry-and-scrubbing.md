# Privacy telemetry and scrubbing

This is an engineering description of the local experimental implementation. It is not a privacy approval, a breach-notification policy, or a claim that every platform log is free of protected data.

## Trust boundary

Application code emits only allowlisted metadata. The domain sink stores the sanitized JSON. The AI gateway logger uses the same idea for its JSON lines. The local Collector (`otel/opentelemetry-collector-contrib:0.120.0`, process version 0.120.1) receives OTLP on `127.0.0.1:14317`, runs transform and redaction, then the debug exporter. There is no approved external exporter. The debug exporter is a local sink, not a production destination.

Browser extensions and developer tools are outside this control. The web app does not send page bodies to an external analytics collector. Server `console.error` call sites that were reviewed emit a fixed category string.

The foundation service tree has no `LoggerFactory` or `println` call sites. This feature did not add a second event taxonomy there.

## Classification

The scrubbing policy excludes the classes `PII`, `PHI`, and `AUTHENTICATION_SECRET`. Those names match the fields this feature must keep out of ordinary telemetry. The policy row also records destination `local-debug` and approval state `pending_policy_approval`.

Safe metadata includes event type, route template, HTTP status, duration, service name, environment, correlation id, trace id, policy version, and a non-sensitive decision category. Protected values include clinical note text, phone numbers, personal email, consent and emergency free text, export contents, download tokens, authorization codes, session cookies, refresh tokens, API keys, passwords, and TOTP material. A synthetic fixture is still treated as protected.

## Allowlist and sanitizer

`sanitizeTelemetry` in `packages/domain/src/telemetry.ts` walks objects and arrays. Allowed keys are operational names such as `event`, `route`, `status`, `correlationId`, `traceId`, `organizationId`, `actorId`, `ruleId`, and the OpenTelemetry names `http.route`, `http.method`, `http.status_code`, `correlation.id`, and `service.name`. Other keys are dropped. Arrays are capped. Strings longer than 160 characters, strings with newlines, URL query strings, and values matching bearer tokens, the synthetic canary prefix, reserved `.invalid` email, a 3-3-4 phone pattern, or a session-cookie assignment are replaced with `[REDACTED]`. The function does not return the original protected value in its diagnostic fields.

If the walk throws, the result is a minimal event `telemetry.sanitizer.failed` with decision `failed`. `emitSafeTelemetry` stores that event and raises a sanitizer-failure signal. It does not store the input. A residual pattern in an otherwise sanitized body is handled the same way.

Metric labels used by the gateway counter are `method`, `route`, and `status` only.

## Collector

`infra/local/otel-collector.yaml` sets `allow_all_keys: false` and allows `http.method`, `http.route`, `http.status_code`, `correlation.id`, and `service.name`. Blocked value patterns mask bearer tokens, the synthetic canary prefix, phone-shaped strings, and session-cookie assignments. A transform processor masks the same classes in log bodies and in span and span-event names before redaction. Pipelines are traces, logs, and metrics, all ending at the debug exporter. `assertCollectorConfigSafe` rejects a document that lacks `redaction:` or `log_statements:`, or that sets `allow_all_keys: true`.

## Audit ledger

`appendAccessLedger` rejects subject, action, resource, correlation, and before/after JSON that matches the sensitive value pattern. Existing rows are not rewritten. Telemetry emission writes `privacy.telemetry.emit` with metadata fields only.

## Signals and alerts

Seeded rules for `org_demo_gh`, all `pending_policy_approval`:

| Rule | Category | Threshold | Severity |
| --- | --- | --- | --- |
| sig.cross-tenant.denied | cross-tenant | 3 | high |
| sig.session.revoked | session | 1 | high |
| sig.emergency.denied | emergency | 3 | high |
| sig.export.large | export | 1 | high |
| sig.export.wrong-subject | export | 1 | high |
| sig.consent.withdrawn | consent | 1 | medium |
| sig.retention.illegal | retention | 1 | high |
| sig.sanitizer.failure | telemetry | 1 | high |

A count below the threshold does not create an alert. The same organization, rule, and source reference does not create a second alert. Status starts at `delivered` when the local dependency control is available, and `delivery_failed` when it is not. The outbox payload is alert id, rule id, severity, and status.

Lifecycle: `detected`, `queued`, `delivered`, `acknowledged`, `investigating`, `escalated`, `resolved`, `false_positive`, `delivery_failed`. Acknowledge requires `privacy.alert.acknowledge`. Investigation, escalation, resolution, and retry require `privacy.alert.investigate`. Investigation notes are sanitized before storage. A version mismatch returns a conflict.

`privacy.telemetry.read` and `privacy.alert.read` are held by the privacy officer and the auditor. Acknowledge, investigate, and the canary console are privacy-officer permissions. `privacy.rule.manage` belongs to the unassigned privacy-engineer role. Reception, records management, legal-hold administration, and organization administration do not receive these permissions. Scrubbing cannot be disabled.

Opening the overview copies an existing large-export monitoring row into `sig.export.large` and a denied-export ledger count into `sig.export.wrong-subject`.

## API and screens

Pages: `/privacy/telemetry`, `/privacy/alerts`, `/privacy/alerts/[id]`, `/privacy/telemetry/health`, `/privacy/telemetry/rules`, `/privacy/telemetry/policy`, `/privacy/telemetry/canary`.

Posts: alert acknowledge, investigate, resolve, escalate, and retry; canary run; collector health. The canary route accepts a scenario id only. The console is refused when `CURASPHERE_ENV` is `production` or `staging`.

## Threat notes

Tested protections cover application sanitizer output, the domain sink, gateway JSON logs, and the local Collector debug export for the canaries that were sent. They do not prove absence of protected data in historical logs, backups, browser extensions, or services that were not exercised. Alert suppression by deleting a rule is limited to `privacy.rule.manage`, which no directory user has. Cross-tenant reads return not found. The ledger hash chain is not rewritten by scrubbing.

## Runbook

Reload only the Collector with `docker compose -f infra/local/compose.yaml up -d --force-recreate --no-deps otel`. Health is `http://127.0.0.1:13133/`. If the process exits on configuration, the previous file is still the source of truth; do not point the debug exporter at an external endpoint. If sanitizer failures rise, read the failure category on the health row. Do not copy the rejected input into a ticket. If notification delivery is `delivery_failed`, restore the dependency control and retry from the alert. Do not mark a signal as a confirmed legal breach from this screen.

## Coverage limits

Grafana and Prometheus are not running in the local Compose project. The seed dashboard is not live evidence. Span-name masking is configured; the generator used for Collector traces does not set a custom span name, so that particular transform was not fed a canary. Metric export through the Collector was exercised for one gauge. Application metric labels were checked in the domain and gateway tests.
