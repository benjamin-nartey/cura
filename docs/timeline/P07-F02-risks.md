# P07-F02 risk controls

| Hazard | Control |
| --- | --- |
| Lost source event | Source-version trigger enqueues in the same transaction; migration and idempotent consumer backfill; actual queue-failure source rollback test. |
| Duplicate/out-of-order event | Unique ledger/event pointers, source-version ordering and predecessor check; repeated command/rebuild hashes and duplicate delivery tests. |
| Partial rebuild/process crash | Single bounded transaction; actual process kill after uncommitted row and competing-process tests; source rows untouched. |
| Cached stale or unauthorized clinical facts | Current canonical reauthorization and exact byte comparison before returning events; no cached events on mismatch/dead letter; canonical view remains separate. |
| Poison event | Sanitized durable quarantine, no automatic clinical import; explicitly requested, source-validated rebuild retains original diagnostic and resolution run. |
| Privilege/tenant crossover | Server session/purpose/context, inherited history/kind/patient/facility policies, scoped queries and permission-aware rebuild. |
| Unbounded memory/body/work | 500-source-version bound, 50-pointer pass, 2-KiB streaming body bound, explicit operator invocation. |
| False production readiness | Local-only sandbox gate, no model/clinical execution, no external Kafka/Bulk Data claim and genuine qualified reviews remain pending. |

A rebuild is a derived data operation, not a clinical correction or qualified signoff. Privacy retention, operational scheduling and external stream deployment require their actual production design/review; no synthetic test grants those approvals.
