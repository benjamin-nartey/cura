# RFC: Patient summary and clinical copilot

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
Clinicians need a read-only view of what the record already supports: a summary, what changed, abnormal and open items, and a question scoped to one patient. Unsupported sentences must not be presented as answers.

## Goals / non-goals
Goals: a grounding threshold of 1, flagged unsupported claims, patient-scoped retrieval, and captured feedback.

Non-goals: a model answer, diagnosis, treatment advice, and changing the chart from the copilot.

## Data flow

```
session facility + patient id
    |
    v
evidence claims
    |-- every claim supported and cited --> release the claim texts
    |-- any claim invalidated, insufficient, or uncited --> flag it and withhold the summary
    |
    v
question
    |-- treatment or diagnosis wording --> blocked, no answer
    |-- another patient id --> blocked
    |-- no supported match --> blocked
    |-- every match supported --> answer is those claim texts
    |
    v
copilot_turns (question hash, score, outcome; answer empty when blocked)
feedback row (helpful or not-grounded) does not edit the claim
```

Organization and facility come from the session. The patient id on the form must be the chart being read.

## Proposed design
The chart page renders the copilot. `POST /api/copilot/ask` and `POST /api/copilot/feedback` are the writes. The same idempotency key returns the same turn or feedback row. Outbox payloads carry ids, outcome, and score, not the question.

## Security and privacy
Turns from another facility are not readable. The stored turn has a hash, not the question. An answer sentence is copied from a supported claim.

## Clinical hazards
The threshold blocks a partial summary when any claim is no longer supported. Feedback does not delete or rewrite the source line. The page says the copilot does not diagnose or recommend treatment.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Invented answer | No model call. Unmatched and policy questions store a null answer | "should start insulin" is absent from the answer column |
| Stale claim shown as current | Score below 1 withholds the summary and flags the claim | A changed potassium value blocks release |
| Cross-patient question | Another `pat_` id is out of scope | `pat_samir` on Elena's question is blocked |
| Feedback edits the chart | Feedback is an insert | Claim text and observation count stay the same |

## Rollback
Schema version 8 adds the copilot tables. Stop the app and delete `data/curasphere.sqlite`.

## Tests
`npm test` covers the threshold, flagged invalid claims, grounded retrieval, blocked treatment language, scope, idempotent replay, feedback that does not edit the claim, and organization isolation.
