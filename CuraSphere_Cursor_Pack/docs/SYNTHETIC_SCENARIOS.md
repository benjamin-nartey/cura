# Synthetic Real-World Simulation Playbook

All fixture records are fictitious and visibly marked `synthetic: true`, `environment: "test"`. They must never be promoted to production. This seed is for workflow, data integrity, security, UX and resilience simulation, NOT to validate diagnostic/therapeutic AI or establish clinical efficacy.

## Demographics and sites
- Tenant `DEMO_GH`: fictional Akwaaba Demo Health Network, jurisdiction GH, Africa/Accra time zone, GHS, with `ACCRA_DEMO_HOSPITAL` (hospital) and `TEMA_DEMO_CLINIC` (clinic).
- Tenant `DEMO_EU`: fictional Meridian Demo Care, jurisdiction IE, Europe/Dublin time zone, EUR, with `DUBLIN_DEMO_CLINIC` (clinic). Distinct storage and policy scope; do not mix analytics without authorization.
- Workforce: facility admins, doctor, nurse, laboratory technician, pharmacist, receptionist, cashier, privacy officer and research analyst. Roles have least privilege; one doctor is affiliated with two facilities explicitly.
- Patients: 40 deterministic IDs across two tenants, with encounters, appointment states, occasional overlapping names, problem/allergy/medication records, lab tests, referrals and payments. The fixture generator uses a pinned seed and stable IDs; no internet required.

## Master scenario IDs and expected observable results
| ID | Story | Required test oracle |
|---|---|---|
| S01 | Outpatient follow-up: scheduled -> check-in -> encounter -> vital -> lab order -> result -> plan -> billing | Timeline and Patient Twin link every change to source versions; ledger matches payments. |
| S02 | Two tenants contain same patient display name | User from GH cannot search, infer, export or fetch IE patient's records. |
| S03 | A nurse submits same observation twice because mobile connection retries | Exactly one logical observation; visible idempotency key/audit trail. |
| S04 | Two clinicians concurrently edit a record | 409 conflict/review path; no lost silent update. |
| S05 | Allergy source corrected after an AI summary | Twin refreshes; evidence graph invalidates outdated claim; summary marked stale. |
| S06 | Critical synthetic lab value with demo-only approved-by-test rule pack | Alert delivered/acknowledged/escalated even if AI service is down. |
| S07 | A specimen is rejected, recollected, then result amended | User sees full state chain; original never silently overwritten. |
| S08 | Staff emergency break-glass | Requires authenticated reason/scope/expiry and produces independent audit alert. |
| S09 | Patient withdraws research or messaging consent | Subsequent use blocked while authorized historical audit preserved. |
| S10 | Message delivery fails due to simulated provider outage | Escalation task remains open; never mark delivered. |
| S11 | Kafka consumer receives duplicate/out-of-order events and restarts | Source unchanged; projections converge; lag/failure displayed. |
| S12 | Temporal agent requests an unapproved clinical mutation | Manifest and human approval prevent tool call; rejection fully audited. |
| S13 | Healthcare AI gateway vendor unavailable or quota exhausted | Read-only care and manual workflows still work; UI shows fallback. |
| S14 | Patient mobile device offline then reconnects | Cached data labeled stale; safe replay doesn't duplicate writes. |
| S15 | Claim denied, appealed, partially paid and later reconciled | Correct balanced immutable ledger; complete claims history. |
| S16 | Small population cohort and repeated filter differencing | Suppression enforced across UI, API and export. |
| S17 | DICOM upload interrupted and study contains potential pixel PHI | Mark incomplete/quarantine and trigger review; not silently cleared. |
| S18 | Remote device clock skew and reading replay | Retain device/server time; dedupe; no false fresh measurement. |
| S19 | Model/prompt revised after evaluated approval | Change-impact review blocks release until required re-evaluations. |
| S20 | Regional outage and tenant residency constraint | DR plan activates safely; no unapproved cross-region relocation. |

## Scenario execution contract
For every feature identify applicable scenario IDs and create a JSON assertion manifest with `id`, `preconditions`, `steps`, `expected API statuses`, `expected UI states`, `expected audit entries`, `expected persistence/ledger state`, `security negative case`, `recovery outcome`, `test filename`. Run it in CI with a fixed fixture seed. Fixture assertions must be updated as the product grows, not weakened to get a green check.

## Safety limits
Synthetic lab values, decision rules, diagnoses and medication examples are fabricated workflow inputs. Reference ranges, prescribing rules, device thresholds, diagnostic accuracy, subgroup performance and patient triage instructions need independently sourced, licensed, reviewed and validated clinical guidance before production. Keep demonstration rule packs explicitly marked `demo_only` and impossible to load in production configuration.
