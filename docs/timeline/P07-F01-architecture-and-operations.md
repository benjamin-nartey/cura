# Canonical timeline v1 — architecture and operator guide

## Authority and data model

This is a read-only local synthetic interface. Existing `source_versions` is authoritative for historical clinical snapshots; its UNIQUE organization/kind/record/version key and immutable triggers remain unchanged. Source tables own patient membership/current version and authoritative per-record access. No second clinical store, timeline table, migration, consumer or schema-version bump is introduced.

`CanonicalTimelineEvent` in `packages/domain/src/canonical-timeline.ts` is the typed contract. Supported kinds are condition, allergy, observation and medication-order. Every event includes contract version, stable tenant/facility/kind/record/version identity, clinical time and precision (or unknown), separate recorded timestamp, deterministic narrative/template, recorded author/facility/encounter, visibility inheritance and exact source ledger pointer/version/prior-version/byte SHA-256. Medication entries remain drafts or historical cancelled drafts; no signing/execution/transmission occurs.

Observation clinical time uses the persisted effective instant, normalized to UTC. Condition onset preserves date-only precision. Other unknown clinical times stay null. Sort descending by clinical time, falling back explicitly to recorded time, then recorded time and stable ID. No current clock, current-value substitution, external model or generated finding participates. Historical flags describe the current authoritative version relationship; the original source pointer/value remains immutable after a correction. The list hash changes when a new version or current relationship changes.

A bounded SQLite transaction gives the read a consistent source/ledger view. Require every permitted record's complete 1..current version chain; missing, corrupt or over-500 evidence fails without returning a partial list. The bound is global per patient, not a silently truncated page. No F02 materialization or F03 pagination/diff is claimed. Old legacy chart timeline behavior is preserved under ADR-0003.

## HTTP contract

`GET /api/clinical-timeline?patient={id}` returns schemaVersion, events, stable hash, limit=500, permitted coverage and scope notice. `GET /api/clinical-timeline?patient={id}&event={64-hex-id}` returns the event and its exact persisted sourceSnapshot. Patient/event binding is resolved again; no arbitrary table, version or tenant query is accepted. Unknown/duplicate query fields fail 422. Unsupported writes return 405. Responses are no-store/nosniff; no CORS credential sharing or offline clinical cache is introduced.

Foundation sessions are resolved live by the web boundary; revoked local/bound sessions are additionally checked in-domain. Server derives identity/purpose/facility. Require treatment, active account, source-history permission, authorized patient and per-kind read permission. Invoke the existing source record read service before ledger resolution, preserving its policy/dependency behavior. Wrong tenant/patient/event returns no facts; unsupported purpose/admin access is denied. Success/denied audit actions `timeline.canonical.read` and `timeline.source.read` contain only resource IDs/outcomes; no clinical snapshots or values.

## UX and recovery

Open a patient chart and choose View version-linked clinical timeline. Staff can inspect exact current/historical versions, recorded author/facility and unknown/date/instant precision. The view supports loading, explicit empty, controlled service/access error, refresh and cancellation; failed refresh clears prior data. Inspect failure clears source and event data. Requests abort on navigation, so delayed responses cannot repopulate a different patient's view. Native mobile continues its existing chart; this timeline's responsive browser view is verified separately.

If unavailable, check source dependency, current authorization, full ledger chain and the 500-version bound. Do not delete clinical versions or lower permissions to recover a view. Restore corrupted data through the source system's authorized recovery process. Use SQL counts by audit action/outcome for operational monitoring without reading snapshots. The F01 target is correctness of bounded deterministic reads, not a stream freshness SLO; consumer lag/alerting belongs to F05.

Rollback removes the new API/component/chart link and rebuilds; the unchanged authoritative ledger, existing chart and audit history remain available. Local failure/reopen simulations exercise this without destructive database rollback. Never disable source immutability triggers outside isolated test databases.

## Boundaries and pending work

Mutable encounters, appointments, service orders and documentation are not silently substituted into this immutable-version contract. Their adapters/version guarantees and outbox materialization belong to later features. F02–F05 remain NOT_STARTED. Qualified clinical, privacy, architecture and licensing review and formal phase acceptance remain pending; production clinical functions are disabled.
