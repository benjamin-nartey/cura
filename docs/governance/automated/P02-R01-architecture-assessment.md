# Automated architecture evidence

This is automated technical evidence. It is not a human architecture, security, or clinical approval. It does not change P02-R01 through P02-R06, and it is not a certification.

- Review: P02-R01
- Evaluated at: 2026-10-14T13:37:15.248Z
- Revision: 84f0fc06044237aed8b2c98ca031f19333e3e8bb
- Working tree dirty: true
- Automated result: AUTOMATED_EVIDENCE_WITH_FAILURES
- Development exception: PROPOSED
- Phase 03: NOT_AUTHORIZED

| Control | Framework | Result | Evidence |
| --- | --- | --- | --- |
| ARCH-DOCS | IEC-62304 | PASS | All listed files exist. |
| ARCH-SCHEMA-SPLIT | IEC-62304 | PASS | Source checks matched. |
| ARCH-AUTHZ-CENTRAL | NIST-CSF-2.0 | PASS | Source checks matched. |
| ARCH-PHASE-BOUNDARY | IEC-62304 | PASS | Feature statuses matched. |
| ARCH-LIVE-FOUNDATION | NIST-CSF-2.0 | PASS | Foundation health responded and included schema version 15. |
| ARCH-BACKUP-THIS-RUN | NIST-CSF-2.0 | HUMAN_JUDGMENT_REQUIRED | No automated result can satisfy this control. |

## Outstanding

- ARCH-BACKUP-THIS-RUN: Rollback text exists in docs/identity/tenancy.md and docs/identity/emergency-access.md. This run did not restore a database.
