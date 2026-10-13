# RFC: CuraLab orders and critical flags

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs to order a catalog test, record a specimen and a result, keep the reference range that was in force, and raise a critical alert that a model cannot dismiss.

## Goals / non-goals
Goals: facility-scoped orders, one specimen, one result that freezes unit and range provenance, a deterministic critical pin, acknowledgement that leaves the flag in place, and a two-point trend.

Non-goals: a laboratory analyzer, diagnosis, treatment advice, AI-cleared alerts, and a generated explanation.

## Data flow

```
session facility
    |
    v
clinician places a catalog order (requested)
    |
    v
clinician or nurse collects a specimen (collected)
    |
    v
result value is checked against the catalog entry bounds
    |-- observation row (source)
    |-- lab result copies unit, reference range, LOINC/UCUM/binding versions
    |-- critical flag from lab-critical-2026.10, or none when no rule exists
    |-- open alert only when the flag is critical
    |
    v
trend compares the last two stored results for that code
    |
    v
gateway explanation uses the disabled clinical prompt and returns refused
    critical flag and alert stay as stored
```

Organization and facility come from the session. The client does not send the unit, the reference range, or the critical flag.

## Proposed design
`POST /api/lab/order`, `/specimen`, `/result`, `/acknowledge`, and `/explain`. Outbox events `lab.order` and `lab.result` carry ids, the code or critical flag, and the rule version. They do not carry the numeric value or a narrative. Audit actions are `lab.order`, `lab.specimen`, `lab.result`, `lab.alert`, and `lab.read`.

## Security and privacy
Another facility's order is not found. An auditor cannot read the lab card. A nurse cannot place an order. The explain route does not pass a model adapter.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Client sets the range or the critical flag | Those fields are not accepted. The pin is copied on the server | Result row stores 3.5–5 and the rule version |
| Model text clears an alert | Gateway refuses before any adapter. The flag is not updated from gateway output | Probe adapter is not called. Flag stays critical-high after explain and after acknowledge |
| Cross-facility result | Session facility on the order lookup | East or Lakeside cannot collect a Riverside order |
| Trend invents a recommendation | The sentence restates stored quantities and a comparison word | Text has no recommend, diagnose, or should-start wording |

## Observability
`GET /api/health` reports schema version 10. Audit rows record the order, specimen, result, acknowledgement, and read.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 10. That deletes local writes.
