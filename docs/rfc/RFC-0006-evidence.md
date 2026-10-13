# RFC: Evidence for derived chart lines

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
Derived lines can outlive the source row they describe. A reader needs to see the citation and whether that citation still matches.

## Goals / non-goals
Goals: a claim record, a citation to a facility source row, a hash of that row, states `supported` and `invalidated`, and a citation label on the chart.

Non-goals: model-written claims, a graph database, and keeping a supported claim after its source changes.

## Data flow

```
patient-state rebuild
    |
    +-- each derived line ----source still on the chart?----> evidence_claims (supported)
    |                                    |
    |                                    +-- no citation --> refused, not stored
    |
read chart ----hash the cited row---- matches --> supported
                                 \---- missing or different --> invalidated
```

Facility comes from the session. A claim is readable only when the patient chart is readable.

## Proposed design
`syncPatientEvidence` runs in the rebuild transaction. It files a claim only when the line has a source id and that row is on the chart. The citation stores a content hash of the row. The same line and the same hash are not filed twice.

`GET /api/patients/{id}/evidence` rechecks every supported citation. A changed value or a missing row sets `invalidated` and writes `evidence.invalidated` to the outbox. The chart renders `supported` or `invalidated` and a link such as `Result · obs_elena_k_high`.

Sufficiency: zero citations are an error. A source that is not on the chart is not filed. `insufficient` is reserved for that refusal and is not stored as a supported fact.

## Security and privacy
Cross-facility reads return the same not-found body as the chart. Auditors are denied. Outbox payloads carry claim and source ids, not the sentence. The response is not cached.

## Clinical hazards
An invalidated sentence can still be read. The state word is on the same line. The page does not delete it, because hiding it would look like the line was never filed. It does not add advice.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Claim without a source | Insert refused | Empty citation throws |
| Stale sentence stays supported | Hash check on read | Edited potassium invalidates the claim |
| Cross-facility evidence | Chart facility filter | Evan receives no body |
| Auditor access | `canReadChart` | Priya is denied |

## Rollback
Schema version 5 adds the evidence tables. Stop the app and delete `data/curasphere.sqlite`.

## Tests
`npm test` covers filing, a second rebuild that does not duplicate claims, refusal of an empty citation, invalidation after a source change, and cross-facility and auditor denial.
