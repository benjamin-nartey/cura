# ADR-0013: The patient record is a separate session and a pinned explanation

Status: Accepted
Date: 2026-10-08

## Context
Phase 17 asks for a patient app with records, appointments, a medication list, explanations, question preparation, coverage, and secure messages. This slice has no payment processor, no outbound transport, and no allowlisted model. A fabricated charge, a delivered message, or a model that clears an emergency phrase would be a production mock.

## Decision
A patient principal is not a workforce user. The patient session cookie is separate, the purpose of use is `PATIENT`, and the patient identifier comes from that session. The patient view lists that person's appointments, medications, allergies, and results. It does not load documentation, evidence, the copilot, referrals, or another person's rows. Result sentences are the pinned copy `patient-explain-2026.10`. Urgent phrases store `urgent-triage` and the fixed emergency instruction. Other questions store the patient's words or restate that person's own rows. Patient tools are `own-appointments`, `own-medications`, `own-results`, `store-question`, and `urgent-triage`. They do not include the clinician chart-review tools. A visit request does not create a booked appointment until a clinician at the facility accepts it. A payment row stays `recorded`. The gateway refuses clinical generation, and `holdPatientInstruction` ignores model output.

## Consequences
Schema version 13 adds the patient-record tables. There is no charge, no outbound message, and no diagnosis. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed payment or messaging provider is allowlisted. It still has to keep the patient session off the clinician chart, and a model still cannot replace the emergency instruction.
