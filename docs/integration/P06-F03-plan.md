# P06-F03 — Signed partner exchange

Local synthetic engineering authority: `../governance/SIMULATION-IMPLEMENTATION-AUTHORITY-2026-11-03.md`. Formal acceptance and production activation remain separate. Source §12 Phase 06 and the derived feature-3 scope were inspected before code. No bulk/resumable processing (F04) or conformance publication (F05) is included.

## Contract and actors

Organization administrators register/disable facility-bound partner connections and explicitly reveal derived signing keys. Keys derive from a persistent external local root (`CURASPHERE_INTEGRATION_KEY`, at least 32 bytes); absence fails closed. Clinicians map a partner's Patient/Encounter reference pair to an already authorized patient/encounter, review imports, and subscribe to that patient's Observation changes. No automatic patient matching or creation: two vendors may reuse identifiers without merging people.

Inbound POST accepts bounded raw UTF-8 JSON, an immutable message ID, timestamp within five minutes and HMAC-SHA256 over protocol version, connection ID, message ID, timestamp and exact body. Invalid signatures never persist bodies. Valid malformed/unsupported payloads are quarantined. Version-1 envelopes contain one R4 Observation with a supported synthetic quantity code/unit, explicit subject/encounter references and a monotonically contiguous partner source version. Unknown fields are rejected, never silently dropped. Reused message IDs with different bytes return conflict. Alternate messages for an identical resource/version return the same review record; conflicting versions are quarantined.

Review uses existing clinical recording/correction services under current treatment authorization. Receipt alone creates no clinical event. The review transaction atomically records source history and partner provenance. Already applied reviews are idempotent. Corrections require unchanged clinical source version and immutable patient/encounter/code/unit/effective time, preserving intervening local edits. Pending identity mappings cannot be retargeted. Closed encounters or source outages fail without partial writes.

Outbound subscriptions have active/paused/ended states and optimistic versions. Observation recording/correction queues immutable snapshots in the same clinical transaction. Explicit export also queues the current snapshot idempotently. Delivery rechecks original live session, current patient authorization, connection and subscription before each attempt. HTTP POST is bounded, signed and restricted to literal IPv4 loopback, an explicit high port and `/curasphere/webhook`; redirects are forbidden. Durable leases support restart recovery, bounded exponential retries and terminal quarantine after five attempts. Remote receivers must deduplicate stable delivery IDs; acknowledgement loss can cause safe redelivery, not an exactly-once network claim.

## Data and controls

Schema 50 adds connections, immutable identifier mappings, inbox, applied resource heads, subscriptions and outbox. Scope keys include organization/facility/connection. Persist payloads only in authorized clinical integration tables; no secrets or clinical values in audit/error/metrics. Immutable receipt/payload identities and source-version uniqueness, CAS updates and SQLite write transactions protect concurrent workers. A stable root must survive restart; key loss stops exchange. Operational rollback disables connections/worker, preserves schema and evidence, and retains clinical records. Destructive rollback is disposable-fixture only.

## UX and verification plan

`/interop/partners`: role-specific configuration, mapping, signed simulation instructions, inbox diagnostics/explicit review, subscription controls, export, delivery/retry status and real errors. Secrets are only returned by explicit admin action and held in browser memory. Empty/loading/error/conflict/offline states, accessible labels/status and responsive tables are required. Native mobile administration is N/A: workforce web administration only, existing mobile workflows receive regression tests.

Tests must prove two partners with duplicate identifiers, duplicate/concurrent imports producing one clinical event, out-of-order/malformed quarantine, signature/replay/tenant/purpose/consent denials, durable restart, migration atomicity, source-write rollback, lost acknowledgement/deduplicated real HTTP delivery, lease/backoff/exhaustion, pause/disable/revocation, accessibility and actual browser flow. Preserve prior tests and evidence; record only executed outcomes.
