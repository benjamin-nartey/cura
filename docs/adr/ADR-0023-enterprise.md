# ADR-0023: One local database, no second region

Status: Accepted
Date: 2026-10-08

## Context
Phase 27 asks for SAML/SCIM, customer-managed keys, multi-region placement, data residency, disaster-recovery drills, private connectivity, and API governance. This process has one SQLite file. Connecting an identity provider, a key service, or a second region that is not there would be a production mock.

## Decision
An organization admin can pin residency to `local-sqlite` only. Any other region name is refused. Federation stays `not-connected`, and an endpoint is refused. A customer key stays `not-configured`, and key material is refused. A drill reads this database, stores the elapsed time and schema version, and records failover as `not-run`. The recovery-point and failover-time sentences say those numbers are not calculated. An API grant is `health.read` with status `local-session`. No external credential is issued. `moveTenant` refuses every target. An explain call goes through the AI Gateway and does not change the pin. A fresh seed pins both organizations. An existing database stays unpinned until an admin stores the pin.

## Consequences
Schema version 23 adds the enterprise tables. Rollback is to stop the app and delete `data/curasphere.sqlite`. Copying that file is the only tenant-move procedure, and it stays on this machine.

## Revisit trigger
A second database and an identity provider are actually connected. Until then, failover stays not-run.
