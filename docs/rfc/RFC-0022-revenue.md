# RFC: Recorded revenue ledger

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An organization needs a ledger of recorded amounts that a clinician cannot open, without pretending a payer accepted a claim.

## Goals / non-goals
Goals: recorded invoices and payments, a reconciliation of those cents, eligibility left unchecked, claims kept as drafts, a plan label that is not billed, and a usage count of ledger rows.

Non-goals: a payer eligibility call, a clearinghouse submission, a denial from a payer, a bank deposit, and a subscription charge.

## Data flow

```
admin session, purpose OPERATIONS, no facility
    |
    v
recorded invoice cents
    |
    + recorded payment cents, not above the invoice
    |
    v
reconciliation = payments + open cents
eligibility stays not-checked
claim stays draft after a submit attempt
subscription stays not-billed
    |
    v
gateway explain => refused, cents unchanged
```

The chart is not read. The ledger does not return problems or results.

## Proposed design
`POST /api/revenue/invoice`, `/payment`, `/eligibility`, `/claim`, `/submit`, `/plan`, and `/explain`. Outbox events use the `revenue.*` names.

## Security and privacy
A clinician and an auditor are refused. Another organization's facility is refused. Card-like numbers are refused in labels. The explain route does not pass a model adapter.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician opens the ledger | Role must be admin and purpose OPERATIONS | Amira is forbidden |
| A payment exceeds the invoice | The sum is checked before insert | 2000 cents over a 2500 cent invoice is refused |
| A claim is marked submitted | The attempt is `not-submitted` and the status stays draft | The draft remains |
| The ledger copies a diagnosis | The read selects ids, MRNs, labels, and cents | The body has no E11.9 |
| A model changes the cents | The gateway refuses, and the sums are compared | The totals stay unchanged |

## Observability
`GET /api/health` reports schema version 21. Audit rows record ledger reads and writes.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 21. That deletes local writes.
