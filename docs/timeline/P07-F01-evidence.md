# P07-F01 — Canonical timeline schema: engineering evidence

Local synthetic engineering, 2026-11-04. Qualified review pending. Formal Phase 07 remains NOT_STARTED; production clinical functions remain disabled.

## Delivered slice

A canonical v1 event contract reads existing immutable source_versions for conditions, allergy assessments, observations and medication drafts. Events distinguish clinical time/precision from recorded time, use fixed source-backed narratives, retain author/facility/encounter and exact source ID/version/ledger ID/hash, and identify historical versions. Unknown clinical time is never inferred. Every source inspection reauthorizes the patient and source-kind history and returns the actual persisted snapshot. No generated facts or clinical actions occur.

The authenticated GET API is `/api/clinical-timeline?patient={id}` with optional `event={hash}`. A chart link opens `/patients/{id}/timeline`, with responsive event cards, source inspection, loading/empty/error/refresh/cancellation states and no offline clinical cache. Source-history and per-kind access are inherited. A consistent bounded read transaction rejects incomplete/corrupt/over-500 version evidence; the total bound is checked before invoking a source reader that would load history.

No schema migration or independent timeline store is required: existing authoritative ledger constraints/immutability are reused. Existing legacy timeline behavior is preserved. Mutable encounters/orders/appointments, materialization, advanced filters/diffs and projection health remain later-feature work, not implicit coverage. Native mobile is unchanged; responsive browser coverage and mobile type compatibility are separately stated.

## Actual checks and local evidence

All artifact names below are relative to `artifacts/governance-v2/`.

| Check | Observed result |
| --- | --- |
| `npm test` | 505 pass, zero failures — `P07-F01-domain-verified.log` |
| `node --import tsx --test packages/domain/test/canonical-timeline.test.ts` | 11 pass on final bounded-reader code — `P07-F01-focused-bounds.log` |
| Final browser run: P07-F01 + P06-F01 | Five pass: three new scenarios plus both existing current-source mapping/security workflows — `P07-F01-browser-final.log`, `.json` |
| Existing workspace browser regressions | Three pass in the earlier broad run: sidebar/account keyboard, patient/billing typography/phone containment and portal mobile navigation — `P07-F01-browser.log`, `.json` |
| Conformance regression | Eight pass, no generated-artifact drift — `P07-F01-conformance-regression.log` |
| Governance | 16 v2 + 10 local/review pass — `P07-F01-governance.log`, `P07-F01-governance-local.log` |
| Types | Contracts/domain/FHIR/web pass — `P07-F01-types-regression.log`; mobile types pass — `P07-F01-mobile-types.log` |
| Lint | Full scoped lint passes after final guard — `P07-F01-lint-bounds.log` |
| Web build | Pass: optimized final bounded-reader build — `P07-F01-build-bounds.log` |
| Original-row preservation | Schema 51 remains unchanged; all original primary keys/values retained across 28 clinical/provenance/SMART/integration/batch/component/appointment tables — `P07-F01-preservation.json` |

The new browser scenarios verify repeated stable hashes and actual exact-version API inspection, chart navigation, Axe zero violations, 390-pixel containment, anonymous/role/tenant/origin/malformed/write denials, real empty patient state and restored actual data after a test-injected 503. Screens: `P07-F01/timeline-desktop.png`, `timeline-mobile.png`. Source/workspace regressions also produce run-specific archive copies under `P07-F01-source-regression/` and `P07-F01-workspace-regression/`; existing regression scripts refresh their shared screenshot paths. Earlier logs/validator reports remain intact.

The 11 focused cases exercise source writes, correction with retained old value/version/hash, source immutability, time precision/unknowns, active account/session/purpose/facility/tenant/history/kind checks, saved backlink denial after permission removal, dependency failure, corrupt/missing/oversized evidence, explicit empty state, file-backed reopen reproducibility, PHI-safe audit and recent-record picker behavior. Scenarios map to [the assertion manifest](P07-F01-scenarios.json).

The final deployed-to-local-process smoke (`P07-F01-final-smoke.json`) returned 200 for the list and exact-version inspection, with 123 persisted events and a 1,770 ms observed list read. This is one measured local run, not a production latency guarantee. Final domain type verification after the OIDC test repair is retained in `P07-F01-domain-types-final.log`.

## Defects found and repaired

1. The existing R4 workbench's 30-record inventory sorted random IDs, allowing recent real simulation records to be omitted after history accumulated. It now selects the most recently recorded/created authorized records with deterministic ID ties and the same 30-record bound. A 35-older-record regression proves recent observations remain available. The existing full browser mapping scenario passes after the fix.
2. The existing OIDC negative test changed final base64url text, which can preserve decoded signature bytes. It now flips an actual decoded signature byte and re-encodes it. The verifier is unchanged. The final full 505-case run passes; prior failing log remains retained.
3. Initial new test harness issues (wrong permission-table name, nonexistent empty-patient ID, unsupported purpose enum and an alert selector also matching Next's route announcer) and frontend/type/lint errors were corrected. Corrupt source-reader JSON now produces a controlled unavailable response in this new boundary. Earlier failed logs/traces are retained; no assertions were weakened to accept incorrect source behavior.

## Operation, rollback and pending review

[ADR-0076](../adr/ADR-0076-version-linked-canonical-timeline.md), [architecture/runbook](P07-F01-architecture-and-operations.md), [risk controls](P07-F01-risks.md), [plan](P07-F01-plan.md).

Reads write only structured audit IDs/outcomes. No clinical records are deleted or changed for cleanup. The final snapshot comparison includes compound keys and original columns. Generated Next files are restored exactly to captured starting hashes after verification. Rollback removes the new route/component/chart link and rebuilds; authoritative source records, old timeline and audit evidence remain intact. Actual dependency failure/recovery and database reopen are tested; no stream or Kafka replay is claimed for F01.

No new official FHIR validator execution is needed or claimed for this custom timeline JSON contract; unchanged R4 resource serialization retains the prior Phase 06 eleven-case official validation evidence. CI's existing full domain job includes the new tests through the package script; remote CI has not executed this uncommitted work.

P07-F01 local engineering is verified; formal and qualified clinical/privacy/architecture/licensing reviews remain pending. P07-F02–F05 remain NOT_STARTED. No commit, push, merge, public publication, deployment or production activation was performed.
