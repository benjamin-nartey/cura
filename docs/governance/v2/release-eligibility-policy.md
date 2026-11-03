# Release eligibility policy and production restrictions

Formal policy status: PROPOSED. Implemented now: independent engineering/local-development evaluation and fail-closed staging/production decisions. Future nonclinical production automation is a proposed policy, not an activated delivery mechanism.

The report contains seven separate fields. ENGINEERING_ACCEPTED means current technical evidence passed; it does not authorize staging, clinical use, a device release, or production. Local development is eligible only when accepted and all four synthetic sandbox variables and restrictions hold. The local override never authorizes staging. The runner's browser test server is an isolated verification environment and is stopped after its command.

Staging needs explicit environment ownership/authority, verified secrets, access controls, synthetic/deidentified-data restrictions, backup/rollback/monitoring and valid governing authority. These facts are currently NOT_VERIFIED; staging is NOT_ELIGIBLE.

For future class A/B nonclinical production automation, all of the following must be verified: valid constitutional adoption, correct function classification, applicable legal and contractual determinations, actual successful required hosted CI for the exact immutable revision/artifact, verified vulnerability dispositions, secrets/infrastructure configuration, access and audit tests, operational backup/rollback/monitoring, deployment ownership/authority, and absence of outstanding mandatory clinical/regulatory obligations. Unknown is not PASS. A local dirty-tree run cannot satisfy hosted CI. A status flag claiming adoption is insufficient.

Class C requires the applicable real-use clinical/safety/privacy/operational authorizations. Class D additionally requires the applicable device/QMS/evaluation/regulatory and post-deployment controls. No blanket generated authorization is permitted. Internal risk classes do not replace FDA intended-use analysis. Synthetic tests do not validate clinical efficacy.

`infra/delivery/deploy.sh`, `simulate.sh`, startup sandbox checks and production emergency restrictions are preserved. No production command is added. No push, merge, hosted publication or actual deployment is authorized by this migration. R-IMG-DEBIAN, R-CI, R-GOVERNANCE and R-CLINICAL-DEFAULTS remain visible release blockers where applicable. No nonclinical production or clinical production release is currently eligible.
