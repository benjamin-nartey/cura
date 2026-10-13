# Software Development Lifecycle

## 1. Strategy & portfolio
Define target segments, clinical problems, jurisdictions, business model, value metrics and explicit non-goals.

## 2. Intended-use classification
Classify every feature by user, clinical purpose, automation level and potential regulatory status before design.

## 3. Discovery & workflow research
Map real workflows with clinicians, patients, administrators, payers and operations staff; capture failure modes and equity constraints.

## 4. PRD & measurable outcomes
Write user stories, acceptance criteria, safety outcomes, SLOs, cost budgets and success metrics.

## 5. RFC/architecture
Define bounded context, data ownership, APIs/events, security boundaries, interoperability, data retention, migration and rollback.

## 6. Threat + privacy + clinical hazard analysis
Perform STRIDE-like threat modeling, privacy impact assessment, misuse analysis and clinical hazard/FMEA before implementation.

## 7. Design review
Cross-functional approval by engineering, security, privacy, clinical safety, interoperability, SRE and product owners.

## 8. Implementation
Small reviewed changes, feature flags, migrations, contract tests and generated documentation.

## 9. Verification
Unit, integration, authorization, tenancy, interoperability, performance, accessibility, chaos and security tests.

## 10. AI/ML evaluation
Golden sets, subgroup evaluation, hallucination/grounding tests, prompt injection, calibration, model comparison and cost/latency evaluation.

## 11. Clinical validation
For clinical-impact features, conduct protocol-driven retrospective/prospective validation appropriate to intended use.

## 12. Release qualification
Release candidate is frozen, SBOM/provenance generated, controls attested and operational readiness reviewed.

## 13. Shadow/canary rollout
Observe real traffic or clinical workflow without unsafe action; then progressively enable by tenant/site/cohort.

## 14. Production monitoring
Track safety signals, drift, bias, SLOs, incidents, model behavior, overrides, user feedback and cost.

## 15. Controlled change
Any material model, prompt, data, workflow or intended-use change goes through impact analysis and the required validation/regulatory path.

## 16. Retirement
Deprecate safely, migrate data, preserve audit evidence, communicate impact and revoke obsolete model/tool access.

## Change size
Prefer small reviewable changes. Every PR states behavior change, risk, tests, migration, observability and rollback.
