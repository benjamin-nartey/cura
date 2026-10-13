# PHASE 23 — Imaging & DICOM Foundation

**Authority:** Derived execution plan from *CuraSphere Engineering Specification Pack v1.0*, §12, Phase 23. **Original authoritative scope and exit criteria are reproduced below verbatim**. All entity/API/UI/feature breakdowns below are implementation proposals, not additional claims made by the original document.

## 1. Original specification — authoritative

Introduce PACS-style integration and imaging workflows without autonomous interpretation.

**Original scope:**
- DICOM/DICOMweb gateway
- study metadata
- viewer integration
- report linkage
- de-identification pipeline

**Original exit criteria — all mandatory:**
- [ ] Large-object performance tested
- [ ] imaging permissions enforced
- [ ] diagnostic AI remains separate validated module

## 2. Proposed bounded context and implementation contracts

- **Bounded context / module:** Imaging and DICOM foundation
- **Candidate schema/entities:** ImagingStudy, ImagingSeries, InstanceMeta, ImagingOrderLink, ReportLink, DeidJob, DicomTransfer.
- **Candidate interfaces (routes/events are proposals, version/authorization required):** /dicomweb/studies, /series, /instances, /v1/imaging/studies.
- **Expected UI/UX surfaces (implement only when phase permits product UI):** Imaging study list, DICOM viewer link, report/source link, de-id job monitor, transfer status.
- **Dependencies:** All prior phases must have signed-off acceptance evidence. Cross-phase libraries may be referenced, not preemptively implemented here. All external dependencies are behind versioned, tested interfaces.
- **Data authority:** Authoritative services own source facts. Projections, twins, AI artifacts, graph claims, search indexes, caches and analytics are derived; store source ID/version and freshness. For each entity decide tenant/facility scope, permitted purposes and retention before migration.
- **Suggested implementation approach:** Use source-stack baseline unless actual repository has documented, accepted alternative. Create schema/constraints/migrations first (except Phase 00), implement service APIs and durable events, wire role-aware UX, then observability/CI/deployment; apply the micro-cycle for every feature below.

## 3. Numbered feature build order — one complete feature at a time

### Feature 1 — DICOM metadata and secure storage (`P23-F01`)

**Implement in sequence (with global 10-step micro-cycle):** Register study/series/instance unique identifiers, modality, patient/source links, checksum, immutable object storage and retention; verify payload content type.

**Evidence needed to accept this feature:** Duplicate instance cannot corrupt stored study.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 2 — DICOMweb integration (`P23-F02`)

**Implement in sequence (with global 10-step micro-cycle):** Implement relevant query/retrieve/store interfaces with paging, auth, range streaming, rate limits, retries and access audit.

**Evidence needed to accept this feature:** Cross-tenant image fetch denied even with known instance ID.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 3 — Imaging viewer and reports (`P23-F03`)

**Implement in sequence (with global 10-step micro-cycle):** Integrate standards-compliant viewer, modality navigation, loading/failure states, series thumbnails and links to authored report.

**Evidence needed to accept this feature:** Viewer shows image provenance and no diagnostic AI overlay.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 4 — De-identification pipeline (`P23-F04`)

**Implement in sequence (with global 10-step micro-cycle):** Version de-id profiles for DICOM tags and pixel PHI risk; quarantine and review burned-in annotation cases.

**Evidence needed to accept this feature:** Potential burned-in identifiers flagged, not assumed safe.

**Do not advance until:** real data persistence and API/event contract (if applicable), usable role-appropriate UI or explicit N/A, permission checks, audit, seeded realistic synthetic scenario, relevant edge/failure test, automated execution report, safe degradation/rollback and documentation are all complete and reviewed. Update feature register with path and test evidence; no unchecked criterion is implicitly waived.
### Feature 5 — Performance and recovery (`P23-F05`)

**Implement in sequence (with global 10-step micro-cycle):** Load-test large studies, interrupted uploads, partial series, checksum mismatch and degraded object storage.

**Evidence needed to accept this feature:** Study status clearly reflects incomplete transfer.

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

**Scenario specific to this phase:** Simulate synthetic CT and ultrasound study metadata with generated non-patient images, incomplete series, duplicate SOP Instance UID and pixel text redaction failure.

**Required proof design:** Create test data and test oracles for (a) end-to-end happy path, (b) no-data/first-run, (c) concurrent or duplicate request, (d) wrong tenant/facility/role or no consent, (e) network/service outage and recovery, (f) stale/versioned source, and (g) rollback/failed migration as applicable. Use `docs/SYNTHETIC_SCENARIOS.md` and fixture IDs; never test against real PHI. Show screenshot/video/UI-test evidence for material UX states.

**Phase-specific hard test focus:** DICOM conformance, UID collisions, PHI metadata/pixels, access, large-object throughput and resumable transfer.

**Special clinical/regulatory boundary:** Diagnostic inference is out of scope at this phase.

## 5. Phase acceptance check and STOP rule

Original exit criteria above must be proven with actual evidence. In addition, before setting the phase ACCEPTED:

- [ ] Every `P23-Fxx` feature is ACCEPTED with exact files, migrations, endpoints/events, UI states, scenario results and test command outputs.
- [ ] Production code uses real services and proper data ownership; no stubbed runtime features or fake success paths.
- [ ] Full in-scope lint, type-check, build, unit, integration, contract, E2E, accessibility, security, tenancy and privacy tests pass; specialized AI/clinical/standards tests pass where applicable.
- [ ] Observability, dashboards/alerts, runbooks, failure recovery, migration reversal or mitigation and safe rollback are documented and exercised.
- [ ] Clinical safety, privacy, regulatory and architecture reviewers have actually signed off when needed. Do NOT invent approval identities.
- [ ] `progress/phase-register.json` records links and actual results for each source exit criterion, current risks and final status.

**Report format:** status (ACCEPTED/BLOCKED), implemented scope, source exit criteria mapped to evidence, feature completion table, files/migrations/APIs/UI, scenario IDs and results, exact executed test commands and outcomes, security/privacy/clinical concerns, SLO and rollback results, unresolved decisions and human approvals. **STOP after this phase. Do not begin Phase 24 without explicit user permission.**
