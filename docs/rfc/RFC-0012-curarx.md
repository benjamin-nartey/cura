# RFC: CuraRx medication safety

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs a prescription that records allergy, interaction, duplicate-therapy, and formulary checks, and that cannot reach the medication list while a high-risk warning is still open.

## Goals / non-goals
Goals: a local formulary pin, deterministic safety rules with source and version, acknowledgement that leaves severity in place, dispense and administration history, and an adherence sentence made of stored counts.

Non-goals: a drug-knowledge vendor, diagnosis, treatment advice, dose calculation, and a model that clears a warning.

## Data flow

```
session facility
    |
    v
clinician proposes a formulary item and a recorded dose
    |-- allergy, interaction, duplicate, formulary rules from med-safety-2026.10
    |-- each warning stores rule id, version, and source local-pin
    |
    v
high severity stays open until acknowledgement
    |
    v
activation writes the chart medication
    |-- dispense quantity and administration events append history
    |-- adherence restates the stored counts
    |
    v
gateway explanation uses the disabled clinical prompt and returns refused
    warnings stay as stored
```

Organization and facility come from the session. The client does not send severity, formulary status, or a skip flag.

## Proposed design
`POST /api/rx/prescribe`, `/acknowledge`, `/activate`, `/dispense`, `/administer`, and `/explain`. Outbox events `rx.prescribe` and `rx.activate` carry ids and counts, not the warning sentence. Audit actions are `rx.prescribe`, `rx.warning`, `rx.activate`, `rx.dispense`, `rx.administer`, and `rx.read`.

## Security and privacy
Another facility's order is not found. An auditor cannot read the card. A nurse cannot propose or activate. The explain route does not pass a model adapter.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Client clears a high-risk warning | Severity is computed from the pin. Acknowledgement does not change it | Amoxicillin stays high after acknowledge |
| Model text skips the check | Gateway refuses before any adapter. Activation still requires an open high warning to be acknowledged | Probe adapter is not called. Activation throws until acknowledgement |
| Cross-facility acknowledgement | Session facility on the warning lookup | Lakeside cannot acknowledge a Riverside warning |
| Adherence invents a refill instruction | The sentence restates stored administration and dispense counts | Text has no recommend, diagnose, or should-start wording |

## Observability
`GET /api/health` reports schema version 11. Audit rows record the proposal, acknowledgement, activation, dispense, administration, and read.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 11. That deletes local writes.
