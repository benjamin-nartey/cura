# PHASE 30 — Advanced Medical AI Modules

**Authority:** Derived execution plan from *CuraSphere Engineering Specification Pack v1.0*, §12, Phase 30. **Original authoritative scope and exit criteria are reproduced below verbatim**. All entity/API/UI/feature breakdowns below are implementation proposals, not additional claims made by the original document.

## 1. Original specification — authoritative

Introduce individually validated imaging, ECG, pathology, dermatology, maternal, cardio and oncology intelligence.

**Original scope:**
- module-specific dataset
- independent validation
- clinical workflow study
- explainability appropriate to modality
- performance monitoring

**Original exit criteria — all mandatory:**
- [ ] Each module has its own intended use and model card
- [ ] No platform-wide blanket approval
- [ ] performance reviewed by subgroup and site

## 2. Proposed bounded context and implementation contracts

- **Bounded context / module:** Advanced medical AI: independently validated modules
- **Candidate schema/entities:** ClinicalAIModule, ModalityInput, ModuleDataset, ModelCard, SiteValidation, InferenceEvidence, ClinicianReview, ReleaseAuthorization.
- **Candidate interfaces (routes/events are proposals, version/authorization required):** /v1/clinical-ai/{modality}/infer, /results, /review; separate deployments per approved module.
- **Expected UI/UX surfaces (implement only when phase permits product UI):** Modality-specific request/review UI, model limitations, evidence and human disposition; gated release status.
- **Dependencies:** All prior phases must have signed-off acceptance evidence. Cross-phase libraries may be referenced, not preemptively implemented here. All external dependencies are behind versioned, tested interfaces.
- **Data authority:** Authoritative services own source facts. Projections, twins, AI artifacts, graph claims, search indexes, caches and analytics are derived; store source ID/version and freshness. For each entity decide tenant/facility scope, permitted purposes and retention before migration.
- **Suggested implementation approach:** Use source-stack baseline unless actual repository has documented, accepted alternative. Create schema/constraints/migrations first (except Phase 00), implement service APIs and durable events, wire role-aware UX, then observability/CI/deployment; apply the micro-cycle for every feature below.

## 3. Numbered feature build order — one complete feature at a time

### Feature 1 — Imaging intelligence module (`P30-F01`)

**Implement in sequence (with global 10-step micro-cycle):** Define specific modality/task (e.g., narrow X-ray finding assistance), approved datasets, DICOM preprocessing, versioned inference, explainability and reviewer workflow.

**Evidence needed to accept this feature:** No imaging inference visible clinically until jurisdiction and site validation complete.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 2 — ECG intelligence module (`P30-F02`)

**Implement in sequence (with global 10-step micro-cycle):** Specify device formats, signal quality, time base, exclusion criteria, rhythm/classification intended use, independent ground truth and alarm governance.

**Evidence needed to accept this feature:** Unusable or out-of-distribution waveforms cause abstain/error.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 3 — Pathology intelligence module (`P30-F03`)

**Implement in sequence (with global 10-step micro-cycle):** Define slide scanner compatibility, tiling, staining/color shifts, annotation provenance, case-level aggregation and pathologist confirmation.

**Evidence needed to accept this feature:** No slide-level clinical report auto-finalized.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 4 — Dermatology intelligence module (`P30-F04`)

**Implement in sequence (with global 10-step micro-cycle):** Define camera/lighting quality, skin-tone and lesion/site stratification, image consent, uncertainty and referral/clinician review limits.

**Evidence needed to accept this feature:** Documented subgroup failures block unsupported clinical use.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 5 — Maternal intelligence module (`P30-F05`)

**Implement in sequence (with global 10-step micro-cycle):** Define specific ante/postnatal task, gestational-age inputs, missing prenatal history handling, site cohorts and obstetric oversight.

**Evidence needed to accept this feature:** Inadequate/contradictory gestational data triggers no actionable inference.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 6 — Cardiovascular intelligence module (`P30-F06`)

**Implement in sequence (with global 10-step micro-cycle):** Define distinct intended use, ECG/echo/vitals boundaries, temporal inputs, calibrated endpoints and cardiology review.

**Evidence needed to accept this feature:** No autonomous therapy initiation or dosage.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 7 — Oncology intelligence module (`P30-F07`)

**Implement in sequence (with global 10-step micro-cycle):** Define narrow imaging/pathology/clinical decision-support claim, staging/source provenance, multidisciplinary review and exclusions.

**Evidence needed to accept this feature:** Unsupported stage/therapy recommendation is blocked.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 8 — Module-by-module release gate (`P30-F08`)

**Implement in sequence (with global 10-step micro-cycle):** For EACH modality separately attach own intended-use dossier, model card, locked dataset, independent external/site/subgroup validation, UX human-factors evidence, authorized jurisdictions and active monitoring. Never share blanket approval.

**Evidence needed to accept this feature:** Shipping one validated modality does not unlock any other module; each one requires explicit human and regulatory signoff.

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

**Scenario specific to this phase:** Simulate synthetic test input bundles per modality, poor-quality inputs, out-of-distribution examples, site shift, subgroup performance gap and clinician override; never represent test scores as clinical validity.

**Required proof design:** Create test data and test oracles for (a) end-to-end happy path, (b) no-data/first-run, (c) concurrent or duplicate request, (d) wrong tenant/facility/role or no consent, (e) network/service outage and recovery, (f) stale/versioned source, and (g) rollback/failed migration as applicable. Use `docs/SYNTHETIC_SCENARIOS.md` and fixture IDs; never test against real PHI. Show screenshot/video/UI-test evidence for material UX states.

**Phase-specific hard test focus:** Modality isolation, quality rejection/abstention, review gates, drift, traceable version and site-specific deployment.

**Special clinical/regulatory boundary:** Live deployment depends on jurisdiction-appropriate regulatory clearance/authorization and protocol-driven validation.

## 5. Phase acceptance check and STOP rule

Original exit criteria above must be proven with actual evidence. In addition, before setting the phase ACCEPTED:

- [ ] Every `P30-Fxx` feature is ACCEPTED with exact files, migrations, endpoints/events, UI states, scenario results and test command outputs.
- [ ] Production code uses real services and proper data ownership; no stubbed runtime features or fake success paths.
- [ ] Full in-scope lint, type-check, build, unit, integration, contract, E2E, accessibility, security, tenancy and privacy tests pass; specialized AI/clinical/standards tests pass where applicable.
- [ ] Observability, dashboards/alerts, runbooks, failure recovery, migration reversal or mitigation and safe rollback are documented and exercised.
- [ ] Clinical safety, privacy, regulatory and architecture reviewers have actually signed off when needed. Do NOT invent approval identities.
- [ ] `progress/phase-register.json` records links and actual results for each source exit criterion, current risks and final status.

**Report format:** status (ACCEPTED/BLOCKED), implemented scope, source exit criteria mapped to evidence, feature completion table, files/migrations/APIs/UI, scenario IDs and results, exact executed test commands and outcomes, security/privacy/clinical concerns, SLO and rollback results, unresolved decisions and human approvals. **STOP after this phase. No further phase is defined in source v1.0. Do not invent Phase 31; request new approved roadmap.**
