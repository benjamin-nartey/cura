# ADR-0083 — Source-pinned conflicts and verification requests

Status: local implementation decision; qualified review pending.

Analyze source-reproduced F02 state with a separate conflict-rule version rather than rewriting existing state hashes. Candidates retain all exact assertions and timestamps. Explicit unknowns and disagreement are not diagnoses; no newer-record winner is chosen across distinct records. Current-source changes invalidate candidate identity and require rebuild/refresh.

Persist local source-verification requests, not clinical reconciliation decisions. Requests bind exact candidate/source refs, original authorized build/hash and patient/source context. A shared same-coverage queue gives authorized treating staff a real in-app review path. No external delivery, assigned reviewer or clinical signoff is invented. No source editing or automated medication/allergy decisions occur through Twin. Source changes mark metadata as source-changed, never clinically resolved.

Separate immutable request/command tables provide deduplication, scoped idempotency, quotas, atomic rollback and recoverable evidence. Metadata only, no copied source values/free-text PHI. Every read/action revalidates source access; stale or unavailable state cannot display cached candidates or accept review requests. Keep existing source/history workflows as authority.

Local engineering verified 2026-11-05; qualified review remains pending. Live accumulated-source regression additionally requires bounded candidate navigation and browser-local sequential fresh GETs to avoid competing identity deadlines. This schedules no commands, shares/caches no facts or authorization, and changes no source/clinical policy. See the P08-F03 evidence for actual transport, browser and preservation oracles.
