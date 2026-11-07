# ADR-0073 — Signed local partner exchange

Status: implemented and locally verified; formal review pending.

Extend the current SQLite/TypeScript experimental services rather than replace the functioning stack. The legacy FHIR inbox/export remains intact. New partner exchange consumes current clinical source records and existing authorization. It supports strict quantity Observations first; unsupported resources and fields are quarantined with diagnostics. Full bulk import/reconciliation belongs to P06-F04.

Use per-connection HMAC keys derived from an external stable root. Canonical signing covers exact bytes, timestamp and message identity. Only local loopback delivery is enabled under the existing synthetic sandbox gate. Signed inbound receipt does not authorize clinical writing; a currently authorized clinician must approve each import. Explicit partner-to-local identity mappings avoid guessing patient identity. Persist partner versions and local source versions atomically with source history using nested SQLite savepoints.

Queue source snapshots transactionally at Observation creation/correction. Keep durable leases and stable IDs; retries re-sign the same body with a fresh timestamp. At-least-once delivery requires receiver idempotency. Revalidate original session and patient policy at delivery; revoke/expiry prevents transmission. Retain failed payloads in scope-controlled quarantine, with no body in logs. A separate operator invocation processes one bounded batch; no hidden process or autonomous network scheduler is installed.

Production network access, real PHI, terminology licensing, legal sharing and clinical approval remain disabled/pending. Neither a partner signature nor a clinician's simulation action constitutes those reviews.
