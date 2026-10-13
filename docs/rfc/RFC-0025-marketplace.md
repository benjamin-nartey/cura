# RFC: Directory listings

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An organization needs a place to record an administrative listing, a hold review, and a stop, without issuing an OAuth client or running third-party code.

## Goals / non-goals
Goals: a pinned scope, a mandatory hold review, a published compatibility sentence, a not-billed share row, and a stop that does not claim a running process.

Non-goals: a developer portal, an OAuth client, a sandbox tenant, an extension package, a revenue share, and a released app.

## Data flow

```
admin session, purpose OPERATIONS
    |
    v
listing label, scope health.read, risk administrative
    |
    v
auditor session, purpose AUDIT
    hold review, one per listing
    |
    v
share row not-billed
stop sets stopped
release, OAuth, and sandbox => refused
gateway explain => refused, listings unchanged
```

## Proposed design
`POST /api/marketplace/listing`, `/review`, `/share`, `/stop`, `/release`, `/oauth`, `/sandbox`, and `/explain`. Outbox events are `marketplace.listing`, `marketplace.review`, `marketplace.share`, and `marketplace.stop`. A refused release, OAuth call, or sandbox call publishes nothing.

## Compatibility
Listings use schema 24 and scope `health.read`. A listing cannot widen its scope. The published pin is `marketplace-compat-2026.10`. No extension runtime is connected.

## Security and privacy
A clinician cannot open the page. Another organization is not listed. A label that contains a stored name, MRN, or birth date is refused. Secrets and redirect URIs are not stored. Review decision `approved` is refused. The admin who registered the listing cannot sign the review.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician registers a listing | Role must be admin | Amira is forbidden |
| A listing widens its scope | Only `health.read` is accepted | `chart.write` is refused and no row is stored |
| A clinical risk class is stored | Only `administrative` is accepted | `clinical` is refused |
| A client secret is stored | A non-empty secret is refused, and there is no secret column | The OAuth note is thrown |
| A review clears an extension to run | The decision is a hold, and release throws | The status stays reviewed, then stopped |
| A share is treated as a payout | Amount and percent are refused. Status stays not-billed | The ledger reconciliation is unchanged |
| A sandbox tenant is created | `openSandbox` throws | The directory length is unchanged |

## Observability
`GET /api/health` reports schema version 24. Audit rows record listing, review, share, stop, and the refused release, OAuth, and sandbox actions.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 24. That deletes local writes.
