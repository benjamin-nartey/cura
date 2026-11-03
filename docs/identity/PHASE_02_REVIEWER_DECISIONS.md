# Reviewer decision instructions

Date: 2026-10-14

Record a decision by editing `docs/identity/PHASE_02_APPROVALS.json` for the matching `review_id`. Set `decision` to `APPROVED`, `REJECTED`, or `CHANGES_REQUESTED`. Set `reviewer_name` to the person who decided. Set `decided_at` to the actual time. Leave `conditions` explicit. Do not copy a synthetic workforce name into `reviewer_name`. Kwame Boateng, Esi Boateng, and Ama Mensah are fixtures.

A coding agent must not fill those fields. An instruction to continue or proceed is not a decision. The product owner cannot sign P02-R01, P02-R02, or P02-R03. The charter approval of `charter-2026.10` does not sign this phase.

The constitution checker requires a separate architecture, security, and clinical reviewer, each with a name and a time, before a decision can be accepted. It does not contain a clause that lets one person satisfy more than one of those roles. One person is therefore not recorded against more than one of P02-R01, P02-R02, and P02-R03.

P02-R03 is an assessment of the development-only emergency architecture. It is not satisfied by deferring the role matrix or the emergency policy.

P02-R04 and P02-R05 may be recorded as `DEFERRED` only when the clinical reviewer writes that choice, the reason, the conditions, and the later review that is still required. A deferral leaves production clinical break-glass disabled, leaves clinical permissions unapproved for real use, blocks emergency elevation of patient records, and leaves Phase 03 consent, privacy, and audit outstanding. It does not imply regulatory or clinical authorization. Five minutes and fifteen minutes stay unapproved engineering defaults.

Engineering acceptance, governance acceptance, and production clinical authorization stay separate. Phase 02 stays `IN_PROGRESS` until P02-R01 through P02-R06 have valid decisions and the phase gate passes. Phase 03 does not start from this file.

| Review | Packet | Choices |
| --- | --- | --- |
| P02-R01 Architecture | `docs/identity/PHASE_02_ARCHITECTURE_REVIEW.md` and ADR-0061 | ACCEPT, REQUEST CHANGES, REJECT |
| P02-R02 Security | `docs/identity/PHASE_02_SECURITY_REVIEW.md` | ACCEPT, REQUEST CHANGES, REJECT |
| P02-R03 Clinical safety boundary | `docs/identity/PHASE_02_CLINICAL_GOVERNANCE.md` | ACCEPT development boundary, REQUEST CHANGES, REJECT |
| P02-R04 Role matrix | `docs/identity/PHASE_02_ROLE_MATRIX.md` | APPROVE for clinical use, APPROVE DEFERRAL, REQUEST CHANGES, REJECT |
| P02-R05 Emergency intended use | `docs/identity/PHASE_02_EMERGENCY_INTENDED_USE.md` | APPROVE production use with stated values, APPROVE DEFERRAL, REQUEST CHANGES, REJECT |
| P02-R06 Product owner | `docs/identity/PHASE_02_COMPLETION.md` | ACCEPT the phase, REQUEST CHANGES, REJECT |

P02-R04 and P02-R05 deferral, if a reviewer chooses it, keeps production clinical break-glass disabled. It does not mark those policies approved.

Phase 02 becomes ACCEPTED only after every mandatory gate in the phase specification is satisfied, including the reviews that are required. Until then the phase register stays `IN_PROGRESS`.
