# ADR-0078 — Source-version timeline comparisons

Status: locally implemented and technically verified; qualified review pending.

Keep canonical immutable source history as query/diff authority. Stored materialized rows cannot establish an historical clinical baseline. Add metadata-only snapshots referencing exact immutable ledger versions, with owner/scope/coverage and idempotent capture. Do not copy clinical values into a second source record. Current-only query/diff picks one latest version per logical record; explicit history remains available with historical badges.

Signed keyset cursors pin canonical hash, authorization context and normalized query. Source changes fail with restart conflict, rather than returning an inconsistent mixture of pages. The existing local signing root is domain-separated for timeline cursors; no raw session/clinical values enter tokens. Baseline snapshots are durable owner-bound references and may be reopened under a new live authorized session; paging tokens are session-bound.

An existing visit closure timestamp lacks a transactional source-version membership checkpoint. Treat matching source recorded timestamps as boundary-uncertain instead of claiming exact commit ordering. Since-visit comparisons use recorded chronology, independent of backdated clinical time. Snapshot capture supplies exact membership for future comparisons. All comparisons remain bounded, authorized and deterministic; F04/F05 and production reviews remain separate.
