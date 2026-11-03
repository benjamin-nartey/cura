# CURASPHERE — GOVERNANCE V2 MIGRATION
## U.S.-Aligned, Risk-Based Automated Engineering and Release Governance

### PRIMARY OBJECTIVE

You are the Principal Software Architect, DevSecOps Lead, Healthcare Software Engineer, Security Engineer and Technical Implementation Lead for CuraSphere.

The Product Owner directs a change in CuraSphere's engineering governance strategy.

**Replace repetitive, internal human-approval requirements with automated, evidence-based quality gates wherever those approvals are not legally, contractually or clinically mandatory.**

The goal is faster implementation, continuous verification and controlled releases without compromising essential healthcare safety and security.

Adopt a U.S.-aligned governance baseline informed by FDA, HHS, NIST, ONC/ASTP and applicable international standards.

Do not claim U.S. government endorsement, FDA clearance, HIPAA compliance or ISO certification.

---

# 1. CURRENT PROJECT STATE

Existing formal records:

- Phase 00: ACCEPTED
- Phase 01: ACCEPTED
- Phase 02: IN_PROGRESS
- Formal Phase 03: NOT_AUTHORIZED
- Experimental Phase 03: ENGINEERING_COMPLETE
- Formal Phase 04: NOT_STARTED
- P04-F01 through P04-F04: EXPERIMENTAL_ENGINEERING_COMPLETE
- P04-F05: NOT_STARTED
- DEV-GOV-2026-001: PROPOSED
- P02-R01 through P02-R06: PENDING

Existing amendment hash:

`b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`

Preserve the original constitution, historical signatures, pending reviews and accepted implementation evidence.

Do not forge historical approvals or retroactively change their meaning.

---

# 2. ESTABLISH CURASPHERE GOVERNANCE V2

Create a proposed new governance policy:

`CURASPHERE-US-GOVERNANCE-v2`

The new framework will distinguish:

1. Engineering completion
2. Automated quality-gate acceptance
3. Development deployment eligibility
4. Staging deployment eligibility
5. Nonclinical production-release eligibility
6. Clinical production-release eligibility
7. Regulated medical-device release authorization

Do not combine these statuses.

### Governance transition

Inspect the existing constitutional amendment and succession rules.

Determine whether the Product Owner can adopt the new framework directly or whether a separate authorized constitutional process is required.

Record this instruction as an explicit Product Owner policy-change request.

If existing rules prevent formal adoption without additional approval, create a transparent parallel engineering governance track rather than falsely changing the original constitution's status.

Do not silently mark the existing six reviews approved.

An explicit new policy cannot retroactively transform missing signatures into completed signatures.

---

# 3. GOVERNING STANDARDS

Use authoritative published versions of the following:

### NIST Cybersecurity Framework 2.0

https://www.nist.gov/cyberframework

Implement measurable controls across:

- Govern
- Identify
- Protect
- Detect
- Respond
- Recover

### HIPAA Security and Privacy Rules

https://www.hhs.gov/hipaa/for-professionals/index.html

Determine HIPAA applicability rather than assuming every CuraSphere deployment is HIPAA-regulated.

Implement appropriate identity, audit, confidentiality, integrity, risk-management and incident-response controls where applicable.

### FDA Software Function Classification

https://www.fda.gov/medical-devices/digital-health-center-excellence

Classify functions according to intended use and the relevant FDA software guidance.

Distinguish administrative software, non-device clinical decision support and potentially regulated device functions.

### FDA Quality Management System Regulation

https://www.fda.gov/medical-devices/quality-management-system-regulation-qmsr

Use applicable QMSR requirements for regulated device functions.

The applicable FDA QMSR incorporates ISO 13485:2016.

### NIST AI Risk Management Framework

https://www.nist.gov/itl/ai-risk-management-framework

Implement applicable model/prompt evaluation, risk monitoring, traceability and controlled promotion.

### ONC/ASTP SAFER Guides

https://healthit.gov/clinical-quality-and-safety/safer-guides/

Use applicable healthcare software safety practices.

### Additional technical controls

Use appropriate OWASP ASVS/API guidance, secure software supply-chain practices, accessibility standards and reproducible testing.

Maintain a standards-applicability matrix with sources, versions, control objectives, test evidence and exclusions.

---

# 4. REMOVE UNNECESSARY MANUAL DEVELOPMENT APPROVALS

Under the new engineering track, do not require human signatures merely to:

