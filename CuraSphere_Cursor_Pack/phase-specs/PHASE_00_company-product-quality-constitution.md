# PHASE 00 — Company, Product & Quality Constitution

**Authority:** Derived execution plan from *CuraSphere Engineering Specification Pack v1.0*, §12, Phase 00. **Original authoritative scope and exit criteria are reproduced below verbatim**. All entity/API/UI/feature breakdowns below are implementation proposals, not additional claims made by the original document.

## 1. Original specification — authoritative

Establish product principles, intended-use governance, documentation standards, QMS-lite controls, risk taxonomy and architecture decision process.

**Original scope:**
- Product charter and market boundaries
- Feature intended-use classification template
- RFC/ADR templates
- Clinical safety and AI risk registers
- Definition of Done and release gates

**Original exit criteria — all mandatory:**
- [ ] No application code beyond documentation tooling
- [ ] Every future feature has an owner, intended user, intended use and risk class
- [ ] Architecture/security/clinical review workflow exists

## 2. Proposed bounded context and implementation contracts

- **Bounded context / module:** Constitution and governance
- **Candidate schema/entities:** FeatureDossier, IntendedUse, Risk, Decision, Approval, ADR, HazardRecord, ReleaseGate.
- **Candidate interfaces (routes/events are proposals, version/authorization required):** Documentation templates; machine-checkable phase manifest, no product API.
- **Expected UI/UX surfaces (implement only when phase permits product UI):** Documentation index, decision and approval templates only.
- **Dependencies:** All prior phases must have signed-off acceptance evidence. Cross-phase libraries may be referenced, not preemptively implemented here. All external dependencies are behind versioned, tested interfaces.
- **Data authority:** Authoritative services own source facts. Projections, twins, AI artifacts, graph claims, search indexes, caches and analytics are derived; store source ID/version and freshness. For each entity decide tenant/facility scope, permitted purposes and retention before migration.
- **Suggested implementation approach:** Use source-stack baseline unless actual repository has documented, accepted alternative. Create schema/constraints/migrations first (except Phase 00), implement service APIs and durable events, wire role-aware UX, then observability/CI/deployment; apply the micro-cycle for every feature below.

## 3. Numbered feature build order — one complete feature at a time

### Feature 1 — Product charter and markets (`P00-F01`)

**Implement in sequence (with global 10-step micro-cycle):** Record intended customers, jurisdictions, personas, value propositions, exclusions, non-goals and measurable success targets. Distinguish administrative workflows from clinical-impact functions.

**Evidence needed to accept this feature:** Charter approved by product owner; every proposed capability linked to a persona and intended use.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 2 — Intended-use registry (`P00-F02`)

**Implement in sequence (with global 10-step micro-cycle):** Implement a documentation schema for feature owner, user, decision impact, patient population, automation level, jurisdiction, regulatory classification as pending/assessed, and prohibited claims.

**Evidence needed to accept this feature:** Template validates mandatory fields; classification never defaults to unregulated.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 3 — Architecture decisions and review (`P00-F03`)

**Implement in sequence (with global 10-step micro-cycle):** Create RFC, ADR and data-flow templates that capture ownership, alternatives, policies, interoperability, security and rollback. Define reviewers and decision records.

**Evidence needed to accept this feature:** A sample architecture decision can be traced to review state and author.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 4 — Clinical and AI risk governance (`P00-F04`)

**Implement in sequence (with global 10-step micro-cycle):** Create risk register structure for scenario, severity, likelihood, mitigations, residual risk, owner, approval and validation evidence; create AI-specific model/dataset/prompt risk templates.

**Evidence needed to accept this feature:** A blocked high-risk sample cannot receive release approval.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 5 — Release and DoD constitution (`P00-F05`)

**Implement in sequence (with global 10-step micro-cycle):** Write feature/phase gates, acceptance evidence manifest, break-glass review, clinical sign-off requirements, change-control and post-release surveillance expectations.

**Evidence needed to accept this feature:** Automated validation rejects incomplete gate manifests.

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

**Scenario specific to this phase:** Simulate three proposed features: admin queue dashboard (low-risk), clinician note draft (review-required), diagnostic AI classifier (potentially regulated). Keep all classifications explicitly provisional.

**Required proof design:** Create test data and test oracles for (a) end-to-end happy path, (b) no-data/first-run, (c) concurrent or duplicate request, (d) wrong tenant/facility/role or no consent, (e) network/service outage and recovery, (f) stale/versioned source, and (g) rollback/failed migration as applicable. Use `docs/SYNTHETIC_SCENARIOS.md` and fixture IDs; never test against real PHI. Show screenshot/video/UI-test evidence for material UX states.

**Phase-specific hard test focus:** Document schema/links, sign-off consistency, disallowed auto-approval, regulatory-pending gates.

**Special clinical/regulatory boundary:** Apply intended-use analysis; engineering and synthetic tests alone do not establish clinical/regulatory readiness.

## 5. Phase acceptance check and STOP rule

Original exit criteria above must be proven with actual evidence. In addition, before setting the phase ACCEPTED:

- [ ] Every `P00-Fxx` feature is ACCEPTED with exact files, migrations, endpoints/events, UI states, scenario results and test command outputs.
- [ ] Production code uses real services and proper data ownership; no stubbed runtime features or fake success paths.
- [ ] Full in-scope lint, type-check, build, unit, integration, contract, E2E, accessibility, security, tenancy and privacy tests pass; specialized AI/clinical/standards tests pass where applicable.
- [ ] Observability, dashboards/alerts, runbooks, failure recovery, migration reversal or mitigation and safe rollback are documented and exercised.
- [ ] Clinical safety, privacy, regulatory and architecture reviewers have actually signed off when needed. Do NOT invent approval identities.
- [ ] `progress/phase-register.json` records links and actual results for each source exit criterion, current risks and final status.

**Report format:** status (ACCEPTED/BLOCKED), implemented scope, source exit criteria mapped to evidence, feature completion table, files/migrations/APIs/UI, scenario IDs and results, exact executed test commands and outcomes, security/privacy/clinical concerns, SLO and rollback results, unresolved decisions and human approvals. **STOP after this phase. Do not begin Phase 01 without explicit user permission.**
