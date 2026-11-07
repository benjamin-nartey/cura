# ADR-0082 — Deterministic source-backed Twin state

Status: locally implemented and engineering-verified; qualified review pending.

Use the F01 source inventory and owner/context model without consuming evidence-capture quota. Separate schema-55 append-only state builds and command receipts preserve source and legacy contracts. Rebuild is synchronous and bounded in F02; asynchronous freshness/repair scheduling belongs F04.

Declare literal status and recency rules. Never turn medication drafts into active therapies or missing data into reassuring clinical absence. Keep separate source records and equal-time candidates; do not silently reconcile clinical disagreement. Future-versus-own-recording or missing observation times remain unprioritized. State/conflict hashes depend on source bytes and rules, not processing time. Operational metadata is separate.

Current reads reauthorize sources and reproduce the expected state before serving persisted facts. Stale or tampered state cannot be served. Rebuild appends a source-validated repair rather than modifying immutable evidence. Same-source rebuild reuses version/time; receipt replay never asserts today's freshness. Source inspection binds selected patient/current build/source membership and exact snapshot SHA. No source writes, risk algorithms, production activation or invented qualified approvals.
