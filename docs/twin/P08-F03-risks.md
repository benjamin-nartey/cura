# P08-F03 risks and controls

- False reconciliation: preserve source assertions and versions, no winner or automated source edit; uncertainty and no-candidate states never imply clinical safety.
- Draft medication inference: compare only proposals; cancelled drafts excluded from dose disagreement. No active therapy, interaction or dosage recommendation.
- Revoked source access or stale cache: reauthorize and reproduce F02 state on every read/write; scope by current organization/facility/patient/treatment/coverage and owner build; stale hides candidates/queue.
- Forged escalation: server recomputes candidate identity and original build digest; bounded fixed-target requests contain IDs and hashes, no free-text judgment. Immutable FK evidence and transaction-bound receipts.
- Duplicate/concurrent requests: durable source-candidate deduplication plus actor key idempotency; quota and failure/race tests.
- Misrepresented review: local queue only; no external delivery, reviewer assignment, clinical resolution, licensing or qualified acceptance claimed. Source changes preserve open historical request metadata.
- Interrupted network: abort/clear, explicit refresh, no write replay; cancellation warns that committed requests can remain.
- Operational evidence loss: append-only source/review evidence, consistent before-backup, primary-key/value preservation comparison and prior shared evidence archive.

Residual limits: source-provided concept identity; recorded history may contain distinct episodes; deterministic patterns are bounded and incomplete, not diagnostic inference. Shared queue requires matched authorized source coverage and a current build per reader. Qualified review workflow, retention and production release remain pending. F04 max-age/asynchronous processing and F05 advanced/native UX are separate.
