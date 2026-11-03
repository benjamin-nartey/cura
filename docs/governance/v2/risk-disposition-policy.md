# Risk disposition policy

Status: proposed release-risk policy; local enforcement carries existing findings forward without accepting them.

Every disposition records severity, current exploitability evidence, deployment exposure, mitigating controls, responsible owner role/name, expiration/reassessment, source scan and artifact/revision, and affected release categories. Unknown exploitability is not evidence of non-exploitability. Mitigation or an exception never changes a scanner's finding to remediated.

Critical/high in-scope technical findings block their mandatory gate unless a valid governing release process explicitly permits an authorized, bounded disposition. This migration grants no production risk acceptance and generates no owner signature. An applicable legal, contractual, clinical or regulatory acceptance cannot be replaced by an LLM's assertion.

The existing 44 high Debian findings remain historical OPEN findings for the recorded image digest. A current JavaScript dependency scan says nothing about their remediation. A fresh image scan must identify the exact image and distinguish scanner failure from no findings. The v2 local tooling/billing verification runs on the host and does not build or deploy that gateway image; this scope rationale permits isolated engineering without suppressing the image risk. Image-dependent releases remain blocked pending current evidence and required disposition.

R-CI requires actual hosted workflow execution for the current immutable release revision, plus required-check and artifact provenance validation. An old successful run, a file edit to CI, or a local test cannot close it. R-GOVERNANCE remains unresolved until the authorized transition completes. R-CLINICAL-DEFAULTS remains unresolved for real clinical emergency settings; those defaults cannot activate clinical production.

`risk-disposition-register.json` contains proposed ownership/reassessment fields with no invented acceptances. Reassess before an applicable release, material capability/exposure change, expiry, or available fix. Preserve prior scans, exception records and acceptance evidence rather than rewriting them.
