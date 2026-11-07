# ADR-0086 — Owner-scoped immutable typed claims

Status: local experimental engineering decision; qualified architecture/clinical/privacy review pending.

Retain the legacy chart evidence contract. Extend the existing source-version inventory into a separately versioned typed graph with immutable claim/revision/citation/receipt nodes. Claims remain unverified even when sources match. The initial graph is patient/facility/purpose/owner and exact coverage bound; all citation pointers must resolve through current authorized source inventory. Append revisions under optimistic version and idempotent command control. No arbitrary source URLs, model claims, source writes, clinical recommendations or inferred care gaps are introduced. Changed source pointers withhold dependent text and source edges on read; permission loss cannot expose prior context. A future sufficiency or ingestion feature must explicitly extend this contract rather than assuming citation freshness proves clinical truth.

Operational rollback disables navigation and retains graph/source/audit history. New schema 58 is additive; a disposable test rollback may remove the derived graph tables only. Event payloads carry IDs/versions, not claim text or source content. Existing source/timeline/Twin architecture is reused, not replaced.
