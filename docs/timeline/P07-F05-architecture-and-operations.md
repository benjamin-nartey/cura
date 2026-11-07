# P07-F05 architecture and operations

Local synthetic scope only. Formal acceptance and qualified reviews remain pending; production clinical functionality remains disabled. No schema migration: source, pointer outbox, derived event cache and immutable command receipts remain schema 53.

## Health contract

GET /api/clinical-timeline/projection retains its existing authorization, strict patient query, same-origin and no-store contract and adds health. Every read reauthorizes canonical source coverage, then inspects only corresponding patient/tenant/facility/kinds in one transaction. Success emits timeline.projection.health audit without clinical payload. health contains operational checkedAt, targetSeconds=300, oldestOutstandingRecordedAt/lagSeconds, missingEvents, duplicateIds, conflictingTimestamps, coded count/message alerts, state, authorized-coverage scope and brokerStatus=not-observed. It includes no copied clinical measurements, names, source IDs or session credentials.

Lag is the age of the oldest outstanding source recording, not clinical onset time or Kafka consumer offset lag. Missing cache rows and queued source versions are outstanding. Future or unknown outstanding times yield unknown lag and a clock alert. No outstanding versions means zero lag. Source version recording times that move backwards trigger a conflict and block materialized facts; equal recording timestamps and backdated clinical times remain valid. Missing, duplicate embedded event IDs, mismatched/extra bytes and dead-letter alerts direct investigation. Existing exact canonical hash/byte comparison withholds suspect cache. Source failure is unavailable, never healthy-empty.

Health is a current computed view over durable evidence, not a stored incident/notification history. The materialization panel presents scoped health, counts, coded alerts, operational check time and recovery guidance. Loaded health refreshes every 30 seconds only while visible, connected and idle; no write is triggered. It clears on failed refresh/offline/source uncertainty with existing F04 controls, stops observation and requires explicit refresh after reconnect. The UI does not claim broker uptime; even healthy source/cache match is not transport monitoring. Five minutes is a local simulation target, not an approved clinical SLO.

## Kafka transport

Install uses pinned kafkajs 2.2.4. Existing local compose Kafka 3.9 runs on loopback 19092. The adapter rejects non-loopback broker endpoints; it is an explicitly local simulation adapter. Use `docker compose -f infra/local/compose.yaml up -d kafka`. Allow broker/group coordinators to become ready. No unrelated containers need restart.

`npm run timeline:stream` is a bounded one-pass operator CLI. Supply the four existing local synthetic flags, CURASPHERE_TIMELINE_SESSION and CURASPHERE_TIMELINE_PATIENT through a secure environment. Optional CURASPHERE_TIMELINE_BROKER defaults to 127.0.0.1:19092. Do not print/store credentials. CURASPHERE_TIMELINE_STREAM_ACTION is init, publish, consume or relay (default).

Run init once with actual scoped authority to provision the hashed patient-scope topic/group (one partition, one replica, 24-hour local transport retention). No clinical values or raw patient identifiers appear in the topic/key/payload. Publish reads up to 50 authorized queued source versions in version order; the payload is exactly v, opaque ledgerId and sha256. The key hashes organization/facility/patient/kind/record so record versions stay ordered. Acks=all publication leaves outbox status unchanged; duplicates are expected until consumption succeeds.

Consume resolves actual Foundation/local session per delivery, reauthorizes exact canonical membership, ledger/hash/contract and predecessor, and commits SQLite materialization plus its immutable command receipt before manually committing offset+1. Existing receipt keys make redelivery idempotent. SQL/authorization/source/poison failure stops the pass without committing the failed offset. Never skip offsets to hide errors. Already committed earlier messages are retained. A process crash between database and offset commit safely redelivers. The adapter does not claim distributed exactly-once semantics.

The pass consumes at most 50 deliveries, then stops; it also stops after a short joined-consumer idle window or bounded deadline. End-of-pass is not proof that a whole backlog is drained: read actual pending/health and repeat relay with live authority until source/hash freshness is established. Group retry/readiness are bounded. Normal reads do not contact Kafka. A Kafka outage leaves source/outbox commits intact; canonical source view remains available. Restore broker and authority, rerun relay, then explicitly refresh the UI. Existing direct SQLite worker remains a valid local alternative, clearly separate from Kafka evidence.

## Failure recovery and rollback

For missing/lag: verify source access, broker/group readiness and session validity, relay bounded pages and refresh exact hashes. For dead letters/invalid contract: inspect existing sanitized queue diagnostics; restore authoritative pointer/source integrity, then use the existing reviewed source rebuild if appropriate. Rebuild touches derived data; it cannot repair corrupt source or backwards source-version chronology. Do not edit immutability guards in operation.

Offsets are committed only after authorized local persistence. Never inject clinical payloads into Kafka, reuse topic/groups across different patient scopes or accept a broker payload as authority. Changing the live patient's identity must establish a new scoped stream. Local single-broker retention/plaintext/one replica are not production availability, security or retention acceptance; genuine deployment requires qualified decisions and secure transport/ACL/identity configuration.

To disable: stop stream CLI invocation, remove health UI integration if necessary and retain source/outbox/run evidence. No destructive down migration or clinical deletion is needed. Tests use disposable databases and unique topics. The outage test stops only the named local Kafka service and restores it in finally. It accelerates clinical-fixture time thirty minutes while actually stopping/restarting Kafka; broker clocks remain wall time. It is not a thirty-minute wall-clock availability test.

KafkaJS contracts: https://kafka.js.org/docs/producing and https://kafka.js.org/docs/consuming .
