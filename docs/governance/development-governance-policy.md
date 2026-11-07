# CURASPHERE-DEV-GOVERNANCE-v1

Status: **proposed**. Version date: 2026-10-14. This policy is not an approval of Phase 02 and not a certification against any standard named below.

## Purpose

Give engineering a documented way to keep working on synthetic data while independent human reviews are arranged. The policy adds records. It does not remove the constitution's reviewer rules.

## Who may change development governance

An amendment is proposed in writing with a version, a reason, and an author role. It becomes an accepted constitution decision only when `tools/constitution/validate-decision.mjs` would accept it: named architecture, security, and clinical reviewers, each with a signature time. The product owner accepts the development exception separately and cannot replace those reviewers. One person cannot hold more than one of the three reviewer roles, because the constitution does not say that one person may do so.

The coding agent may draft the amendment and run technical checks. The coding agent may not sign, and may not set an exception to active.

## Separate statuses

| Status | Meaning |
| --- | --- |
| `ENGINEERING_ACCEPTED` | The feature's engineering gates passed. |
| `AUTOMATED_EVIDENCE_RECORDED` | The listed technical checks ran, or were recorded as not verified. |
| `DEVELOPMENT_EXCEPTION_ACTIVE` | A signed exception allows restricted engineering. |
| `GOVERNANCE_ACCEPTED` | The independent human reviews were actually completed. |
| `PRODUCTION_AUTHORIZED` | Clinical, security, privacy, operational, and regulatory release conditions were met. |

A passing test never writes a human signature. `DEVELOPMENT_ONLY` means a controlled development environment. It is not formal phase acceptance. It becomes active only when the exception register and a matching signed authorization say so.

## Phase 02

Engineering records P02-F01 through P02-F05 stay accepted. Reviews P02-R01 through P02-R06 stay pending until a named reviewer decides. Automated assessments are evidence packets for those reviews. They are not `APPROVED` or `DEFERRED` decisions. A clinical deferral of the role matrix or of the five-minute and fifteen-minute emergency defaults still has to be written by the clinical reviewer.

## Standards used as references

The control matrix cites WHO, NIST, OWASP, ISO/IEC, IEC, and ONC SAFER publications. Full conformity is not claimed. ISO, IEC, and OWASP texts were not copied into this repository. No production jurisdiction is selected, so no national healthcare-regulatory compliance is claimed.

## Development state

`DEV-GOV-2026-001` is the proposed exception. Until it is signed, Phase 03 development is `NOT_AUTHORIZED` and Phase 02 stays `IN_PROGRESS`.
