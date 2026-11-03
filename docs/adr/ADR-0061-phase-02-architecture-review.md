# ADR-0061: Phase 02 architecture submitted for review

Status: Proposed
Date: 2026-10-14

## Context
P02-F01 through P02-F05 have engineering acceptance records. Phase 02 is not accepted. ADR-0056 through ADR-0060 record the engineering decisions. This record asks an architecture reviewer to accept or reject that set. It does not approve itself.

## Decision under review
Keep one authorization function, `authorize()`. Tenant and facility context come from the server session. Foundation Flyway remains at V16 with `foundation_meta.schema_version` 15. Chart schema is 32. Dex authenticates workforce passwords. The application enrolls TOTP and passkeys and binds sessions in the chart database. Workforce lifecycle uses existing memberships. Emergency access is a development-only exception inside `authorize()` for `SyntheticRestrictedRecord` / `synthetic.read`. It is not a second policy engine and not a client flag.

Phase 03 owns the broader audit, consent, privacy, and retention ledger. Phase 04 owns clinical resources. Neither is started.

## Consequences if accepted
The engineering shape can remain. Production clinical break-glass stays disabled until a separate clinical and security decision. Unsigned items in the approval register stay open.

## Consequences if rejected
The rejected design stops phase acceptance. Remediation is recorded before any later phase.

## Revisit trigger
An architecture reviewer records APPROVED, CHANGES_REQUESTED, or REJECTED on review `P02-R01`. A coding agent cannot complete that row.
