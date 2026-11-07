# ADR-0079 — Shared source-linked timeline UI

Status: locally implemented and engineering-verified; qualified review pending.

F01–F03 already provide canonical history, derived-cache status, filtering and exact snapshot comparisons. Reuse their contracts. Share display cards and one reauthorized source modal pattern across these views, rather than duplicating clinical interpretation or keeping technical JSON as the sole interface. Values/labels remain source facts; missing fields stay missing and historical versions stay historical.

A patient-scoped client connection boundary clears views on offline/reconnect and source uncertainty, aborts requests and requires explicit refresh. No offline clinical storage or command replay is added. A small authenticated readonly check returns current canonical hash/operational check time; 30-second/visible-focus checks only invalidate stale views, never mutate source or assert real-time delivery. Projection lag/alerts/Kafka remain F05.

Native modal semantics with explicit forward/reverse Tab wrapping provide focus trapping and Escape, with explicit focus restoration and in-flight cancellation. Inspect a locally constructed patient/event URL and validate exact ledger/version/hash before rendering. A valid newly-historical response may remain as explicitly historical evidence while lists are invalidated; network/access uncertainty redacts it. No schema or clinical-source change is justified.
