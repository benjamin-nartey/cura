# Tenant and facility context

The server stores the active organization and facility on the session. A request header does not select them.

## Synthetic organizations

DEMO_GH has Accra Central Medical Centre, East Legon Family Clinic, and Madina Diagnostic Centre.

DEMO_EU has Northbridge General Hospital and Riverside Specialist Clinic.

These organizations are fictional. They are stored beside Harborlight and Northwind. Overlapping facility names stay on their own organization.

## Operations

`GET /sessions/{id}/tenancy` returns the organizations, facilities, and service accounts authorized for that session.

`POST /sessions/{id}/tenancy/facility` changes the active facility when the membership is active and the context version matches.

`GET /api/tenancy` on the web app performs the same check against the chart database. It denies a mismatched `X-Organization-Id`.

A directory outage is represented by one row in `tenancy_controls` with `dependency = 'unavailable'`. Clearing that row restores reads.

## Rollback

Take a copy of the chart database before the schema 27 migration. To return to schema 26, restore that copy. Do not delete `data/curasphere.sqlite` in place.

On PostgreSQL, the V16 change is reversed only by restoring the database from the backup taken before Flyway applied `V16__tenancy.sql`. The application refuses a schema version it does not know.

The schema 27 migration runs inside a transaction. If the upgrade statement fails, the version row stays at 26.
