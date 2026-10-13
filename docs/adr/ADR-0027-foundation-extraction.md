# ADR-0027: Foundation extraction starts on PostgreSQL

Status: Accepted
Date: 2026-10-08

## Context
ADR-0001 kept the chart in a TypeScript process and a local SQLite file because this workspace had no JDK. The revisit trigger was the first hosted deployment or the start of the Kotlin extraction. A JDK can be installed, and PostgreSQL is already answering on localhost. Kafka, Temporal, Envoy, and Iceberg are still not connected. An empty stand-in for any of those would break the rule this slice has followed.

## Decision
`services/foundation` is a Kotlin Spring Boot service. Flyway creates the identity, session, audit, and outbox tables in the local database `curasphere`. The sign-in page reads that directory. Opening a session writes a PostgreSQL session, an audit row, and an outbox row, then still opens the SQLite chart session so existing chart pages keep working. `GET /api/health` keeps the SQLite schema version and adds the foundation status.

The chart domain stays on SQLite. Kafka and Temporal are not started.

The local database password lives in `services/foundation/.env`, which is not committed. The development directory is refused when `curasphere.env` is `production`.

## Consequences
Sign-in needs the foundation service on port 8081. Chart reads still use `data/curasphere.sqlite`. Two session rows exist for one sign-in until each chart module moves. Rollback for the chart is still to stop the app and delete the SQLite file. Rollback for this service is to stop it and drop the local `curasphere` database.

## Revisit trigger
Move the next chart module onto this database, or connect Kafka or Temporal for real. Do not add either as an unused broker.
