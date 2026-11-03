# CURASPHERE-US-GOVERNANCE-v2

Policy status: **PROPOSED for formal adoption**. The Product Owner's 2026-11-03 instruction authorizes a parallel, local synthetic engineering track. It does not amend the original constitution, activate DEV-GOV-2026-001, sign Phase 02 reviews, or authorize a clinical release.

## Transition and authority

`release-constitution.json` requires named clinical sign-off for clinical-impact acceptance. `tools/constitution/validate-decision.mjs` requires architecture, security and clinical signatures for an accepted constitutional decision. The change-control version/reason/author fields provide no unilateral succession or waiver authority. The original amendment also requires distinct reviewers and a Product Owner statement. No completed succession process was found. Consequently formal adoption remains proposed; the explicit new instruction is the authority for the separate engineering track only.

The request and its source digest are recorded under `v2/requests/`. The actual working tree takes precedence over its stale inventory: P04-F05 already has experimental engineering evidence. It must be freshly evaluated, not reimplemented or retroactively re-signed. A baseline records the exact hashes of original constitutions, signatures, Phase 02 reviews, formal registers, original risk records, and prior acceptance evidence. Tests verify their preservation.

## Seven independent decisions

1. Engineering completion: implemented behavior with evidence, independently of formal governance.
2. Automated engineering acceptance: ENGINEERING_ACCEPTED only when every mandatory applicable technical gate passes for the current source snapshot.
3. Development deployment eligibility: accepted engineering in an authorized isolated local synthetic environment only.
4. Staging eligibility: explicit environment authority, verified data/secrets/access/deployment controls, and valid governing authority; never the local override.
5. Nonclinical production eligibility: valid adoption, correct function classification, established legal/contractual applicability, actual matching hosted CI, acceptable verified vulnerabilities, ownership, deployment authority, backup/rollback and monitoring.
6. Clinical production eligibility: all applicable safety, privacy, operational, clinical and regulatory obligations; synthetic engineering does not satisfy these decisions.
7. Regulated device authorization: applicable device classification, QMS, evaluation, regulatory and surveillance requirements. Generated approvals are forbidden.

No status implies another. No government endorsement, FDA clearance, HIPAA compliance, ISO certification, legal determination, or clinical validation is claimed.

## Engineering progression

Ordinary feature implementation, synthetic fixtures, migrations, security tests, API/browser checks and isolated simulations do not need repetitive human signatures. One feature is active at a time. The deterministic runner follows the dependency graph and authorized scope, runs real commands, records immutable evidence, repairs through a bounded coding-worker cycle when needed, and advances only after technical acceptance. Missing, skipped, stale or failed evidence blocks progression. Historical unrelated reviews remain visible but do not block authorized local synthetic engineering.

The current scope is the v2 governance migration and fresh P04-F05 acceptance. Phase 05 receives an implementation plan only. Neither proposed policy text nor an automatically selected feature expands scope or grants deployment authority. Future ordinary features can advance without per-feature confirmation when included in an explicitly authorized dependency-ready engineering scope.

## Risk and standards

Classes A–D derive conservatively from documented capabilities and intended use. Mixed billing/chart behavior is C, despite its administrative billing component. Unknown capabilities or ambiguous intended use are restricted. The classification does not decide FDA device status.

The standards matrix pins published references and identifies tests, exclusions and unresolved applicability. U.S. alignment is an engineering baseline, not a declaration that every installation is HIPAA-regulated. HIPAA applicability depends on covered-entity/business-associate roles and the actual data and service relationship. FDA software-function analysis depends on intended use and actual function. Mandatory professional, contractual and regulatory decisions remain outside automated signatures.

Existing R-IMG-DEBIAN (44 historical high findings), R-CI, R-GOVERNANCE and R-CLINICAL-DEFAULTS remain open. Exceptions never change scanner results to remediated. A local scope exclusion requires a concrete exposure rationale and cannot qualify production. Full requirements are in `v2/risk-disposition-policy.md`.

## Implementation status

The implementation and actual test results are recorded in `v2/MIGRATION-EVIDENCE.md`. Formal adoption and nonlocal release authorization remain proposed/ungranted. Production/staging safeguards, authentication, tenancy/facility restrictions, RBAC/ABAC, consent, retention, legal holds, audit, privacy telemetry, versioning, concurrency and idempotency remain mandatory. Real prescription transmission, dispensing, unvalidated diagnosis, autonomous treatment and production clinical break-glass remain disabled.
