# ADR-0056: Active tenant context is stored on the server session

Status: Accepted
Date: 2026-10-13

## Context
Workforce users already have one home organization and an optional home facility on `users`. Phase 02 needs a person to belong to more than one organization and to hold a different role at each facility. The chart session still uses the home affiliation for existing clinical reads. A client header must not choose the tenant.

## Decision
Add organization memberships, facility memberships, service principals, and an active organization and facility on the session. The chart database stores this at schema 27. The foundation database stores the same tables in Flyway `V16__tenancy.sql` and sets `foundation_meta.schema_version` to 15. The active context is written only by the server. `X-Organization-Id` is compared with that context and a mismatch is denied. A cross-tenant read returns a generic not-found and does not store the guessed identifier in the audit resource id. Membership role text may be receptionist or laboratory. The `users.role` check stays `clinician`, `nurse`, `auditor`, or `admin`. Switching facility does not rewrite `users.facility_id`. DEMO_GH and DEMO_EU are synthetic organizations added beside Harborlight and Northwind. A disabled organization cannot remain the active context. Service principals are readable only inside their organization.

## Consequences
Existing Harborlight and Northwind users receive a membership backfill from their current row. The sign-in directory lists the synthetic workforce after the foundation process restarts onto V16. Until that restart, the running process on port 8081 does not expose `/sessions/{id}/tenancy`. The web organization page uses the chart database and the foundation session id. Rollback is the procedure in `docs/identity/tenancy.md`.

## Revisit trigger
Replace the chart-database context with the foundation context after the foundation process is restarted on V16. Do not treat membership role names as authorization decisions. That evaluation belongs to P02-F03.
