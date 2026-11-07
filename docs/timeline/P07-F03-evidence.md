# P07-F03 — Filtering and snapshot diff evidence

Local synthetic engineering, 2026-11-04. Formal Phase 07 remains NOT_STARTED; qualified reviews remain pending. Production clinical functions are disabled.

## Delivered behavior

Canonical-source filtering supports type, clinical/recorded UTC calendar dates, encounter, ascending/descending chronology, latest-per-record or explicit history and bounded keyset pagination. Signed cursors pin source hash, authorization/session/coverage and query/baseline context; stale context requires restart. Unknown clinical times remain unknown and do not satisfy clinical date filters.

Schema 53 adds immutable owner/context-bound snapshots with exact ledger/version/SHA members and membership integrity digests. Capture keys replay original membership, with bounded retention and no copied clinical values. Snapshot diffs produce one added or amended before→after entry per logical record. Since-last-visit uses authorized completed-visit recorded-time boundaries; tied closure timestamps are explicitly uncertain and missing prior visits never become a no-changes reassurance.

The separate real API-backed explorer is linked from the existing timeline, preserving F01/F02 contracts. It provides filtering/reset, next/previous pages, capture/list/compare, exact old/new source inspection, empty/error/conflict/cancellation and responsive states. The existing observation-correction POST now rejects foreign origins before mutation.

Paths: `packages/domain/src/timeline-query.ts`, `timeline-query-schema.ts`, schema-53 migration in `db.ts`; `/api/clinical-timeline/query`, `/diff`, `/snapshots`; `apps/web/components/timeline-explorer.tsx`; `/patients/{id}/timeline/explore`; `apps/web/lib/timeline-query.ts`; source-correction origin guard. Existing migration fixtures now expect latest schema 53 and remove dependent snapshot structures only inside disposable rollback fixtures.

## Actual verification

Artifacts below are under `artifacts/governance-v2/`.

| Executed check | Observed result |
| --- | --- |
| `npm test` | 533 pass, zero failures — `P07-F03-domain.log` |
| `npm run timeline:query:test` | 16 focused cases pass, overlapping full suite; final run additionally verifies date-only selection and an authorized nurse denied access to another owner's baseline — `P07-F03-focused-complete.log` |
| F01 + F03 live browser suite | Seven pass — `P07-F03-browser-final.log`, `.json`; actual persisted source amendment, before/after inspection, origin denial, stale cursor, snapshots/replay, filters, paging, source error recovery, Axe and 390-pixel containment |
| Additional capture-button check | One targeted rerun passes with actual UI baseline capture and immediate exact-membership comparison — `P07-F03-capture-ui.log`, `.json` |
| Actual Metro mobile/browser/API | Four pass — `P07-F03-mobile.log`, separate `P07-F03-mobile/` evidence |
| Existing shipped projection worker | Actual Foundation session, two new source versions consumed, current projection with 125 events and matching source/cache hashes — `P07-F03-worker-smoke.json`, `.log` |
| Conformance contracts/drift | Eight pass — `P07-F03-conformance.log` |
| Governance | 16 v2 + 10 local/review pass — `P07-F03-governance.log`, `P07-F03-governance-local.log` |
| Types | Full contracts/domain/FHIR/web and native mobile pass — `P07-F03-types-final.log`, `P07-F03-mobile-types.log`; final domain test/code types in `P07-F03-domain-types-complete.log` |
| Lint/build | Full scoped lint and optimized final build pass — `P07-F03-lint-complete.log`, `P07-F03-build-final.log` |
| Original-row preservation | Schema 52→53; all original primary keys and values unchanged across 31 clinical/provenance/integration/SMART/batch/component/appointment/projection tables — `P07-F03-preservation.json` |

Screens: `P07-F03/explorer-desktop.png`, `explorer-phone.png`. F01 and mobile shared screenshot directories were backed up/restored, with this run's copies archived separately. Consistent pre-feature snapshot is `P07-F03-before.sqlite`. Original clinical, queue, cache and run rows remain intact; newly created synthetic test observations/visits/snapshots are retained. No clinical records were deleted for cleanup. Generated Next config files are restored exactly to captured starting hashes after checks.

## Scenario oracles and observed defects

- Current view returns one latest version per logical record; explicit history retains old versions with historical labels. Date-only precision, unknown exclusion, recorded chronology and encounter/type matching are verified.
- Equal-time keyset traversal is deterministic without duplicate IDs. Tampered tokens, different session/filters/snapshot and actual new source versions reject continuation. Tokens contain no raw patient/session/clinical values.
- Exact snapshot membership survives tied recording timestamps, file reopen and a new authorized owner session. A correction yields one amended entry with old v1 and current v2, not contradictory current duplicates. Members and metadata are immutable, count/hash checked and bounded; quota and idempotent replay are tested.
- Last-visit mode explicitly handles no completed visit, real visit closure, same-time ambiguity, later-recorded backdated observations, scheduling downtime/permission denial and corrupt closure evidence. Source outages cannot return reassuring empty comparisons.
- Wrong owner (including an authorized nurse), tenant, patient, purpose, revoked session and removed coverage cannot retrieve baseline facts. Malformed dates, unsupported types/bounds, missing signing root and corrupt member evidence fail closed.
- Failed schema-53 migration rolls back new tables and retains original schema 52/source/queue. Retry succeeds. All 31 original-table comparisons, including compound keys and original columns, pass after the live new-source and worker tests.

The browser flow creates a new synthetic observation at 37.1, captures an actual baseline, attempts a foreign-origin correction (403), then legitimately corrects it to 37.6/version 2. The old page cursor returns 409. API/UI show exactly one amended record and inspect exact old/new source values. Existing pre-feature clinical rows are not amended.

The first browser run retained two harness failures: exact getByLabel selectors did not match nested select text. Accessible combobox-role selectors match the actual controls; no runtime guard or assertion was weakened. API/error tests and prior timeline regressions passed in that run; the corrected complete seven-scenario run passed. Earlier traces remain in `P07-F03-browser-output/`. The targeted capture UI check exercises the actual capture button in addition to API replay.

## Operations, authority and remaining work

[Plan](P07-F03-plan.md), [ADR-0078](../adr/ADR-0078-source-version-timeline-comparisons.md), [architecture/API/runbook](P07-F03-architecture-and-operations.md), [risk controls](P07-F03-risks.md), [scenario manifest](P07-F03-scenarios.json).

Rollback removes new explorer/query/snapshot invocation while preserving immutable references, authoritative source and F01/F02 behavior; retain the source-origin protection. Destructive rollback helpers are only for disposable migration tests. Restore genuine source/scheduling authority or restart stale paging rather than bypass checks. Local retention/read bounds are explicit; deployment retention and capacity remain qualified review work.

No new official FHIR validator execution is needed/claimed for this custom query contract: R4 resource serialization is unchanged, prior Phase 06 eleven-case evidence remains intact and conformance regressions pass. CI's existing full-domain job includes these tests; remote CI has not executed this uncommitted work.

P07-F03 local engineering is verified. Formal clinical/privacy/architecture/licensing and prerequisite reviews remain pending. F04/F05 are NOT_STARTED. No commit, push, merge, external publication, deployment or production clinical activation was performed.
