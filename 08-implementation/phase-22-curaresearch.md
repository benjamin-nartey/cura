# Phase 22 — CuraResearch

## Objective
Create governed research workspaces, cohorts and reproducible datasets.

## Scope
- protocol/workspace
- IRB/ethics status metadata
- dataset snapshots
- de-identification
- analysis notebooks/exports
- provenance

## Required design work
- Inspect existing implementation and decisions.
- Write/update RFC and ADRs.
- Update data-flow diagram and threat model.
- Classify intended use and clinical/privacy impact.
- Define APIs/events/data ownership.
- Define migrations, rollback and observability.

## Implementation rules
- Tenant/facility context is server-derived.
- Use typed contracts and idempotency for state-changing APIs.
- Long-running processes use durable workflows.
- Do not bypass interoperability, audit or evidence services.
- New AI calls go through the AI Gateway.
- No production mock behavior.

## Test plan
- Unit and component tests.
- Integration and API contract tests.
- Authorization and cross-tenant negative tests.
- Failure/retry/idempotency tests.
- Performance tests for critical paths.
- Security tests relevant to changed attack surface.
- AI/clinical validation where applicable.

## Acceptance criteria
- Research access is purpose-bound
- dataset versions immutable
- export approvals and audit trail
- Dashboards/runbooks updated.
- Rollback verified.
- Documentation and ADRs updated.
- CI is green and no unresolved critical security/safety issue remains.

## Agent completion report
The coding agent must return: changes, files, migrations, APIs/events, tests, security/clinical considerations, observability, rollout/rollback, unresolved risks and exact verification commands. It must not begin the next phase.
