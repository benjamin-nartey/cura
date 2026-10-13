# RFC: Patient record and patient assistant

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A person needs a facility record of their own appointments, medications, and results, plus a way to store a question, without opening the clinician chart.

## Goals / non-goals
Goals: a separate patient session, own-record reads, pinned result sentences, urgent text routed to a fixed emergency instruction, question preparation, a facility message, a coverage note, a recorded amount, and a visit request that is not a booking until the facility accepts it.

Non-goals: diagnosis, treatment advice, charges, card numbers, outbound delivery, clinician documentation, and a model-written explanation.

## Data flow

```
patient principal
    |
    v
patient session, purpose PATIENT, patient id from the principal
    |
    +-- read own appointments, medications, allergies, results
    |
    +-- question or ask
    |     urgent phrase -> pinned emergency instruction, tool urgent-triage
    |     otherwise -> stored question, or a restatement of that person's own rows
    |     gateway clinical generation is refused
    |
    +-- message, coverage, recorded amount
    |
    +-- visit request
          clinician at the same facility accepts or declines
          accept writes one booked appointment
```

The patient does not send another person's identifier. Organization and facility come from the principal.

## Proposed design
`POST /api/portal/session`, `/ask`, `/question`, `/message`, `/coverage`, `/payment`, `/request`, and `/explain` use the patient cookie. `POST /api/portal/reply` and `/request/decision` use the clinician session. Outbox events `portal.question`, `portal.message`, `portal.coverage`, `portal.payment`, and `portal.request` carry ids, not the question, the message, or the member id. Audit actions use the `portal.*` names. Patient access rows remain visible to the organization auditor.

## Security and privacy
The patient session cannot open `getChart`. Another patient, another facility, and another organization are not returned. Card-like numbers are rejected. The clinician desk shows only what the patient stored, for the session facility.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Patient opens the clinician chart or another person's medications | The session is bound to one patient. Chart reads require a workforce role | Elena's chart read is denied. Mateo's list does not include Furosemide |
| Urgent symptom is cleared by a model | The instruction is pinned. The gateway refuses before any adapter | Probe adapter is not called. The instruction stays the emergency sentence |
| Clinician-only rows appear on the patient page | The view selects appointments, medications, allergies, and results only | The page payload has no documentation id, referral, copilot, or other patient's medication |
| A request or a recorded amount is treated as a booking or a charge | Status stays requested until a clinician accepts. Payment status is recorded | The appointment count does not rise until accept. The payment status is recorded |

## Observability
`GET /api/health` reports schema version 13. Audit rows record patient reads, questions, messages, coverage, payments, requests, and facility decisions. The actor label for a patient principal is "Patient record".

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 13. That deletes local writes.
