# ADR-0063 — Synthetic retention and legal holds

Status: Proposed as an engineering record. This is not an architecture or legal approval.

## Decision

Retention decisions are calculated in the domain service from versioned synthetic policies. Disposal and archive run only from a stored preview. Execution rechecks the policy version, the record version, and any legal hold before it changes a row. A hold or policy change after the preview invalidates that preview.

The access ledger and consent history are protected categories. The worker cannot dispose of them. Consent withdrawal is not reversed by archive, restore, or hold release.

Production and staging environments refuse destructive execution. The seeded durations are simulation intervals marked `pending_policy_approval`. They are not statutory retention periods.

## Consequences

P03-F04 still owns data-subject access and bulk export. This record does not approve a production retention schedule.
