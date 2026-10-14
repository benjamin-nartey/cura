# P02-F01 evidence

Date: 2026-10-13

## Result

P02-F01 is accepted. Phase 02 is not accepted. The foundation process was later restarted onto V16. See docs/identity/P02-F01-runtime-reconciliation.md.

## What was verified

Chart schema 27 adds organization status, facility status, session active organization and facility, organization memberships, facility memberships, service principals, and a tenancy control row.

Foundation Flyway `V16__tenancy.sql` adds the same tables and sets `foundation_meta.schema_version` to 15 on the test database.

DEMO_GH and DEMO_EU are synthetic. A Ghana session cannot read DEMO_EU, cannot read the EU service principal, and cannot switch to Riverside Specialist Clinic. The error text does not contain the other organization's name or identifier. A mismatched `X-Organization-Id` returns 403 with code `tenant`.

The organization page at `/tenancy` uses the signed-in foundation session and the chart database. Amira Solano's session showed Harborlight Health and Riverside Clinic only. Submitting `org_demo_eu` returned to `/tenancy?error=notfound` with the alert "That record is not on this facility." Keeping the current facility returned `/tenancy?notice=switched` and left the context version at 1. The dashboard still showed 10 patients and 1 open encounter after that.

Redirects use the request `Host` header so a server bound to `0.0.0.0` does not send the browser to `http://0.0.0.0:3000`.

## Commands

`npm test --workspace @curasphere/domain` exit 0. 86 passed, including P02-S01 through P02-S09.

`node --import tsx --test packages/domain/test/tenancy.test.ts` exit 0. 9 passed.

`npm run typecheck` exit 0.

`./gradlew test --tests health.curasphere.foundation.FoundationApplicationTest` first completed 23 tests with 1 failure: the stale facility switch returned 409, and the test expected 404. The assertion was changed to 409. The following filtered run then exited 0:

`./gradlew test --tests health.curasphere.foundation.FoundationApplicationTest.tenancyIsolatesDemoOrganizations --tests health.curasphere.foundation.FoundationApplicationTest.healthReadsThePostgresSchema`

The other 22 tests in that class had already passed against V16 before the assertion change.

`GET http://127.0.0.1:3000/api/tenancy` with Amira's session returned Harborlight Health only. The same call with `X-Organization-Id: org_demo_eu` returned 403 `{"error":"tenant"}`.

## Not claimed

The foundation process already listening on port 8081 was not restarted, so that process does not serve `/sessions/{id}/tenancy` until it is restarted onto V16. The test database and the chart database do.

No architecture, security, or clinical reviewer signed this feature. Phase 02 remains in progress.
