# RFC: Operations intelligence

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs to see what its stored operational rows imply, with the factors and the confidence visible, without a forecast or a staffing order.

## Goals / non-goals
Goals: wait age at rebuild, stored-bed capacity, a recorded on-hand count, a staffing comparison, the largest stored backlog, a hold that leaves the sentence, and a baseline KPI delta.

Non-goals: a predicted wait, a capacity forecast, an inventory forecast, a staffing order, diagnosis, and a model-written recommendation.

## Data flow

```
session facility
    |
    v
source rows: appointments, in-progress encounters, open lab orders,
             proposed or active medication orders, beds, shifts,
             equipment, on-hand counts, holds
    |
    v
operations projection, version, source hash, frozen baseline
    |
    +-- read compares the hash and later source events
    |     mismatch or a matching event => stale
    |
    +-- rebuild copies the sentences again
          gateway clinical generation is refused
          a hold is attached and the sentence stays
```

Organization and facility come from the session. The projection does not copy the chart.

## Proposed design
`POST /api/operations/rebuild`, `/inventory`, `/override`, and `/explain`. Outbox events `operations.rebuild`, `operations.inventory`, and `operations.override` carry ids, not the sentence. Audit actions use the `operations.*` names. Confidence `none` means the deciding count is zero, `low` means one or two rows, and `stored` means three or more.

## Security and privacy
Another facility's on-hand labels are not listed. An auditor cannot open the projection. A hold cannot name a comparison from another facility because the facility comes from the session.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Another facility's stock appears | The session facility filters every source query | Lakeside has no Gauze |
| A model rewrites the comparison | Gateway refuses before any adapter. `holdOperationsText` ignores the payload | Probe adapter is not called. The sentence stays |
| An empty inventory looks forecast | Zero rows stay "not forecast" with confidence none | The inventory sentence names the missing rows |
| A hold is read as a new recommendation | The stored sentence is unchanged and the hold is a separate reason | The staffing sentence matches the build |
| A KPI delta is read as revenue | The sentence says it is not a revenue or clinical outcome | The lab backlog delta is the stored order count |

## Observability
`GET /api/health` reports schema version 15. Audit rows record operations reads, rebuilds, inventory, and holds.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 15. That deletes local writes.
