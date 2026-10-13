# ADR-0029: The patient list is read from PostgreSQL

Status: Accepted
Date: 2026-10-08

## Context
ADR-0028 left every chart table in SQLite. Encounters, observations, and the rest of the chart still reference the SQLite patient row. Moving those tables in one pass would break the running chart. A second unused patient table would break the rule this slice has followed.

## Decision
The patients page reads the registry from the foundation service. The facility comes from the workforce session, not from the browser. Registration is written there, with the audit row and `patient.registered` outbox row in the same transaction. The same id and MRN are then stored in SQLite so the existing chart can open the record. A nurse can read the list and cannot register. An idempotency key that changes its body is refused. Kafka and Temporal are not started.

## Consequences
Foundation schema version is 2. The chart page still reads SQLite. A patient who exists only in SQLite from before this change is not copied, and the live seed matches the five synthetic patients. Rollback for the registry is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Move encounters onto PostgreSQL. Until then, the SQLite patient row remains the parent the chart joins.
