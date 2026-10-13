# RFC: Device readings

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs a place to record a device identity and a typed vital, with a bound on how many threshold marks stay open, without pretending a wearable is connected.

## Goals / non-goals
Goals: a facility-scoped registry, catalog normalization, duplicate and out-of-order handling, an alert budget of 3, and a stored escalation when that budget is spent.

Non-goals: a device stream, a vendor cloud, Bluetooth, paging, and copying the reading into the chart observation table.

## Data flow

```
clinician session, facility from the directory
    |
    v
device registry, connectivity not-connected
    |
    v
one typed reading
    |  same time and value => existing row
    |  same time, different value => refused
    |  earlier than a stored time => out-of-order, no alert
    v
outside the catalog bound and fewer than 3 open marks => threshold mark
outside the catalog bound and 3 open marks => escalation sentence, no page
    |
    v
gateway explain => refused
```

The chart observation table is not updated.

## Proposed design
`POST /api/devices/register`, `/reading`, `/acknowledge`, and `/explain`. Outbox events `device.registered`, `device.reading`, `device.alert`, `device.escalation`, and `device.acknowledged`.

## Security and privacy
An auditor cannot open the list. Another facility is not listed. The client cannot set connectivity, the code, or the unit.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| An auditor reads a device | Role and facility are checked first | Priya is forbidden |
| Another organization registers the patient | The patient must be on the session facility | Evan is not found |
| A repeated sample opens another alert | The same time and value returns the existing reading | The second call keeps the same reading id |
| An older sample looks like the latest | It is stored as out-of-order and opens no alert | The 09:00 reading has no alert |
| Alerts pile up | The fourth in-order crossing escalates | The budget stays at 3 open marks |
| A model writes an alarm | The gateway refuses clinical generation | The sentence stays the pinned note |

## Observability
`GET /api/health` reports schema version 20. Audit rows record registration, readings, acknowledgements, and explain attempts.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 20. That deletes local writes.
