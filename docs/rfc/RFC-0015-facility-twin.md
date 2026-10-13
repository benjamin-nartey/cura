# RFC: Facility twin

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs one operations view of what is already stored, with a visible freshness mark, without a second clinical record.

## Goals / non-goals
Goals: counts for appointments, the open encounter queue, lab backlog, pharmacy backlog, beds, shifts, and equipment; a pinned freshness mark; event-driven staleness; capacity as the open share of stored beds.

Non-goals: an ADT feed, a staffing system, a forecast, diagnosis, and a model-written count.

## Data flow

```
session facility
    |
    v
source rows: appointments, in-progress encounters, open lab orders,
             proposed or active medication orders, beds, shifts, equipment
    |
    v
facility projection, version and source hash
    |
    +-- read compares the hash and outbox events after the build
    |     mismatch or a matching event => stale
    |
    +-- rebuild copies the counts again
          gateway clinical generation is refused
```

Organization and facility come from the session. The projection does not copy the chart.

## Proposed design
`POST /api/facility/rebuild`, `/bed`, `/shift`, `/equipment`, and `/explain`. Outbox events `facility.rebuild`, `facility.bed`, `facility.shift`, and `facility.equipment` carry ids, not the signal sentence. Audit actions use the `facility.*` names.

## Security and privacy
Another facility's beds are not listed. An auditor cannot open the projection. A shift cannot name a person from another facility. An occupied bed cannot name a patient from another facility.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Another facility's beds appear | The session facility filters every source query | Lakeside has no Bay 1 |
| A model rewrites capacity | Gateway refuses before any adapter. `holdFacilitySignal` ignores the payload | Probe adapter is not called. The sentence stays the stored count |
| An empty source looks current | Count zero is not fresh | Staffing says no shift rows are stored |
| A new lab order leaves a fresh backlog | The lab event is matched back to the order's facility and the source hash changes | The projection is stale and events are pending until rebuild |

## Observability
`GET /api/health` reports schema version 14. Audit rows record facility reads, rebuilds, beds, shifts, and equipment.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 14. That deletes local writes.
