# ADR-0021: The ledger records amounts and does not bill

Status: Accepted
Date: 2026-10-08

## Context
Phase 25 asks for invoices, payments, eligibility, a claims lifecycle, denials, reconciliation, subscription billing, and usage metering. This store has no payer, no clearinghouse, no bank, and no subscription processor. Marking an amount collected, or a claim submitted, would be a production mock.

## Decision
An organization admin with purpose `OPERATIONS` and no facility can open the ledger. A clinician cannot. An invoice stores an integer number of cents with status `recorded`. A payment is also `recorded` and cannot exceed the invoice. The reconciliation sentence is the sum of those stored cents, and it says it is not a bank reconciliation. Eligibility is stored as `not-checked`. A claim is stored as `draft`. A submit attempt records `not-submitted` and leaves the draft in place. No denial is calculated. A subscription plan label stays `not-billed`. Usage is the count of invoice and payment rows. The ledger read returns account ids and MRNs, not problems, medications, or results. An explain call goes through the AI Gateway and does not change a cent.

## Consequences
Schema version 21 adds the revenue tables. An existing Harborlight directory receives Harborlight Admin on the next request. A fresh seed already includes that user. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A payer connection and a clearinghouse exist. Until then, claims stay drafts and amounts stay recorded.
