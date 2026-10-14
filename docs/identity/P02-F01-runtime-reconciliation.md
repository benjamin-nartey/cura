# P02-F01 runtime reconciliation

Date: 2026-10-13

The foundation process that was already listening on port 8081 reported schema version 5. Its database had Flyway versions 1 through 6. That process was stopped without stopping the Gradle daemon. The current foundation application was started again against the same local database.

After restart, `GET /health` returned `schemaVersion` 15 and `store` `postgresql`. Flyway history versions 1 through 16 succeeded, including version 16 tenancy. `foundation_meta.schema_version` was 15. The patient count was 16. Organizations present were `org_demo_eu`, `org_demo_gh`, `org_harborlight`, and `org_northwind`.

A live session for the Ghana administrator returned only Accra Central Medical Centre. `X-Organization-Id: org_demo_eu` returned 403 and did not include the other organization in the body. A stale facility switch returned 409. Amira's encounters returned 200. `GET /dashboard` returned 200. The browser later showed 10 patients and 1 open encounter for Amira Solano at Harborlight Health.

P02-F01 stays accepted. This check did not change its tenancy rules.
