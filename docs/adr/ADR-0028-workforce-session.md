# ADR-0028: The workforce session lives in PostgreSQL

Status: Accepted
Date: 2026-10-08

## Context
ADR-0027 opened a PostgreSQL session and a SQLite session for the same sign-in. Chart pages then trusted the SQLite row. The two rows could diverge, and the foundation session was only a side record.

## Decision
Sign-in writes one session in PostgreSQL. The `cura_session` cookie holds that session id. Each chart request reads the session from the foundation service. Purpose of use is derived there from the role. A session older than 12 hours, or one that has ended, is not readable. Chart rows stay in SQLite. The patient portal keeps its own SQLite session. Kafka and Temporal are not started.

## Consequences
An old SQLite workforce cookie no longer opens the chart. Sign-out ends the PostgreSQL session. Domain tests still open SQLite sessions in memory. Rollback for this change is to stop the foundation service; chart rows are untouched.

## Revisit trigger
Move the next chart table onto PostgreSQL. Do not add Kafka or Temporal as an unused broker.
