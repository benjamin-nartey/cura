# ADR-0080 — Authorized projection health and Kafka replay

Status: locally implemented and engineering-verified; qualified review pending.

Use immutable authoritative source, existing outbox and exact derived-cache comparison for patient/coverage-scoped health. Compute current alerts at read time; no separate alert store or schema migration is necessary. The five-minute local target uses oldest outstanding recorded time, never clinical onset time. Unknown/future recording clocks cannot report zero lag. Backwards version recording times block materialized previews even if content hashes match; backdated clinical times and equal recording timestamps remain valid.

Retain SQLite as atomic source/outbox and materialization authority. Kafka transports only opaque ledger/hash pointers, partitioned by a hash of source-record scope. Outbox stays queued until authorized materialization commits. Publish acknowledgements cannot mark clinical processing complete. Duplicate publications and delivery after an offset-commit failure replay immutable coverage-bound command receipts; manual offset commits follow the SQLite transaction. No distributed exactly-once claim is made.

The bounded operator command resolves a live session for each delivery, verifies exact canonical membership/hash and predecessor, and never trusts broker facts. Invalid/unauthorized messages stop without offset advance. Explicit local init provisions the scoped topic; normal reads/work do not create topics. Local broker identifiers are bounded and broker endpoint is loopback-only; deployment security, ACLs, TLS, retention and qualified signoff remain outside this simulation's authorization.

Health API/UI reports broker status as not observed. A source-matched cache does not establish broker uptime. The existing canonical source view remains independently available; unknown dependencies fail closed. Stop stream invocation to roll back operationally, retaining source, queue and run evidence.
