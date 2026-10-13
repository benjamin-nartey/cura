# PHASE 02 — Identity, Tenancy & Zero Trust

**Authority:** Derived execution plan from *CuraSphere Engineering Specification Pack v1.0*, §12, Phase 02. **Original authoritative scope and exit criteria are reproduced below verbatim**. All entity/API/UI/feature breakdowns below are implementation proposals, not additional claims made by the original document.

## 1. Original specification — authoritative

Implement organizations, facilities, workforce users, patients, service identities, RBAC+ABAC and policy enforcement.

**Original scope:**
- OIDC/OAuth2.1
- MFA/passkeys
- tenant/facility context
- RBAC + purpose-of-use ABAC
- break-glass access with reason and audit

**Original exit criteria — all mandatory:**
- [ ] Cross-tenant access tests prove isolation
- [ ] Privilege escalation tests pass
- [ ] All access decisions are auditable

## 2. Proposed bounded context and implementation contracts

- **Bounded context / module:** Identity, tenancy, authorization
- **Candidate schema/entities:** Organization, Facility, User, PractitionerIdentity, PatientIdentity, Membership, Role, Permission, PurposeGrant, Session, ServicePrincipal, BreakGlassCase.
- **Candidate interfaces (routes/events are proposals, version/authorization required):** /v1/organizations, /facilities, /memberships, /access/evaluate, /break-glass; auth events.
- **Expected UI/UX surfaces (implement only when phase permits product UI):** Login/MFA, org/facility switcher, staff invitations, role management, access denied, emergency access reason form.
- **Dependencies:** All prior phases must have signed-off acceptance evidence. Cross-phase libraries may be referenced, not preemptively implemented here. All external dependencies are behind versioned, tested interfaces.
- **Data authority:** Authoritative services own source facts. Projections, twins, AI artifacts, graph claims, search indexes, caches and analytics are derived; store source ID/version and freshness. For each entity decide tenant/facility scope, permitted purposes and retention before migration.
- **Suggested implementation approach:** Use source-stack baseline unless actual repository has documented, accepted alternative. Create schema/constraints/migrations first (except Phase 00), implement service APIs and durable events, wire role-aware UX, then observability/CI/deployment; apply the micro-cycle for every feature below.

## 3. Numbered feature build order — one complete feature at a time

### Feature 1 — Tenant/facility hierarchy (`P02-F01`)

**Implement in sequence (with global 10-step micro-cycle):** Migrate organizations, facilities, user affiliations and service accounts with server-resolved active context; prohibit arbitrary tenant IDs from client requests.

**Evidence needed to accept this feature:** Cross-tenant resource guesses yield 404/403 with no metadata leakage.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 2 — Identity provider integration (`P02-F02`)

**Implement in sequence (with global 10-step micro-cycle):** Configure OIDC/OAuth with PKCE, short-lived tokens, rotation, MFA/passkeys and explicit patient vs workforce audience. Validate issuer, audience and clock skew.

**Evidence needed to accept this feature:** Expired/replayed/incorrect-audience token rejected.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 3 — RBAC and ABAC policy engine (`P02-F03`)

**Implement in sequence (with global 10-step micro-cycle):** Implement centrally evaluated permissions plus facility, role, patient relationship, purpose, confidentiality and jurisdiction constraints; enforce at query and object layers.

**Evidence needed to accept this feature:** Table-driven policy tests and row-level tenant isolation pass.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 4 — Workforce lifecycle UI (`P02-F04`)

**Implement in sequence (with global 10-step micro-cycle):** Create invite, accept, deactivate, transfer, assign roles and facilities with revocation semantics and auditable admin UI.

**Evidence needed to accept this feature:** Deactivated staff loses access immediately; no stale session privilege.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 5 — Emergency break-glass (`P02-F05`)

**Implement in sequence (with global 10-step micro-cycle):** Require reason, scope, time-box, re-authentication, alert and elevated audit stream; deny when policy forbids; retrospective review queue.

**Evidence needed to accept this feature:** Break-glass is scoped, expires and triggers independent reviewer alert.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.

## Mandatory feature implementation micro-cycle (apply to EACH feature, in order)

Cursor must run this micro-cycle for feature 1, mark it **ACCEPTED**, then feature 2; there is no skipping to the next feature or phase. For every feature:

