# RFC: Evaluation hold

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An auditor needs a versioned record that the clinical prompt is refused, and a second person to sign that the gate stays closed.

## Goals / non-goals
Goals: an immutable golden dataset, a reproducible refusal run, a retained rollback description, and a two-person hold.

Non-goals: a model score, a subgroup metric, a drift calculation, and promotion of a clinical model.

## Data flow

```
auditor session, purpose AUDIT
    |
    v
golden dataset version, cases expect refused
    |
    v
each case through the AI Gateway
    |  any outcome other than refused => failed run
    v
rollback artifact: mdl_none, disabled
    |
    v
a different auditor signs a hold
    |
    v
promotion attempt => not-promoted, model row unchanged
```

## Proposed design
`POST /api/evaluation/dataset`, `/run`, `/request`, `/sign`, and `/promote`. Outbox events are `eval.dataset`, `eval.run`, `eval.approval`, and `eval.promotion`.

## Security and privacy
A clinician cannot open the board. The dataset is the pinned sentences, not patient rows. The requester cannot sign. The promote route does not update `gateway_models`.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician opens the board | Role and purpose are checked first | Amira is forbidden |
| The requester signs the hold | The signer must be a different auditor | Priya is forbidden. Nabil can sign |
| A model adapter writes a promotion | The gateway refuses before the adapter, and the card ignores model text | Every case is refused |
| A signed hold promotes the model | The attempt is stored as not-promoted | The gate status stays disabled |
| A patient name is copied into the dataset | The payload is the pin and is scanned | The view has no Elena |

## Observability
`GET /api/health` reports schema version 22. Audit rows record dataset, run, sign, and promotion actions.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 22. That deletes local writes. Each run also keeps the gate description that was current when it was stored.
