# Phase 07 — Engineering exit and formal acceptance boundary

Date: 2026-11-04. Formal acceptance: **BLOCKED**. Formal Phase 07 remains NOT_STARTED. The bounded local synthetic engineering feature set P07-F01 through P07-F05 is verified; qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending. Reviewer identities/signatures are not invented. Production clinical functionality remains disabled. Phase 08 has not begun.

## Original exit criteria and evidence

| Original criterion | Local engineering proof |
| --- | --- |
| Every event links to authoritative source | F01 immutable ledger/version/SHA backlinks, reauthorized F04 source inspection across canonical/filtered/comparison/materialized views, and F05 actual broker recovery checks resolving all six source versions including exact old/new BP snapshots. No broker payload is accepted as clinical authority. |
| Timeline is reproducible | F01 deterministic source template/identity/hash, F02 duplicate/version-ordered consumption and repeated rebuild hash, F03 immutable snapshot membership and signed source-pinned paging, F05 database reopen and twelve duplicate Kafka deliveries yielding six exact events with matching canonical/projection hashes and no new consumption on resume. |
| No generated facts | Four explicit source families only: condition, allergy, observation and medication draft. Source-derived templates, clinical/recorded time separation, explicit unknowns, exact source JSON/hash checks and no LLM summarization. Missing, denied, stale and offline data never become normal findings or a healthy empty response. |

These are engineering findings within the documented local source-family and 500-version bounds, not qualified clinical/regulatory acceptance or proof of every possible clinical event family. The broader mixed-workflow rehearsal involving late labs, missed visits, backdated notes and rapid orders is not claimed as a newly executed combined end-to-end scenario here. Unsupported families are not fabricated into canonical events. Existing workflows and their prior evidence remain intact. The F05 replay scenario specifically proves corrected structured BP and an accelerated thirty-minute stream interruption.

## Feature completion

| Feature | Local status | Evidence |
| --- | --- | --- |
| P07-F01 canonical source timeline | ENGINEERING_VERIFIED_REVIEW_PENDING | [F01](P07-F01-evidence.md) |
| P07-F02 durable materialization | ENGINEERING_VERIFIED_REVIEW_PENDING | [F02](P07-F02-evidence.md) |
| P07-F03 filtering and snapshot comparisons | ENGINEERING_VERIFIED_REVIEW_PENDING | [F03](P07-F03-evidence.md) |
| P07-F04 source-linked accessible frontend | ENGINEERING_VERIFIED_REVIEW_PENDING | [F04](P07-F04-evidence.md) |
| P07-F05 projection health and Kafka replay | ENGINEERING_VERIFIED_REVIEW_PENDING | [F05](P07-F05-evidence.md) |

The local experimental register records paths and exact engineering evidence separately from the unchanged formal program register. Schema remains 53 after F05; F01/F02/F03 migrations are retained with their original evidence. The implementation uses actual local source and identity services, durable SQLite state and a real Kafka broker with synthetic data.

## Verification, safety and recovery

Latest checks: 545 full-domain cases, nine overlapping health cases, sixteen live web cases, four actual mobile/browser/API regressions and one real Kafka interruption scenario pass. A repeated final-build health capture also passes. Workspace/mobile/domain/stream types, lint, optimized build, 26 governance checks and eight conformance checks pass. Original primary keys and values across 33 tables remain intact; generated config hashes and prior shared evidence are restored. See F05 for exact commands, artifact paths, defects and limitations. Remote CI has not executed the uncommitted changes.

The actual Kafka scenario preserves BP 120/80 then corrected 118/78, source backlinks and canonical hash across interruption, database reopen, failed application and duplicate replay. The thirty-minute interval is accelerated clinical-fixture time; Kafka transport clocks remain real. Recovery establishes hash-matched current data and zero outstanding lag. This does not establish a deployment SLO or thirty minutes of wall-clock outage endurance.

Operational rollback stops new stream invocation/UI integration while retaining source/outbox/immutable receipts. No destructive clinical down migration is needed. Source failure, revoked permissions, wrong scope, out-of-order/poison pointers and corrupt cached facts fail closed. Rebuild repairs derived data only, never missing/corrupt authoritative history. Current health does not claim external paging or broker availability. Production broker security, availability/retention, extended event-family coverage, clinical validation and qualified acceptance remain release work.

No commit, push, merge, publish, deploy or production activation occurred. Stop before P08-F01; a new user instruction is needed to begin Phase 08.
