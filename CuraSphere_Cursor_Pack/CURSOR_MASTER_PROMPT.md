# CURASPHERE — CURSOR AI MASTER EXECUTION CONTRACT

> **Authority:** The attached `source/CuraSphere_Engineering_Specification_Pack_v1.0.docx` (September 2026) is the product/architecture baseline. `phase-specs/PHASE_XX_*.md` add proposed executable detail where that document is high level. If they conflict, **the source document wins**. Log the inconsistency in an ADR and stop affected work until resolved. This pack is a development plan, not regulatory, clinical or legal approval.

## Mission
Build CuraSphere as an AI-native governed healthcare operating platform, NOT a chatbot tacked onto an EHR. Its authoritative clinical records, Patient Twin, Facility Twin, Population Intelligence, Evidence Graph, permissioned Agents, policy-aware AI Gateway, interoperability, privacy and patient safety must work together. Use a real end-to-end implementation with coherent **synthetic** scenarios, not a UI prototype or mocked demo.

## First instruction to the agent
Read `AGENTS.md`, the source DOCX, `docs/IMPLEMENTATION_POLICY.md`, `docs/SYNTHETIC_SCENARIOS.md`, `progress/phase-register.json` and the current phase specification. Inspect the actual repository. Determine which phases/features are already complete based on evidence; never mark complete merely because files exist. Start at the earliest incomplete or blocked prerequisite, beginning Phase 00. Do **not** skip a gate. Show the implementation plan for exactly one feature, then execute that feature and its tests. Produce a feature completion report. Move to its successor ONLY after all acceptance criteria and required human reviews pass. Stop when any gate cannot pass; disclose exact blocker.

## Fixed order and stop behavior
- Phases 00–30 run in numeric order. Phase scope and exit criteria come from the original DOCX. Only the current phase may receive new feature work. Existing defects/regressions in completed prerequisites must be repaired before further advancement.
- Inside a phase, finish numbered features one by one. A feature is complete only when database, backend, frontend/mobile where applicable, actual integrations, privacy/security, tests, observability, rollback, documentation and explicit scenario validation are complete.
- Upon completion of the current phase, produce a detailed report and **STOP**. Do not autonomously begin the next phase; require explicit user instruction. This preserves original §13 step 13.
- Do not mark regulated clinical functionality RELEASED without real approved intended-use classification, qualified human signoff, site validation and jurisdiction-specific authorization as applicable. A green synthetic test suite proves software behavior only.

## Architectural guardrails
1. Clinical source records are authoritative. Twins, predictions, summaries, derived metrics and model outputs are versioned **derived artifacts** and may never silently modify source facts.
2. Human clinicians retain control of consequential clinical actions. Deterministic safety rules cannot be overridden by AI prose.
3. Every material clinical AI claim includes source reference/date/version, prompt/model version, limitations, freshness, evidence sufficiency and review status; absent evidence => abstain/flag.
4. Server derives tenant/facility/actor/purpose; enforce RBAC + ABAC at every boundary including events, indexes, caches, tools, exports and analytics. Don't trust tenant IDs from clients.
5. Standards-first: FHIR R4 with documented R5 compatibility, SMART on FHIR, DICOMweb and licensed/versioned terminology including SNOMED CT, LOINC, ICD, UCUM.
6. All provider calls pass through central AI Gateway. Long-running workflows use durable orchestration; async domain events use transactional outbox and idempotent consumers.
7. Use mature baseline selected by source where consistent with existing repo: Next.js/React/TS web; React Native/TS mobile; Kotlin/Spring Boot core; Python/FastAPI/gRPC AI; PostgreSQL; Kafka; Temporal; Redis; S3-compatible; OTel; Kubernetes. Technology substitution requires ADR, migration plan and user approval for material changes. Do not rewrite functioning code merely to match preferred tools.
8. Regulated and nonregulated release trains are separate; data residency, retention, consent and external PHI transfer are policy-controlled per jurisdiction.
9. Feature flags, repeatable migrations, monitoring, support runbooks, recovery and rollback are mandatory, not optional polish.
10. All scenarios use fictional synthetic data. Never seed production with demo PHI, never call a real patient or payment provider in tests, and never interpret demo clinical thresholds as approved medical guidance.

## Verification output after every feature
Return `Feature ID`, `scope`, `implementation paths`, `migrations`, `API/events`, `screens/states`, `scenario IDs and observed results`, `tests and exact shell commands`, `security/tenant evidence`, `clinical/AI safety evidence`, `observability and rollback evidence`, `docs/ADRs`, `open risks`, `human reviews` and final status **ACCEPTED** or **BLOCKED**. Explicitly distinguish executed tests from proposed tests. Update progress manifests with exact evidence. For any failure, fix it rather than proceed.

## Phase exit
After the final feature, re-run FULL relevant CI, cross-tenant suites, integration/E2E, conformance, security scans, load/failure checks and rollback; inspect all original phase exit criteria; update `progress/phase-register.json`, output report and STOP for user approval.
