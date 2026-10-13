# RFC: Module cards

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An auditor needs a separate record for each named module so that a refusal for one cannot be read as clearance for the others.

## Goals / non-goals
Goals: seven pinned intended-use sentences, seven pinned model cards, a refused validation by a different auditor, a not-run workflow study, and a not-calculated performance row.

Non-goals: pixels, waveforms, slides, a score, a subgroup rate, a site rate, and a platform-wide approval.

## Data flow

```
auditor session, purpose AUDIT
    |
    v
one module code from the catalog
    intended use and model card come from that code
    |
    v
different auditor
    gateway refusal for that module
    |
    v
workflow study not-run
performance not-calculated
clear and approve-all => refused
gateway explain => refused, statuses unchanged
```

## Proposed design
`POST /api/modules/record`, `/validation`, `/study`, `/performance`, `/clear`, `/platform`, and `/explain`. Outbox events are `module.registered`, `module.validation`, `module.study`, and `module.performance`. A refused clear or platform approval publishes nothing.

## Security and privacy
A clinician and an organization admin cannot open the page. Another organization is not listed. The module author cannot validate their own row. Payload text is not stored. A score is not stored.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician stores a module | Role must be auditor | Amira is forbidden |
| One card covers every module | Each code has its own intended use and model card | The seven sentences are distinct |
| A payload is stored | A non-empty payload is refused | No module row is inserted |
| The author validates their own module | The author is excluded | Priya is forbidden |
| A score is stored | Score, subgroup, and site are refused | The performance status stays not-calculated |
| Every module is approved together | `approvePlatform` throws | Every stored status stays not-cleared |

## Observability
`GET /api/health` reports schema version 26. Audit rows record registration, validation, study, performance, and the refused clear and platform actions.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 26. That deletes local writes.