1. **Inventory:** Inspect repository, migrations, APIs, UI routes, jobs, tests, feature flags, deployment configurations and earlier-phase outputs. Record existing work and do not duplicate it. Treat the original v1.0 specification as normative; mark newly chosen designs as an ADR.
2. **Specify:** Write user story, allowed actors, intended use and risk classification, dependency graph, success metric, explicit out-of-scope, threat/privacy/clinical hazards, failure modes, API/event schemas and UX states BEFORE production code.
3. **Model data:** Define authoritative vs derived tables, tenant/facility keys, row-level permissions, constraints/indexes, lifecycle states, provenance, concurrency, versioning, deletion/retention policy and migration/rollback. Check that synthetic fixture records for this feature are coherent and linked to earlier fixtures.
4. **Implement backend vertical slice:** Build repository/domain/service, validated request/response schemas, idempotent transaction boundaries, outbox/consumer if asynchronous, error taxonomy, authorization and structured audit. Never rely solely on frontend guards; never use LLM text as the basis for consequential clinical writes.
5. **Implement usable UX:** Build every required view from the real API rather than permanently mocked state. Cover loading, initial empty, no results, success, field validation, conflict (409), unauthorized (401), forbidden (403), network error, stale data, delayed processing, retry, cancellation and restricted/offline behavior as relevant. Include accessibility, time zone, locale and responsive layout.
6. **Generate scenario fixtures:** Use deterministic, clearly labeled **SYNTHETIC** patients, staff, events and infrastructure. Provide happy path, alternate path, edge case, adversarial/privacy case and downtime/recovery case. Fixture must include expected result as a test oracle and must be reproducible from a clean checkout.
7. **Test:** Add unit, integration, contract, end-to-end UI, tenant-isolation, authorization, audit, idempotency, concurrency, accessibility, security and relevant load/resilience tests. Add clinical hazard checks or AI golden-set evaluations for corresponding features. Run them, fix them, and report actual commands/results; don't fabricate passing tests.
8. **Operate:** Add trace IDs, PHI-safe logs, metrics, alerts, dashboards, runbook, error budget and basic cost usage as relevant. Test queue/provider/database failures, restart, replay, degraded mode and rollback with evidence.
9. **Document:** Update OpenAPI/AsyncAPI or equivalent, ERD and state diagram, ADR, feature README, intended-use dossier, risk register, user/admin help, operator runbook and acceptance evidence links where applicable.
10. **Gate:** Record all criteria in `progress/feature-register.json` with test commands, observed results, paths and reviewer identity. If any code, UX, security, privacy, clinical/regulatory, docs, migration or operational criterion is missing, set **BLOCKED**; do not begin the next feature. If human clinical/regulatory sign-off is required, await it—an AI agent cannot self-approve.

No runtime `TODO`, stub endpoint, placeholder screen, hardcoded demo-only authorization, mock production persistence or untested catch-all counts as complete. Mocks are permitted in isolated automated tests and the explicitly marked synthetic sandbox only.

## 4. Realistic synthetic acceptance scenario

**Scenario specific to this phase:** Use DEMO_GH and DEMO_EU separate tenants, overlapping patient display names and facility members with varied roles; include a stolen-session, revoked-user and emergency scenario.

**Required proof design:** Create test data and test oracles for (a) end-to-end happy path, (b) no-data/first-run, (c) concurrent or duplicate request, (d) wrong tenant/facility/role or no consent, (e) network/service outage and recovery, (f) stale/versioned source, and (g) rollback/failed migration as applicable. Use `docs/SYNTHETIC_SCENARIOS.md` and fixture IDs; never test against real PHI. Show screenshot/video/UI-test evidence for material UX states.

**Phase-specific hard test focus:** BOLA/IDOR, cross-facility reads, tampered headers, emergency expiry, role changes, refresh-token rotation.

**Special clinical/regulatory boundary:** Apply intended-use analysis; engineering and synthetic tests alone do not establish clinical/regulatory readiness.

## 5. Phase acceptance check and STOP rule

Original exit criteria above must be proven with actual evidence. In addition, before setting the phase ACCEPTED:

- [ ] Every `P02-Fxx` feature is ACCEPTED with exact files, migrations, endpoints/events, UI states, scenario results and test command outputs.
- [ ] Production code uses real services and proper data ownership; no stubbed runtime features or fake success paths.
- [ ] Full in-scope lint, type-check, build, unit, integration, contract, E2E, accessibility, security, tenancy and privacy tests pass; specialized AI/clinical/standards tests pass where applicable.
- [ ] Observability, dashboards/alerts, runbooks, failure recovery, migration reversal or mitigation and safe rollback are documented and exercised.
- [ ] Clinical safety, privacy, regulatory and architecture reviewers have actually signed off when needed. Do NOT invent approval identities.
- [ ] `progress/phase-register.json` records links and actual results for each source exit criterion, current risks and final status.

**Report format:** status (ACCEPTED/BLOCKED), implemented scope, source exit criteria mapped to evidence, feature completion table, files/migrations/APIs/UI, scenario IDs and results, exact executed test commands and outcomes, security/privacy/clinical concerns, SLO and rollback results, unresolved decisions and human approvals. **STOP after this phase. Do not begin Phase 03 without explicit user permission.**
