# ADR-0064 — Synthetic DSAR and bulk export

Status: Proposed as an engineering record. This is not a legal or architecture approval.

## Decision

Privacy requests, identity checks, approvals, and exports are calculated in the domain service. An access request does not authorize a download. A bulk request of 1000 or more synthetic records, and every bulk request, needs a second reviewer who is not the requester and not the first reviewer. Exports are private database artifacts with a checksum and an expiry. Download checks the current permission, the authorized downloader, the authority row, and the expiry.

Erasure uses a stored plan and refuses records covered by an active legal hold or a protected category. It does not delete the access ledger or restore withdrawn consent.

The 30-day deadline and the 1000-record threshold are simulation values for `SYNTHETIC_GH_DSAR`, `SYNTHETIC_EU_DSAR`, and `SYNTHETIC_BULK_EXPORT`. They are not statutory periods.

## Consequences

P03-F05 still owns privacy telemetry and scrubbing. This record does not claim GDPR, Act 843, FHIR, or FHIR Bulk Data conformance.
