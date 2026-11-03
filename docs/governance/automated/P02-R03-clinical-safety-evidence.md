# Automated clinical safety evidence

This is automated technical evidence. It is not a human architecture, security, or clinical approval. It does not change P02-R01 through P02-R06, and it is not a certification.

- Review: P02-R03
- Evaluated at: 2026-10-14T13:37:15.248Z
- Revision: 84f0fc06044237aed8b2c98ca031f19333e3e8bb
- Working tree dirty: true
- Automated result: AUTOMATED_EVIDENCE_WITH_FAILURES
- Development exception: PROPOSED
- Phase 03: NOT_AUTHORIZED

| Control | Framework | Result | Evidence |
| --- | --- | --- | --- |
| CLIN-ENV-DENY | ISO-14971 | PASS | Source checks matched. |
| CLIN-SELF-REVIEW | WHO-AI-2021 | PASS | Source checks matched. |
| CLIN-DURATION-DEFAULTS | ISO-14971 | HUMAN_JUDGMENT_REQUIRED | Source checks matched. |
| CLIN-SIGNOFF | WHO-AI-2021 | HUMAN_JUDGMENT_REQUIRED | No automated result can satisfy this control. |
| PRIV-PHASE03 | ISO-IEC-27701 | HUMAN_JUDGMENT_REQUIRED | Feature statuses matched. |

## Outstanding

- CLIN-DURATION-DEFAULTS: These durations are not approved clinical policy. P02-R03 does not decide that they are clinically appropriate.
- CLIN-SIGNOFF: P02-R03 stays pending. This evidence file is not a clinical signature.
- PRIV-PHASE03: ISO/IEC 27701 conformity is not claimed. Privacy dependencies stay outstanding.
