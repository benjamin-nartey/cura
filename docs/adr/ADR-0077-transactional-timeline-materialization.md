# ADR-0077 — Transactional timeline materialization

Status: locally implemented and technically verified; qualified review pending.

Extend ADR-0076's immutable source history with an AFTER INSERT pointer-only outbox. Database triggers cover every committed canonical version, including partner corrections, without duplicating source payloads or requiring all writers to remember a new hook. Backfill and trigger install are one migration transaction. The existing subscription delivery queue has different semantics and remains independent.

Use bounded synchronous SQLite transactions for this local adapter. Persist deterministic per-ledger derived events, scoped command outcomes and outbox lifecycle. No lease is needed while one transaction performs all local work without network awaits. Process death rolls back the transaction; competing processes serialize. A separately invoked worker resolves its live identity before each batch. No Kafka deployment or clinical service substitution is implied.

Rebuild validates current authorized canonical facts and atomically replaces only permitted derived families. Original source snapshots and quarantined diagnostics remain intact. Read previews reauthorize and compare against source before returning any cached facts. Stale/corrupt/missing cache fails closed to metadata while the original canonical view stays available. Formal clinical/privacy/architecture/licensing reviews remain pending.
