# P03-F05 experimental evidence

This is experimental engineering evidence. Formal Phase 03 remains NOT AUTHORIZED. DEV-GOV-2026-001 remains PROPOSED. The amendment hash remains `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`. This record does not claim compliance with Ghana’s Data Protection Act, 2012 (Act 843), the GDPR, NIST, OWASP, or HL7. Detection thresholds are simulation values with approval state `pending_policy_approval`. They are not statutory breach-notification rules.

The evidence below names scenario ids and says whether a marker class was absent. It does not repeat the fixture values.

## What was built

Chart schema 37 adds privacy telemetry policies, signal rules, security alerts, alert events, a sanitized telemetry sink, and pipeline health. `applyV36` also applies version 37, and rollbacks that delete the privacy schema delete version 37 so a reopen does not stop at an intermediate version.

`sanitizeTelemetry` allowlists operational fields, drops unknown and sensitive keys, masks protected values, and returns a failed decision without the original input when sanitization cannot complete. `emitSafeTelemetry` stores the sanitized body and appends `privacy.telemetry.emit` with metadata only. New ledger fields that match the sensitive pattern are rejected. Historical ledger rows are not rewritten.

Eight synthetic rules cover cross-tenant denial, revoked sessions, emergency denial, large export, wrong-subject export, consent withdrawal, illegal retention, and sanitizer failure. Alerts dedupe on organization, rule, and source reference. The local outbox payload is alert id, rule id, severity, and status. Lifecycle actions are acknowledge, investigate, escalate, resolve, false positive, and retry. `proposePolicyDisable` always refuses.

Screens are `/privacy/telemetry`, `/privacy/alerts`, `/privacy/alerts/[id]`, `/privacy/telemetry/health`, `/privacy/telemetry/rules`, `/privacy/telemetry/policy`, and `/privacy/telemetry/canary`. The canary console posts a scenario id and is refused in production and staging.

The Collector config at `infra/local/otel-collector.yaml` uses transform plus redaction on traces and logs, and redaction on metrics, with the debug exporter only. The gateway JSON logger redacts the same value classes inside its allowlisted fields.

## Collector inspection

The running image is `otel/opentelemetry-collector-contrib:0.120.0`. The process log reported version 0.120.1. After recreate, `http://127.0.0.1:13133/` returned HTTP 200.

A trace with a disallowed attribute and an allowlisted route value matching the canary pattern was exported by the debug exporter with the route value masked, the disallowed key removed, and correlation id `corr-otel-probe-02` plus a trace id retained. A log body containing the note, token, phone, and cookie classes was exported as masked stars. Correlation id `corr-otel-probe-04` remained. A gauge exported metric name `gen`, dropped a patient-id attribute, masked the route label, and kept correlation id `corr-otel-probe-05`.

A one-off Collector process with a pipeline that referenced an unconfigured batch processor exited 1. Stopping the local Collector made the health request fail with curl exit 7 and the generator exit 1. The Collector log did not contain the payload sent during the outage. After start, health returned HTTP 200 and a benign log with correlation id `corr-otel-probe-06` was exported.

Span-name masking is configured. The generator does not set a custom span name, so that transform was not fed a canary. Grafana and Prometheus are not in the running Compose project.

## Browser workflow

Kojo Asante (`usr_gh_privacy`) opened `/privacy/telemetry`. The overview showed Alerts 1, Unresolved 1, Export signals 1, Sanitized events 0, Sanitizer failures 0, Collector unknown, Destination local-debug. `/privacy/alerts` listed `sig.export.large` as high, export, delivered. Alert `alt_b1677a603f4e4ca2` named source `exp_expafec4fd5133042a3`, rule version 1, actor `usr_gh_privacy`, facility `fac_gh_accra`. Kojo acknowledged it, recorded the investigation note, and resolved it as confirmed. The history showed detected, acknowledged, investigating, and resolved, each attributed to `usr_gh_privacy`. The stored status is `resolved`, version 4, disposition `confirmed`.

The canary console ran `P03-F05-S04` and returned `notice=pass`. The page text did not contain the marker class. The sink then had 1 sanitized row and 0 rows containing that marker class.

Pipeline health accepted disconnected, then ready. The rules page listed all eight rules and said this account cannot change thresholds. The policy page showed `pol_telemetry_synthetic` version 1, `pending_policy_approval`, destination `local-debug`, excluded classes `PII,PHI,AUTHENTICATION_SECRET`, and 31 allowed fields. At a 390px viewport the scrubbing-policy heading was present. The pre-existing hydration warning at `apps/web/app/layout.tsx` remained.

Yaa Asare (`usr_gh_reception`) had no Privacy telemetry link. `/privacy/telemetry` said privacy telemetry is limited to authorized reviewers. A direct acknowledge post returned `error=forbidden`. The alert stayed `resolved`.

Esi Boateng (`usr_gh_reviewer`) could open the resolved alert and its history. The canary console said it is limited to the local privacy test role. No acknowledge or resolve control was shown on the resolved alert.

Ama Mensah (`usr_gh_admin`) had no Privacy telemetry link. `/privacy/telemetry` showed the same limited heading. The session was signed out on the directory page.

## Preserved records

Schema version is 37. Akua Boateng’s consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` is `withdrawn` at version 3. Legal hold `hold_hold293e3f3c90fc4b9a` is `active`. Retention tombstones: 1. Access ledger rows: 83. `verifyAccessLedger` for `org_demo_gh` returned intact.

## Commands

Domain suite: `npm test --workspace @curasphere/domain` — 258 passed, 0 failed, exit 0.

Gateway: `ai/gateway/.venv/Scripts/python.exe -m unittest test_app.py` — 7 tests, OK, exit 0.

Foundation: `./gradlew test --offline` in `services/foundation` — BUILD SUCCESSFUL, exit 0. JUnit XML reported 23 tests and 1 test, 0 failures.

Web typecheck: `npm run typecheck --workspace @curasphere/web` — exit 0. Domain typecheck completed in the same earlier command before the web project.

npm audit for `@curasphere/domain` and `@curasphere/web` — exit 0, vulnerability total 0 in both metadata blocks.

Web production build: `npm run build --workspace @curasphere/web` — exit 0. The route list includes `/privacy/telemetry`, `/privacy/telemetry/canary`, `/privacy/telemetry/health`, `/privacy/telemetry/policy`, and `/privacy/telemetry/rules`.

`npm run governance:test` — 10 passed, 0 failed, exit 0.

`node tools/governance/local-experiment.mjs` in the local sandbox — exit 0. `permitted_feature=none`, `formal_phase02=IN_PROGRESS`, `formal_phase03=NOT_AUTHORIZED`, `formal_exception=PROPOSED`, `amendment_hash_matches=true`. P02-R01 through P02-R06 remained PENDING. R-IMG-DEBIAN, R-CI, R-GOVERNANCE, and R-CLINICAL-DEFAULTS remained OPEN.

## Unverified

Hosted GitHub CI remains unverified. Forty-four Debian high findings remain open. Grafana is not a live dashboard. Browser extensions and historical log archives were not inspected. This canary set does not prove every log line on the platform is free of protected data.
