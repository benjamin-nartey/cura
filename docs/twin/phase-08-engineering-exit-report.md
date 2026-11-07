# Phase 08 engineering exit and formal acceptance boundary

Date:2026-11-06. Formal acceptance: **BLOCKED**. Formal Phase 08 remains NOT_STARTED. The bounded local engineering feature set P08-F01 through P08-F05 is verified; qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending. Reviewer identities/signatures are not invented. Production clinical functionality remains disabled. Phase 09 has not begun.

## Original exit criteria and evidence

| Original criterion | Bounded local engineering proof |
| --- | --- |
| Rebuildable from source events | F01 immutable clinical/work ledger pins, F02 deterministic exact-source state and append repair, F04 source-reproduced worker checkpoints. F05 reuses those builds and exact ledger inspection; no duplicate state store or authoritative source writes. |
| Staleness timestamp visible | F02 source/processed times, F04 per-type operational budgets and checkpoint age, F05 explicit last-check status and source/clinical timestamps. Stale/unbuilt state withholds overview/assertions/comparison; source/tool access remains independently gated. |
| Conflicts represented, not silently merged | F03 side-by-side deterministic conflicts/uncertainty with durable source-verification requests; no clinical resolution. F05 review counts and source-specific inspection link to the retained conflict workspace, while actual correction comparison retains old/current versions separately. |

Counts are recorded source assertions, not validated medication therapy or clinical absence. Medication drafts remain proposals. Risk and care-gap slots remain unassessed. The implemented scope does not fabricate unavailable lab feeds, expand canonical source families or claim a validated clinical recency policy. The synthetic scenarios and actual correction/history tests prove bounded source semantics, not production clinical effectiveness.

## Feature evidence

| Feature | Evidence |
| --- | --- |
| P08-F01 derived schema/provenance | [F01](P08-F01-evidence.md) |
| P08-F02 deterministic projection | [F02](P08-F02-evidence.md) |
| P08-F03 conflicts/uncertainty | [F03](P08-F03-evidence.md) |
| P08-F04 staleness/rebuild operations | [F04](P08-F04-evidence.md) |
| P08-F05 clinician inspection | [F05](P08-F05-evidence.md) |

The experimental register records automated verification separately from the unchanged formal program registers. Schema 57 remains unchanged for F05; existing migrations and earlier evidence are retained. Actual local source/identity services, SQLite persistence and Expo browser/native code are used with synthetic records.

All five features are ENGINEERING_VERIFIED_REVIEW_PENDING; no feature is represented as formally accepted.

## Executed verification and preservation

616 full-domain cases, 12 overlapping final focused cases, 21 combined live Phase 08 browser cases, one strengthened overlapping native case and four existing mobile regressions pass without failures/skips. Two GET-scheduling, 26 governance and eight conformance regressions pass. Workspace/mobile types, final lint and optimized build pass. See [F05 evidence](P08-F05-evidence.md) for exact commands, artifact paths and defects corrected.

Actual live Foundation-aware workers consume 17 new events, produce a current 223-event canonical/materialized timeline with matching hashes and verify Twin materialization 41, conflict state, background checkpoints and exact clinician evidence. A restored bounded watcher consumes an API-enqueued job. Original primary keys and values across 43 tables are retained at schema 57; 19 earlier evidence files and both generated configuration hashes are restored. No source record was edited by Twin inspection or its workers. New clinical test corrections amend only newly created synthetic records.

Operational fallback through the retained Source tools is covered by all 16 earlier Twin browser cases. Source outage, stale state, revoked authority, exact historical pointers, signed paging, offline/cancelled/late reads and native navigation failure are exercised. Rollback requires removing F05 navigation/read integration, not a destructive database reversal.

## Remaining acceptance boundary

Qualified clinical/privacy/architecture/licensing/prerequisite decisions remain required for formal acceptance. Local browser/Expo tests do not certify iOS/Android hardware, production multi-user/mixed-view capacity, production identity/scheduling, external feed completeness or clinical validity. Remote CI has not run the uncommitted changes. Retain all source/build/job/audit history during rollback; remove F05 navigation/read integration or restore Source tools as entry point without a database downgrade. No commit, push, merge, publication, deployment or production activation is part of this work.

**STOP before Phase 09.** A new explicit user instruction is needed to begin the next phase; pending qualified review status remains truthful.
