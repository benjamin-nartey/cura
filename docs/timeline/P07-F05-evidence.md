# P07-F05 — Projection health evidence

Local synthetic engineering verified 2026-11-04 on experimental/phase-03-local. Formal Phase 07 remains NOT_STARTED; qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending. Production clinical functions remain disabled.

## Delivered behavior

The existing authorized no-store projection endpoint now returns current source-coverage health: five-minute oldest-outstanding-recording lag, missing event versions, duplicate embedded IDs, mismatched/extra cache, backwards version recording timestamps, dead letters and uncertain clocks. All checks use actual persisted source/outbox/cache in one scoped transaction. Source failure cannot become a healthy empty response. Existing byte/hash checks withhold suspect cached facts; timestamp conflicts also withhold materialized events even after a byte-exact rebuild. Clinical backdating and equal recording times remain valid.

The materialization panel exposes actual counts, alert codes, operational check time and recovery guidance. It performs read-only health observation every 30 seconds while loaded, visible, online and idle. Error/offline/context invalidation clears assurance and stops observation; reconnect requires an explicit refresh. It never queues/replays commands. Broker availability is explicitly not observed by the dashboard.

The KafkaJS local adapter publishes at most 50 opaque source ledger/hash pointers per pass, with record-scope hash keys and acknowledgements. Publication leaves the durable source outbox queued. The shipped CLI resolves a live Foundation/local identity for each delivery and verifies exact source membership/hash, contract and predecessor. SQLite commit and immutable coverage-bound idempotent receipt precede manual Kafka offset commit. Invalid or failed delivery stops without offset advance; duplicate delivery is safe. Coverage changes cannot reuse an incompatible receipt. No clinical payload or session credential is published. The adapter accepts loopback brokers only; it is local simulation scope.

No schema migration was required: schema 53 already persists source versions, transactional pointers, derived facts and immutable command receipts. No new clinical facts, source writes, execution capability or production gate changes were introduced by the runtime feature. The existing direct worker remains supported.

Files: packages/domain/src/timeline-projection.ts and index export; apps/web/components/timeline-projection.tsx; tools/timeline/kafka.ts and stream-worker.ts; health/Kafka/browser tests; pinned kafkajs dependency and scripts; additive Kafka recovery CI job. The existing GET/POST projection route and authorization contract remain in place, with additive health metadata on GET.

## Actual executed verification

Artifacts below are under artifacts/governance-v2/.

| Check | Observed result |
| --- | --- |
| Full domain npm test | 545 pass, zero failures — P07-F05-domain-final.log |
| npm run timeline:health:test | Nine pass, overlapping full domain suite — P07-F05-focused-complete.log |
| Actual Kafka interruption/replay | One integration scenario passes — P07-F05-kafka-complete.log, P07-F05-kafka-outage.json |
| Final F01/F03/F04/F05 browser suite | 16 pass — P07-F05-browser-final.log, .json; source authorization, actual corrections, snapshots, source inspection, offline/error/cancellation, Axe/phone containment, new health, read-only polling and actual Foundation-aware shipped Kafka CLI |
| Additional final-build health capture | One targeted repeated scenario passes — P07-F05-health-capture.log, .json; actual new source versions, attention UI and healthy recovery, detailed desktop/phone captures |
| Actual Metro mobile/browser/API | Four pass — P07-F05-mobile.log; evidence archived in P07-F05-mobile-workspace-regressions/ |
| Types | Full contracts/domain/FHIR/web and native mobile pass — P07-F05-types.log, P07-F05-mobile-types.log; final domain and strict stream/CLI/integration types pass — P07-F05-domain-types-final.log, P07-F05-stream-types-final.log |
| Lint and optimized build | Pass — P07-F05-lint-complete.log, P07-F05-build-complete.log |
| Governance | 16 v2 + ten local/review pass — P07-F05-governance-final.log, P07-F05-governance-local-final.log |
| Conformance | Eight pass — P07-F05-conformance.log |
| Original-row preservation | Schema 53 unchanged; original primary keys and values retained across 33 source/provenance/integration/SMART/batch/appointment/projection/snapshot tables — P07-F05-preservation.json, .py |

The actual Kafka test stops and restarts the named local broker, proves publication failure retains queued pointers, advances only clinical-fixture time thirty minutes, corrects structured blood pressure from 120/80 to 118/78, reopens the source database and publishes six retained source versions twice. A failed application retains its offset. Twelve subsequent deliveries produce six unique exact source-backed events; both old/current BP snapshots remain inspectable, hashes match, lag becomes zero and resumed consumption sees zero new messages. Broker clocks remain real wall time. This is an accelerated thirty-minute clinical lag simulation with a real interruption, not a thirty-minute wall-clock broker availability test.

The live browser suite additionally creates an actual workspace source version, runs the shipped init/relay CLI under an actual Foundation session, observes nonzero published/consumed counts and verifies current hash-matched healthy status. No session is printed in evidence. Browser source changes are confined to newly created synthetic records; existing originals remain unchanged.

## Evidence preservation and defects resolved

Consistent snapshot: P07-F05-before.sqlite. Generated Next files match the starting SHA-256 hashes in P07-F05-start-hashes.json. Original shared F01/F03/F04/mobile evidence is restored, with this run archived in separate P07-F05-*-regressions directories. Newly created synthetic clinical rows, snapshot members and processing receipts remain; no clinical cleanup deletes were performed.

Detailed captures: P07-F05/health-alerts.png, health-details-desktop.png and health-details-phone.png. Full-page viewport captures are retained alongside them. The detailed captures show the actual attention and recovered health states; browser assertions verify accessibility and responsive containment.

Earlier Kafka attempts are retained. They exposed a too-short broker readiness window under local load and a simulation-clock mistake: globally frozen Date also dated Kafka transport messages in the past, so actual retention expired them. The harness now accelerates only synchronous clinical-fixture operations and keeps transport clocks real; readiness uses a bounded operational deadline and the consumer has bounded coordinator retry/fetch timing. Actual final replay passes. The final code review also caught incompatible receipt reuse after a permission-coverage change; coverage-bound keys and a real authorization regression fix it. No source permissions or safety checks were weakened.

The initial fourteen-case browser suite also passed before adding periodic health observation and live CLI checks. The final sixteen-case run verifies those additions. Failed/earlier logs are preserved; counts above refer to executed successful final checks, not inferred results.

## Operations and remaining limits

[Plan](P07-F05-plan.md), [runbook](P07-F05-architecture-and-operations.md), [risks](P07-F05-risks.md), [scenarios](P07-F05-scenarios.json), [ADR-0080](../adr/ADR-0080-authorized-projection-health-and-kafka-replay.md), [Phase 07 engineering exit](phase-07-engineering-exit-report.md).

Current health is not a durable incident history, external pager or broker-uptime monitor. The five-minute target, single local broker, plaintext loopback transport and 24-hour topic retention are simulation choices, not approved deployment controls. Existing 500-version canonical bounds, four source-family coverage and qualified release restrictions remain. Invalid delivery requires restored scoped authority/source evidence; do not skip offsets or disable immutability. Disable CLI invocation to roll back operationally while retaining source/outbox/run evidence.

The additive recovery CI job is configured but has not run remotely. No extra official FHIR validator execution is needed or claimed: R4 serialization is unchanged; prior eleven-case Phase 06 official evidence remains intact and conformance regressions pass. No commit, push, merge, publication, deployment or production activation occurred. Phase 08 was not started.
