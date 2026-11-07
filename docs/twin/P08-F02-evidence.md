# P08-F02 — Deterministic projection evidence

Local synthetic engineering verified 2026-11-05. Formal Phase 08 remains NOT_STARTED; qualified prerequisite/clinical/privacy/architecture/licensing reviews remain pending. Production clinical functions remain disabled. P08-F03 is not started.

## Delivered

Schema 55 adds immutable owner/context-bound twin_state_builds and twin_state_commands. The new projector reuses F01's actual source inventory and rights/availability checks, without spending F01 capture quota or changing legacy PatientState/source rows. Rebuild stores derived state with exact source references, schema/rules version, source/state hashes, materialization version, source recording watermark and processed time.

Declared deterministic rules preserve literal statuses and separate source records. Entered-in-error/unknown verification is not promoted active. Medication drafts are not therapies; no care-gap inference or risk score is generated. Observation selection uses latest eligible clinical time within exact supplied code/system/version/unit groups; missing, unsupported or future-versus-own-recording times remain unprioritized. Ties and recorded status differences remain separately sourced structural ambiguities. Work coordination uses kind-specific open/terminal sets; unknowns remain unclassified. All source assertions remain inspectable in allFacts, including unselected ones.

Same-source rebuilds reuse original version/processedAt; state/conflict bytes and hashes are independent of the processing clock. Changed sources yield a new version. Old-command replay re-evaluates freshness and cannot falsely mark old state current. Current reads reauthorize and reproduce expected source-backed state before serving cached facts. Stale returns state=null; corrupt or forged cache fails closed. Explicit rebuild appends a repair without rewriting old evidence. Failed receipt insertion rolls back new state/version.

GET/POST /api/patient-twin/projection are strict, same-origin, no-store and live-authorized. Exact build/source inspection requires current selected-patient source membership. The Twin page adds a real read/rebuild/source-inspection panel with timestamps, recording-age lag, values/statuses, structural ambiguity, current/stale/not-built/empty/error/cancel/offline states and no queued rebuild replay. F01 evidence and legacy interfaces remain available independently. No automated source edits or clinical actions are introduced.

Implementation: packages/domain/src/twin-projection.ts, twin-projection-schema.ts, schema-55 migration in db.ts, source-inventory reuse export in twin-evidence.ts, /api/patient-twin/projection, apps/web/components/twin-projection.tsx and the Twin page. Disposable rollback chaining and latest-schema expectations are updated; older migration failure-boundary assertions remain intact.

## Executed verification

Artifacts below are under artifacts/governance-v2/.

| Check | Observed result |
| --- | --- |
| Full domain npm test | 575 pass, zero failures — P08-F02-domain.log |
| npm run twin:projection:test | 15 focused cases pass, overlapping full suite — P08-F02-focused-final.log |
| Live F01 + F02 browser | Eight pass — P08-F02-browser.log, .json; source evidence regressions, deterministic repeated rebuild, actual correction 37.1 to 37.6, stale withholding/409, exact source inspection, owner/tenant/role/origin boundaries, idempotency, errors, offline/reconnect and empty state |
| Accessibility/responsive | Axe and 390-pixel containment pass in browser suite; distinct projected region labels coexist with F01 source regions |
| Actual Metro mobile/browser/API | Four pass — P08-F02-mobile.log, separately archived evidence |
| Types | Workspace contracts/domain/FHIR/web pass — P08-F02-types.log; P08-F02-domain-types-final.log and P08-F02-mobile-types.log |
| Lint/build | Scoped lint and optimized final build pass — P08-F02-lint-final.log, P08-F02-build-final.log |
| Governance | 16 v2 + ten local/review pass — P08-F02-governance-final.log, P08-F02-governance-local-final.log |
| Conformance | Eight pass — P08-F02-conformance.log |
| Existing live-identity worker | Four newly queued clinical versions processed; matching current 168-event timeline, Twin state current at materialization version 3, actual materialized source modal/focus verified — P08-F02-worker-smoke.json, .log |
| Original data | Schema 54 to 55; original primary keys and values unchanged across 35 clinical/provenance/integration/SMART/batch/appointment/projection/snapshot/F01-evidence tables — P08-F02-preservation.json, .py |

Focused oracles cover same-state/conflict hashes across fresh rebuild and clock advance; every fact resolving exact source fields/SHA; late arrival losing to newer clinical time; equal-time candidates retained; source correction/version propagation; entered-in-error condition and cancelled work classification; structural status differences; unknown/future clocks; stale replay/context collision; owner/role/tenant/session denial; source outage including empty portfolio; forged cache with recomputed digest; source-validated append repair; failed SQL receipt/DDL rollback; real competing SQLite processes; actual 100-build and 200-command retention limits. Source rows are not modified by the projector.

The live browser creates a new synthetic observation through the actual clinical workflow with a current recorded clinical time, rebuilds, then uses the actual authorized correction endpoint. The old state is withheld and its projected inspection returns 409. Rebuild advances materialization and exact source inspection returns version 2/value 37.6 with matching SHA. Existing pre-feature clinical records are not corrected or deleted.

Screens P08-F02/state-desktop.png, state-phone.png and state-stale.png were visually checked. The stale capture shows facts withheld while processing/source metadata remains explicit. Consistent pre-feature snapshot is P08-F02-before.sqlite. Original shared F01/mobile evidence and generated Next configuration hashes are restored; this run is separately archived. Newly created synthetic rows, state/evidence versions and processing receipts remain in place. No clinical cleanup deletion is performed.

## Scope, operations and remaining work

[Plan](P08-F02-plan.md), [ADR-0082](../adr/ADR-0082-source-backed-deterministic-twin-state.md), [rules/API/operator guide](P08-F02-architecture-and-operations.md), [risks](P08-F02-risks.md), [scenario oracles](P08-F02-scenarios.json).

Current means source-byte/rule match, not clinically validated recency or a live-feed guarantee. Latest eligible observations have no age cutoff in F02. Source watermark, processedAt, checkedAt, source-to-processing delay and outstanding recording-age lag are distinct; unknown clock/change time is not zero backlog evidence. Draft-only sources cannot establish active therapies. Care gaps/risk remain explicitly unassessed. Missing fields in current source patches are not invented. F03 clinical disagreement/escalation, F04 age/asynchronous refresh and F05 advanced/native UX remain separate. Wider source families, deployment retention/erasure/capacity and clinical policy require qualified review.

Source-authorized synchronous rebuild is bounded. Restore authority/services before retry, use a new explicit key for damaged-derived-state repair and retain source/evidence. Operational rollback disables invocation/UI while preserving builds/receipts; disposable down-migration helpers must never be used on clinical data. No source editing is exposed through Twin.

No new official FHIR validator run is needed or claimed: R4 serialization is unchanged, prior Phase 06 eleven-case evidence remains intact and current conformance regressions pass. Remote CI has not executed the uncommitted changes. No commit, push, merge, publication, deployment or production activation occurred.