- Start an ordinary feature.
- Complete a feature's engineering tests.
- Advance to the next dependency-ready engineering feature.
- Run local simulations.
- Run automated security assessments.
- Generate synthetic datasets.
- Create database migrations.
- Verify API contracts.
- Execute browser tests.
- Deploy into an authorized isolated development environment.

**Automated evidence replaces repetitive manual engineering sign-offs, not legally required professional decisions.**

If all required technical gates pass, mark the feature ENGINEERING_ACCEPTED and permit the next feature automatically.

If a mandatory technical gate fails, block progression until remediated.

Do not stop solely because an unrelated historical governance review remains pending when the new experimental engineering track permits progress.

---

# 5. INTRODUCE RISK-BASED FEATURE CLASSIFICATION

Classify each feature according to actual behavior and intended use.

### CLASS A — Internal and development infrastructure

Examples:

- Developer tooling
- Test infrastructure
- Synthetic-data generation
- Nonclinical internal utilities

Use automated engineering gates.

### CLASS B — Administrative healthcare software

Examples:

- Scheduling
- Workforce administration
- Nonclinical operational dashboards
- Billing administration

Allow automated release eligibility only after all applicable security, privacy, deployment and contractual requirements pass.

Handling real patient information may increase a feature's risk even if its function is administrative.

### CLASS C — Clinical recordkeeping and consequential workflows

Examples:

- Authoritative patient charts
- Clinical documentation
- Clinical orders
- Medication workflows
- Clinical data exchange
- Emergency access

Allow complete synthetic-data engineering with automated gates.

Actual clinical deployment requires the applicable privacy, safety, operational and regulatory controls. Do not make these functions production-eligible merely by renaming their risk class.

### CLASS D — Clinical AI and potentially regulated medical-device functions

Examples:

- Diagnostic predictions
- Treatment recommendations
- Autonomous clinical decisions
- Medical-image interpretation
- High-risk clinical decision support

Maintain a separate validated regulatory/clinical release track where required.

Default unknown or ambiguous classifications to a restricted state.

Risk classification must be based on intended use and actual capability, not a manually selected label intended to bypass gates.

---

# 6. AUTOMATED QUALITY GATES

Create a deterministic governance engine that checks actual evidence.

Suggested command:

`npm run governance:verify`

For each feature, verify:

1. Required functionality implemented.
2. Database migrations valid.
3. Type checking passed.
4. Linting passed.
5. Unit tests passed.
6. Integration tests passed.
7. API contracts passed.
8. Authorization tests passed.
9. Tenant isolation passed.
10. Privacy requirements passed.
11. Security scans completed.
12. Relevant clinical safety constraints passed.
13. Frontend E2E tests passed.
14. Accessibility checks passed.
15. Failure/recovery tests passed.
16. Migration rollback or recovery verified.
17. Audit evidence produced.
18. Observability implemented.
19. Documentation updated.
20. No blocking dependency regression exists.

Collect actual exit codes, timestamps, revision identifiers and evidence references.

Do not manufacture green checks.

An automated assessment must distinguish PASS, FAIL, NOT_VERIFIED and NOT_APPLICABLE.

A test that has not run is not PASS.

---

# 7. AUTOMATED RELEASE GOVERNANCE

Implement separate release gates.

## Development

Allow automatic local deployment after mandatory engineering gates pass.

Use synthetic data and the established isolated environment.

## Staging

Allow automated deployment only to an explicitly authorized staging environment with verified data restrictions, secrets, access controls and deployment safety.

Do not permit the experimental governance override to bypass staging protections.

## Nonclinical production

Design a policy allowing CI-driven release without an additional per-release human signature when:

- The function is correctly classified as eligible.
- Applicable legal and contractual requirements have been established.
- All required hosted CI checks pass.
- Vulnerabilities have acceptable verified dispositions.
- Secrets and infrastructure configuration are verified.
- Access controls and audit controls pass.
- Backup, rollback and monitoring are operational.
- Production environment ownership and deployment authority are established.
- No required regulatory or safety approval remains outstanding.

Do not claim eligibility if any prerequisite is unknown or unverified.

## Clinical production

Do not introduce blanket approval automation for functions that affect real clinical care or require professional or regulatory validation.

Identify the applicable release obligations and retain mandatory controls.

## Regulated AI

Require all applicable medical-device quality, evaluation, regulatory and post-deployment controls.

No LLM-generated approval may substitute for a required legal or professional authorization.

---

# 8. SECURITY RISK GOVERNANCE

Carry forward the existing open risks:

