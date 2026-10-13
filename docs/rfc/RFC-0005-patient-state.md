# RFC: Patient state materialization

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
The chart is a set of source rows. A clinician also needs one explainable snapshot of what is active, what is pending, and where two rows disagree, without a second system that silently picks a winner.

## Goals / non-goals
Goals: a versioned build, a visible built-at time, stale detection, active problems, medications, and allergies, the newest result per code, conflicts, workflow gaps, pending work, and an unfilled risk slot.

Non-goals: diagnosis, treatment advice, risk scores, automatic rebuild on every write, and merging duplicate rows into one value.

## Data flow

```
session facility
    |
    v
source rows --hash--> currentSourceHash
    |                      |
    |                      +-- compare --> stale or current
    |
    +-- rebuild (idempotency key) --> patient_state_builds version N
                                         |
                                         +-- outbox patient_state.rebuilt (ids, version, hash)
```

The payload is derived in the request. Organization and facility come from the session.

## Proposed design
`buildPatientState` lists every active problem, active medication, and allergy with its source id. For each observation code it keeps the row with the newest effective time. If more than one row shares that time, it records a conflict and omits that code from latest results. The same rule applies to two active problem rows that share a code: both remain in the active list, and a conflict names them.

Care gaps restate a latest result that is outside its configured bound, a booked appointment when no encounter is open, and an open encounter with no result stored on it. Pending work lists open encounters and booked appointments. The only risk slot is `deterioration` with status `unfilled`.

`POST /api/patient-state` rebuilds. `GET /api/patients/{id}/state` returns the latest build plus `stale`, `builtAt`, and `currentSourceHash`.

## Security and privacy
Reads and rebuilds use the chart facility filter. Another facility gets the same not-found body. Auditors are denied. The outbox event carries ids and the hash, not the result values. The response is not cached.

## Clinical hazards
A stale build can omit a new result. The page says when source rows changed after the build. A conflict is shown instead of an average or a chosen value. Gap text restates stored facts. It does not say what to do. The risk slot has no number.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Cross-facility snapshot | Chart facility filter | Evan receives no body |
| Auditor access | `canReadChart` | Priya is denied |
| Silent merge of two values | Conflict list, code left out of latest results | Tied potassium rows both cited |
| Stale build read as current | `stale` and built-at shown | A new result leaves version 1 stale |
| Invented risk | Slot status stays `unfilled` | Payload has no score value |

## Rollback
Schema version 4 adds `patient_state_builds`. Stop the app and delete `data/curasphere.sqlite`.

## Tests
`npm test` covers a stable Elena rebuild, staleness after a new result, a same-time conflict, an encounter with no result, and cross-facility and auditor denial.
