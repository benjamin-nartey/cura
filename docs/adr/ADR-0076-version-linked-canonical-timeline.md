# ADR-0076 — Version-linked canonical timeline

Status: locally implemented and technically verified; qualified review pending.

ADR-0003 remains valid for the old chart timeline. Its source-row pointer cannot represent exact amended source versions from newer clinical bounded contexts. Add a separate canonical v1 read contract for immutable source_versions, reusing its existing unique tenant/kind/id/version and no-update/no-delete constraints. Do not duplicate source storage or rewrite old endpoints.

Every event resolves to an authorized persisted ledger version and includes its byte hash. Read-time projection is deterministic and bounded; no current clock or model-generated facts participate. Event time and recorded time remain independent, and unknown time is explicit. Histories require both source-kind read and source-history access. A single SQLite read transaction provides a consistent view; publication fails on missing or inconsistent source version instead of mixing snapshots.

No migration is required. Future outbox-driven materialization belongs to F02 and must keep this versioned provenance contract. Mutable encounter/work-order/appointment sources need separate explicit adapters/version evidence before inclusion. Retain legacy timeline behavior during rollout. Rollback removes the new route/UI link and code, preserving all authoritative facts and audit evidence.
