# Phase 19 — Operations Intelligence

## Objective
Forecast and optimize non-clinical hospital operations.

## Scope
- wait-time analytics
- capacity forecasts
- inventory forecasts
- staffing recommendations
- bottleneck detection

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
- Recommendations show factors and confidence
- manual override always available
- business KPI impact measured
- Dashboards/runbooks updated.
- Rollback verified.
- Documentation and ADRs updated.
- CI is green and no unresolved critical security/safety issue remains.

## Agent completion report
The coding agent must return: changes, files, migrations, APIs/events, tests, security/clinical considerations, observability, rollout/rollback, unresolved risks and exact verification commands. It must not begin the next phase.