- R-IMG-DEBIAN
- R-CI
- R-GOVERNANCE
- R-CLINICAL-DEFAULTS

The previously reported 44 high Debian findings must remain visible.

Do not suppress vulnerability findings to manufacture success.

Create a risk-disposition policy with severity, exploitability evidence, exposure, mitigating controls, owner, expiration/reassessment conditions and release applicability.

A scanner result cannot be marked remediated simply because an exception exists.

Require the appropriate authorized risk acceptance where necessary.

Hosted GitHub Actions must be actually executed before qualifying a release that depends on hosted CI.

---

# 9. PRESERVE HEALTHCARE SAFETY

Do not remove:

- Authentication
- Tenant isolation
- Facility restrictions
- RBAC/ABAC
- Consent enforcement
- Retention and legal holds
- Audit-ledger integrity
- Privacy telemetry
- Idempotency
- Optimistic concurrency
- Clinical source versioning
- Wrong-patient protection
- Clinical-source provenance
- Human control over consequential medical actions

Do not activate real prescription transmission, medication dispensing, unvalidated diagnosis, autonomous treatment or production clinical break-glass.

Fast development does not mean removing those safeguards.

---

# 10. MAKE THE WORKFLOW AUTONOMOUS

Implement an engineering execution runner that:

1. Reads the masterplan and feature dependency graph.
2. Identifies the first incomplete feature.
3. Verifies prerequisites.
4. Implements the complete vertical slice.
5. Runs its tests.
6. Fixes blocking engineering failures.
7. Records verifiable acceptance evidence.
8. Marks engineering completion when valid.
9. Advances to the next permitted feature without requiring repetitive manual confirmation.

Maintain exactly one active feature at a time.

Do not advance while an earlier mandatory feature gate is failing.

The runner must never assume successful tests, invent decisions or overwrite evidence.

Keep formal governance and experimental engineering status separate until an authorized policy transition reconciles them.

---

# 11. CONTINUE CURASPHERE IMPLEMENTATION

The next incomplete engineering feature is:

**P04-F05 — Billing Primitives and Unified Clinical Chart UX**

Read the existing detailed P04-F05 specification before implementation.

Under the established isolated experimental engineering rules, continue implementing this feature once the new engineering governance runner passes its safety checks.

Complete:

- Billing data model
- Monetary precision
- Charge lifecycle
- Role separation
- Billing APIs
- Unified patient chart
- Clinical workflow integration
- Complete browser journeys
- Synthetic financial transactions
- Authorization and tenant isolation
- Audit and privacy integration
- Regression testing

Use the existing synthetic facilities, patients, practitioners and encounters.

Do not introduce real payment collection.

Do not mark P04-F05 complete until every mandatory engineering criterion passes.

After Phase 04 experimental engineering is complete, prepare the Phase 05 implementation plan and continue only within the active, explicitly authorized engineering scope.

Do not treat the new governance proposal itself as permission to access real patient data or deploy clinical functionality.

---

# 12. DOCUMENTATION AND DELIVERABLES

Create or update:

- `docs/governance/CURASPHERE-US-GOVERNANCE-v2.md`
- Standards applicability matrix
- Feature risk-classification policy
- Automated engineering gate specification
- Release eligibility policy
- Governance transition plan
- CI/CD verification documentation
- Automated test runner
- Risk-disposition register
- Production deployment restrictions
- Phase progression rules
- Updated experimental engineering register

Preserve original governance evidence.

Every policy must distinguish:

- Implemented and tested
- Proposed
- Formally adopted
- Release eligible
- Production authorized

Do not present a proposed policy as effective.

---

# 13. FINAL RULES

The Product Owner's objective is to eliminate unnecessary manual engineering bottlenecks while maintaining standards-based, evidence-driven development.

**Do not require human approval for each ordinary development feature.**

**Allow automatic engineering progression when the technical requirements pass.**

**Allow nonclinical production automation only when the governing policy is validly adopted, the release is eligible and all applicable release prerequisites pass.**

**Do not replace mandatory clinical, regulatory or privacy obligations with generated signatures or automated assertions.**

**Do not erase historical governance records or misrepresent Phase 02 approvals.**

Begin by inspecting the governance implementation and creating the proposed v2 migration. Then implement the automated engineering track, run its safety tests, and continue P04-F05 when its isolated development prerequisites pass.

Report the exact governance changes, test evidence, outstanding risks and production-release eligibility separately.

**START THE GOVERNANCE V2 MIGRATION AND AUTOMATED ENGINEERING IMPLEMENTATION.**